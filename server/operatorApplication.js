// Operator self-signup rules.
//
// A signup creates an operator row in `pending` status and upgrades the
// caller's `app_user.role` to `operator`. Public surfaces already filter
// schedules by `operator_status = 'approved'`, so a pending company can set
// itself up without anything reaching a customer.
//
// Helpers take a SQLite handle rather than importing the app database so they
// can be exercised against an in-memory schema.

import { randomUUID } from 'node:crypto';

export const COUNTRIES = ['Uganda', 'Rwanda'];

const COMPANY_NAME_MIN = 2;
const COMPANY_NAME_MAX = 120;
const PHONE_MAX = 32;
const DEFAULT_BRAND_COLOR = '#0f766e';

function fail(status, message) {
  return Object.assign(new Error(message), { status });
}

/**
 * @param {{ company_name?: unknown, phone?: unknown, country?: unknown }} input
 * @returns {{ company_name: string, phone: string, country: string }}
 */
export function validateOperatorApplication(input = {}) {
  const company_name = String(input.company_name ?? '').trim();
  if (company_name.length < COMPANY_NAME_MIN || company_name.length > COMPANY_NAME_MAX) {
    throw fail(400, `Company name must be ${COMPANY_NAME_MIN}-${COMPANY_NAME_MAX} characters`);
  }

  const phone = String(input.phone ?? '').trim();
  if (!phone) throw fail(400, 'A contact phone number is required');
  if (phone.length > PHONE_MAX) throw fail(400, `Phone number must be at most ${PHONE_MAX} characters`);

  const country = String(input.country ?? '').trim();
  if (!COUNTRIES.includes(country)) throw fail(400, 'Country must be Uganda or Rwanda');

  return { company_name, phone, country };
}

/**
 * @param {string} name
 * @param {(slug: string) => boolean} isTaken
 * @param {string} [fallback]
 * @returns {string}
 */
export function uniqueOperatorSlug(name, isTaken, fallback = 'operator') {
  const base = String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || fallback;

  let candidate = base;
  let suffix = 2;
  while (isTaken(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

/**
 * @param {string} currentRole
 * @returns {string}
 */
export function roleAfterApplication(currentRole) {
  return currentRole === 'user' ? 'operator' : currentRole;
}

/**
 * @param {import('better-sqlite3').Database} sqlite
 * @param {{ id: string|number, email: string, role: string }} caller
 * @param {{ company_name?: unknown, phone?: unknown, country?: unknown }} input
 * @returns {{ role: string, operator: { id: string, name: string, slug: string, status: string }, created: boolean }}
 */
export function applyOperatorApplication(sqlite, caller, input) {
  const email = String(caller?.email || '').trim().toLowerCase();
  if (!email) throw fail(400, 'This account has no email address');

  const fields = validateOperatorApplication(input);

  const existing = sqlite
    .prepare('SELECT id, name, slug, status FROM operator WHERE lower(owner_email) = ? ORDER BY created_date ASC LIMIT 1')
    .get(email);

  let operator;
  let created = false;

  if (existing) {
    operator = existing;
  } else {
    const slug = uniqueOperatorSlug(
      fields.company_name,
      (candidate) => Boolean(sqlite.prepare('SELECT 1 FROM operator WHERE slug = ?').get(candidate)),
      email.split('@')[0],
    );
    const id = randomUUID();
    sqlite
      .prepare(
        `INSERT INTO operator
           (id, name, slug, country, phone, status, owner_email, brand_color, created_date, created_by_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        fields.company_name,
        slug,
        fields.country,
        fields.phone,
        'pending',
        email,
        DEFAULT_BRAND_COLOR,
        new Date().toISOString(),
        caller.id === undefined || caller.id === null ? null : String(caller.id),
      );
    operator = { id, name: fields.company_name, slug, status: 'pending' };
    created = true;
  }

  const currentRole = String(caller.role || 'user');
  const role = roleAfterApplication(currentRole);

  if (currentRole === 'user') {
    sqlite
      .prepare("UPDATE app_user SET role = 'operator', updated_date = ? WHERE id = ? AND role = 'user'")
      .run(new Date().toISOString(), caller.id);
  }

  return { role, operator, created };
}
