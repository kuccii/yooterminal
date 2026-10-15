import express from 'express';
import { randomUUID } from 'node:crypto';
import { sqlite } from './db.js';
import { getCaller } from './auth.js';

// ---------------------------------------------------------------------------
// Entity registry — column kinds: text | number | boolean | json
// read:  'public'          anyone can read
//        'own'             signed-in users read only rows tied to them
// write: 'public'          anyone (incl. anonymous checkout)
//        'auth'            any signed-in user (row is stamped created_by_id)
//        'admin'           admin only
//        'ownerOrAdmin'    admin, or caller whose email matches ownerEmailField
//        'creatorOrOwner'  admin, row creator, or caller matching operator_owner_email
// ---------------------------------------------------------------------------

const ENTITIES = {
  Banner: {
    table: 'banner',
    required: ['title'],
    columns: {
      title: 'text', subtitle: 'text', image_url: 'text', cta_label: 'text',
      link_url: 'text', placement: 'text', sort_order: 'number', starts_at: 'text',
      ends_at: 'text', active: 'boolean',
    },
    access: { read: 'public' },
  },
  Booking: {
    table: 'booking',
    required: ['booking_ref', 'trip_key', 'travel_date'],
    columns: {
      booking_ref: 'text', status: 'text', trip_key: 'text', route_slug: 'text',
      travel_date: 'text', origin_city: 'text', destination_city: 'text',
      operator_name: 'text', operator_slug: 'text', operator_owner_email: 'text',
      departure_time: 'text', duration_minutes: 'number', bus_class: 'text',
      seats: 'json', passengers: 'json', passenger_count: 'number',
      contact_name: 'text', contact_email: 'text', contact_phone: 'text',
      amount: 'number', currency: 'text', coupon_code: 'text', discount_amount: 'number',
      commission_percent: 'number', platform_fee: 'number', operator_net: 'number',
      payment_provider: 'text', payment_ref: 'text', payment_tx_id: 'text', paid_at: 'text',
      validated: 'boolean', validated_at: 'text', validated_by: 'text', cancelled_at: 'text',
      refund_status: 'text', refund_tx_id: 'text', cancelled_by: 'text', group_ref: 'text',
    },
    access: { read: 'own', create: 'admin', update: 'creatorOrOwner', delete: 'admin' },
  },
  Bus: {
    table: 'bus',
    required: ['operator_slug', 'plate'],
    columns: {
      operator_slug: 'text', operator_name: 'text', owner_email: 'text', plate: 'text',
      model: 'text', bus_class: 'text', seats_total: 'number', seat_layout: 'text',
      amenities: 'json', status: 'text', notes: 'text',
    },
    hiddenPublic: ['owner_email'],
    access: {
      read: 'public', create: 'ownerOrAdmin', update: 'ownerOrAdmin', delete: 'ownerOrAdmin',
      ownerEmailField: 'owner_email',
    },
  },
  City: {
    table: 'city',
    required: ['name', 'slug', 'country'],
    columns: {
      name: 'text', slug: 'text', country: 'text', station_name: 'text',
      station_address: 'text', description: 'text', image_url: 'text', featured: 'boolean',
    },
    access: { read: 'public' },
  },
  Coupon: {
    table: 'coupon',
    required: ['code', 'discount_value'],
    columns: {
      code: 'text', description: 'text', discount_type: 'text', discount_value: 'number',
      min_amount: 'number', currency: 'text', expires_at: 'text', active: 'boolean',
    },
    access: { read: 'admin' },
  },
  DepartureSeat: {
    table: 'departure_seat',
    required: ['trip_key', 'travel_date', 'seats'],
    columns: {
      trip_key: 'text', travel_date: 'text', route_slug: 'text', operator_slug: 'text',
      operator_name: 'text', departure_time: 'text', seats: 'json', seat_count: 'number',
    },
    hidden: ['holder_id', 'created_by_id'],
    access: { read: 'public', create: 'admin', update: 'admin', delete: 'admin' },
  },
  Operator: {
    table: 'operator',
    required: ['name', 'slug'],
    columns: {
      name: 'text', slug: 'text', country: 'text', description: 'text', brand_color: 'text',
      fleet: 'text', founded_year: 'number', phone: 'text', amenities: 'json',
      rating: 'number', review_count: 'number', featured: 'boolean', status: 'text',
      commission_percent: 'number', owner_email: 'text',
    },
    hiddenPublic: ['owner_email'],
    access: { read: 'public' },
  },
  PlatformSetting: {
    table: 'platform_setting',
    required: [],
    columns: {
      default_commission_percent: 'number', cross_border_commission_percent: 'number',
      payout_note: 'text',
    },
    access: { read: 'public' },
  },
  Review: {
    table: 'review',
    required: ['operator_slug', 'rating', 'comment'],
    columns: {
      operator_slug: 'text', operator_name: 'text', author_name: 'text', rating: 'number',
      comment: 'text', route_label: 'text', travel_date: 'text', status: 'text',
    },
    access: { read: 'public' },
  },
  Route: {
    table: 'route',
    required: ['slug', 'origin_city', 'destination_city'],
    columns: {
      slug: 'text', origin_city: 'text', destination_city: 'text', origin_slug: 'text',
      destination_slug: 'text', distance_km: 'number', duration_minutes: 'number',
      crossing_border: 'boolean', border_post: 'text', stops: 'json', description: 'text',
      image_url: 'text', from_price: 'number', currency: 'text', popular: 'boolean',
    },
    access: { read: 'public' },
  },
  Schedule: {
    table: 'schedule',
    required: ['route_slug', 'operator_slug', 'departure_time', 'price'],
    columns: {
      route_slug: 'text', origin_city: 'text', destination_city: 'text',
      operator_name: 'text', operator_slug: 'text', owner_email: 'text',
      operator_status: 'text', departure_time: 'text', duration_minutes: 'number',
      price: 'number', currency: 'text', peak_surcharge_percent: 'number',
      bus_class: 'text', seats_total: 'number', seat_layout: 'text', bus_plate: 'text',
      amenities: 'json', active: 'boolean',
    },
    hiddenPublic: ['owner_email'],
    access: {
      read: 'public', create: 'ownerOrAdmin', update: 'ownerOrAdmin', delete: 'ownerOrAdmin',
      ownerEmailField: 'owner_email',
    },
  },
};

// Columns present on every table but not part of any entity's payload map.
// The frontend sorts by created_date and filters by created_by_id, so these
// must be filterable/sortable while staying unwritable through create/update.
const SYSTEM_COLUMNS = { id: 'text', created_date: 'text', created_by_id: 'text' };

const MAX_LIMIT = 1000;
const DEFAULT_LIMIT = 100;

// Fields a non-admin owner/operator may never change on update (a listed
// field can only be written when it equals the stored value).
const WRITE_PROTECTED = {
  Booking: {
    booking_ref: 'admin', trip_key: 'admin', route_slug: 'admin', travel_date: 'admin',
    origin_city: 'admin', destination_city: 'admin', operator_name: 'admin', operator_slug: 'admin',
    operator_owner_email: 'admin', departure_time: 'admin', duration_minutes: 'admin', bus_class: 'admin',
    seats: 'admin', passengers: 'admin', passenger_count: 'admin', amount: 'admin', currency: 'admin',
    coupon_code: 'admin', discount_amount: 'admin', commission_percent: 'admin', platform_fee: 'admin',
    operator_net: 'admin', payment_provider: 'admin', payment_ref: 'admin', payment_tx_id: 'admin',
    paid_at: 'admin', status: 'admin', group_ref: 'admin',
  },
  Operator: {
    status: 'admin', commission_percent: 'admin', owner_email: 'admin', slug: 'admin',
    featured: 'admin', rating: 'admin',
  },
  Schedule: {
    operator_status: 'admin', owner_email: 'admin', route_slug: 'admin',
    operator_slug: 'admin', operator_name: 'admin',
  },
  Bus: { owner_email: 'admin', operator_slug: 'admin', operator_name: 'admin' },
};

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const isAdmin = (caller) => Boolean(caller && caller.role === 'admin');

// ---------------------------------------------------------------------------
// Row encode/decode — SQLite stores booleans as 0/1 and arrays/objects as JSON
// ---------------------------------------------------------------------------
function decodeRow(entity, row, caller = null) {
  if (!row) return null;
  const out = { ...row };
  for (const [field, kind] of Object.entries(entity.columns)) {
    const value = out[field];
    if (value === null || value === undefined) continue;
    if (kind === 'boolean') out[field] = Boolean(value);
    else if (kind === 'json') {
      try {
        out[field] = JSON.parse(value);
      } catch {
        out[field] = null;
      }
    } else if (kind === 'number') out[field] = Number(value);
  }
  for (const field of entity.hidden || []) delete out[field];
  if (!isAdmin(caller)) {
    for (const field of entity.hiddenPublic || []) {
      const value = out[field];
      const ownerMatch = caller && value
        && String(caller.email || '').toLowerCase() === String(value).toLowerCase();
      if (!ownerMatch) delete out[field];
    }
  }
  return out;
}

function encodeValue(kind, value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (kind === 'boolean') return value ? 1 : 0;
  if (kind === 'json') return JSON.stringify(value);
  if (kind === 'number') return Number(value);
  return String(value);
}

// ---------------------------------------------------------------------------
// Filter -> SQL. Supports equality, $in, $ne, $gt/$gte/$lt/$lte, $regex
// (with optional $options, e.g. { $regex: 'BL', $options: 'i' }) and $or.
// ---------------------------------------------------------------------------
function buildWhere(entity, filter, params) {
  if (!filter || typeof filter !== 'object') return '';
  const clauses = [];

  for (const [key, raw] of Object.entries(filter)) {
    if (raw === undefined) continue;

    if (key === '$or') {
      if (!Array.isArray(raw) || !raw.length) continue;
      const subClauses = raw
        .map((sub) => buildWhere(entity, sub, params))
        .filter(Boolean)
        .map((sql) => `(${sql})`);
      if (subClauses.length) clauses.push(`(${subClauses.join(' OR ')})`);
      continue;
    }

    const kind = entity.columns[key] || SYSTEM_COLUMNS[key];
    if (!kind) throw new HttpError(400, `Unknown filter field: ${key}`);

    if (raw !== null && typeof raw === 'object' && !Array.isArray(raw)) {
      for (const [op, opValue] of Object.entries(raw)) {
        switch (op) {
          case '$in': {
            if (!Array.isArray(opValue) || !opValue.length) {
              clauses.push('1 = 0');
              break;
            }
            const placeholders = opValue.map((value) => {
              params.push(encodeValue(kind, value));
              return '?';
            });
            clauses.push(`"${key}" IN (${placeholders.join(', ')})`);
            break;
          }
          case '$ne':
            params.push(encodeValue(kind, opValue));
            clauses.push(`("${key}" IS NULL OR "${key}" != ?)`);
            break;
          case '$gt':
          case '$gte':
          case '$lt':
          case '$lte': {
            const sqlOp = { $gt: '>', $gte: '>=', $lt: '<', $lte: '<=' }[op];
            params.push(encodeValue(kind, opValue));
            clauses.push(`"${key}" ${sqlOp} ?`);
            break;
          }
          case '$regex': {
            // SQLite resolves `"col" REGEXP ?` to the regexp() hook in db.js.
            // Pattern + $options flags travel as one JSON-encoded param so no
            // separator characters can collide with user input.
            const flags = typeof raw.$options === 'string' ? raw.$options.replace(/[^imsuy]/g, '') : '';
            params.push(JSON.stringify({ pattern: opValue === null || opValue === undefined ? '' : String(opValue), flags }));
            clauses.push(`"${key}" REGEXP ?`);
            break;
          }
          case '$options':
            // Only meaningful alongside $regex, which consumes it above.
            break;
          default:
            throw new HttpError(400, `Unsupported filter operator: ${op}`);
        }
      }
      continue;
    }

    if (raw === null) {
      clauses.push(`"${key}" IS NULL`);
      continue;
    }
    params.push(encodeValue(kind, raw));
    clauses.push(`"${key}" = ?`);
  }

  return clauses.join(' AND ');
}

function parseSort(entity, sort) {
  if (!sort) return '';
  const desc = sort.startsWith('-');
  const field = desc ? sort.slice(1) : sort;
  if (!entity.columns[field] && !SYSTEM_COLUMNS[field]) {
    throw new HttpError(400, `Unknown sort field: ${field}`);
  }
  return ` ORDER BY "${field}" ${desc ? 'DESC' : 'ASC'}`;
}

// ---------------------------------------------------------------------------
// Authorization
// ---------------------------------------------------------------------------
function readScopeSql(entity, caller, params) {
  if (entity.access.read === 'admin') {
    if (!caller) throw new HttpError(401, 'Sign in required');
    if (!isAdmin(caller)) throw new HttpError(403, 'Admin only');
    return '';
  }
  if (entity.access.read !== 'own') return '';
  if (isAdmin(caller)) return '';
  if (!caller) throw new HttpError(401, 'Sign in required');
  params.push(caller.id, caller.email);
  return `(created_by_id = ? OR operator_owner_email = ?)`;
}

/** AND the read-scope clause onto a WHERE fragment (either may be empty). */
function withReadScope(entity, caller, params, where) {
  const scope = readScopeSql(entity, caller, params);
  if (!scope) return where;
  return where ? `${where} AND ${scope}` : scope;
}

function parseFilterParam(raw) {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
    return parsed;
  } catch {
    throw new HttpError(400, 'Invalid filter JSON');
  }
}

function sameValue(a, b) {
  if (a !== null && typeof a === 'object') return JSON.stringify(a) === JSON.stringify(b);
  return String(a ?? '') === String(b ?? '');
}

function assertFieldWriteAllowed(entityName, caller, payload, existing) {
  if (isAdmin(caller)) return;
  const rules = WRITE_PROTECTED[entityName];
  if (!rules) return;
  for (const field of Object.keys(rules)) {
    if (payload[field] === undefined) continue;
    if (!sameValue(existing[field], payload[field])) {
      throw new HttpError(403, 'Only admins can change this field');
    }
  }
}

function assertWriteAllowed(entity, caller, { payload = null, existing = null, action }) {
  const rule = entity.access[action] || 'admin';
  if (rule === 'public') return;
  if (!caller) throw new HttpError(401, 'Sign in required');
  if (isAdmin(caller)) return;
  if (rule === 'auth') return;

  const ownerEmail = (payload && (payload[entity.access.ownerEmailField] || payload.operator_owner_email))
    || (existing && (existing[entity.access.ownerEmailField] || existing.operator_owner_email));

  if (rule === 'ownerOrAdmin') {
    if (ownerEmail && ownerEmail.toLowerCase() === caller.email.toLowerCase()) return;
    throw new HttpError(403, 'You do not own this record');
  }
  if (rule === 'creatorOrOwner') {
    if (existing && existing.created_by_id === caller.id) return;
    if (ownerEmail && ownerEmail.toLowerCase() === caller.email.toLowerCase()) return;
    throw new HttpError(403, 'You do not have access to this record');
  }
  throw new HttpError(403, 'Admin only');
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------
function listHandler(entity) {
  return (req, res) => {
    const caller = req.caller;
    const filter = parseFilterParam(req.query.filter);
    const limit = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, MAX_LIMIT);
    const fields = req.query.fields ? String(req.query.fields).split(',').filter(Boolean) : null;

    const params = [];
    const where = withReadScope(entity, caller, params, buildWhere(entity, filter, params));

    const sql = `SELECT * FROM "${entity.table}"${where ? ` WHERE ${where}` : ''}`
      + parseSort(entity, req.query.sort) + ' LIMIT ?';
    params.push(limit);

    const rows = sqlite.prepare(sql).all(...params).map((row) => decodeRow(entity, row, caller));
    const items = fields
      ? rows.map((row) => Object.fromEntries(
        Object.entries(row).filter(([key]) => key === 'id' || fields.includes(key)),
      ))
      : rows;
    res.json({ items, count: items.length });
  };
}

function getHandler(entity) {
  return (req, res) => {
    const params = [req.params.id];
    const where = withReadScope(entity, req.caller, params, 'id = ?');
    const row = sqlite.prepare(`SELECT * FROM "${entity.table}" WHERE ${where}`).get(...params);
    if (!row) throw new HttpError(404, 'Not found');
    res.json(decodeRow(entity, row, req.caller));
  };
}

function createHandler(entity) {
  return (req, res) => {
    const caller = req.caller;
    assertWriteAllowed(entity, caller, { payload: req.body || {}, action: 'create' });

    const payload = { ...(req.body || {}) };
    for (const field of entity.required) {
      if (payload[field] === undefined || payload[field] === null || payload[field] === '') {
        throw new HttpError(400, `Missing required field: ${field}`);
      }
    }

    const id = randomUUID();
    const columns = ['id', 'created_date', 'created_by_id'];
    const values = [id, new Date().toISOString(), caller ? caller.id : null];

    for (const [field, kind] of Object.entries(entity.columns)) {
      if (payload[field] === undefined) continue;
      columns.push(field);
      values.push(encodeValue(kind, payload[field]));
    }

    const placeholders = columns.map(() => '?').join(', ');
    sqlite
      .prepare(`INSERT INTO "${entity.table}" (${columns.map((c) => `"${c}"`).join(', ')}) VALUES (${placeholders})`)
      .run(...values);

    const row = sqlite.prepare(`SELECT * FROM "${entity.table}" WHERE id = ?`).get(id);
    res.json(decodeRow(entity, row, caller));
  };
}

function updateHandler(entity) {
  return (req, res) => {
    const raw = sqlite.prepare(`SELECT * FROM "${entity.table}" WHERE id = ?`).get(req.params.id);
    if (!raw) throw new HttpError(404, 'Not found');
    const existing = decodeRow(entity, raw, req.caller);
    assertWriteAllowed(entity, req.caller, { payload: req.body || {}, existing, action: 'update' });
    assertFieldWriteAllowed(entity.name, req.caller, req.body || {}, existing);

    const payload = { ...(req.body || {}) };
    delete payload.id;
    delete payload.created_date;
    delete payload.created_by_id;

    const sets = [];
    const values = [];
    for (const [field, kind] of Object.entries(entity.columns)) {
      if (payload[field] === undefined) continue;
      sets.push(`"${field}" = ?`);
      values.push(encodeValue(kind, payload[field]));
    }
    if (sets.length) {
      values.push(req.params.id);
      sqlite.prepare(`UPDATE "${entity.table}" SET ${sets.join(', ')} WHERE id = ?`).run(...values);
    }
    const row = sqlite.prepare(`SELECT * FROM "${entity.table}" WHERE id = ?`).get(req.params.id);
    res.json(decodeRow(entity, row, req.caller));
  };
}

function deleteHandler(entity) {
  return (req, res) => {
    const existing = sqlite.prepare(`SELECT * FROM "${entity.table}" WHERE id = ?`).get(req.params.id);
    if (!existing) throw new HttpError(404, 'Not found');
    assertWriteAllowed(entity, req.caller, { existing, action: 'delete' });
    sqlite.prepare(`DELETE FROM "${entity.table}" WHERE id = ?`).run(req.params.id);
    res.json({ success: true });
  };
}

function updateManyHandler(entity) {
  return (req, res) => {
    const { filter = {}, update = {} } = req.body || {};
    const $set = update.$set || update;
    if (!$set || typeof $set !== 'object') throw new HttpError(400, 'Missing $set payload');

    const params = [];
    const where = withReadScope(entity, req.caller, params, buildWhere(entity, filter, params));

    const rows = sqlite.prepare(`SELECT * FROM "${entity.table}"${where ? ` WHERE ${where}` : ''}`).all(...params);
    let updated = 0;
    for (const raw of rows) {
      const existing = decodeRow(entity, raw, req.caller);
      assertWriteAllowed(entity, req.caller, { payload: $set, existing, action: 'update' });
      assertFieldWriteAllowed(entity.name, req.caller, $set, existing);
      const sets = [];
      const values = [];
      for (const [field, kind] of Object.entries(entity.columns)) {
        if ($set[field] === undefined) continue;
        sets.push(`"${field}" = ?`);
        values.push(encodeValue(kind, $set[field]));
      }
      if (sets.length) {
        values.push(existing.id);
        sqlite.prepare(`UPDATE "${entity.table}" SET ${sets.join(', ')} WHERE id = ?`).run(...values);
        updated += 1;
      }
    }
    res.json({ updated });
  };
}

function aggregateHandler(entity) {
  return (req, res) => {
    const { query = {}, groupBy = null, sum = [], avg = null, sort = null, limit = null } = req.body || {};
    const sumFields = (Array.isArray(sum) ? sum : sum ? [sum] : []);
    const avgFields = (Array.isArray(avg) ? avg : avg ? [avg] : []);

    for (const field of [...sumFields, ...avgFields]) {
      if (!entity.columns[field] || entity.columns[field] !== 'number') {
        throw new HttpError(400, `Cannot aggregate non-numeric field: ${field}`);
      }
    }
    if (groupBy && !entity.columns[groupBy]) throw new HttpError(400, `Unknown groupBy field: ${groupBy}`);

    const params = [];
    const where = withReadScope(entity, req.caller, params, buildWhere(entity, query, params));

    const selects = [groupBy ? `"${groupBy}"` : null, 'COUNT(*) AS count'];
    for (const field of sumFields) selects.push(`SUM("${field}") AS "sum_${field}"`);
    for (const field of avgFields) selects.push(`AVG("${field}") AS "avg_${field}"`);

    let sql = `SELECT ${selects.filter(Boolean).join(', ')} FROM "${entity.table}"`;
    if (where) sql += ` WHERE ${where}`;
    if (groupBy) sql += ` GROUP BY "${groupBy}"`;

    if (sort) {
      const desc = sort.startsWith('-');
      const field = desc ? sort.slice(1) : sort;
      const valid = [groupBy, ...sumFields.map((f) => `sum_${f}`), ...avgFields.map((f) => `avg_${f}`), 'count']
        .filter(Boolean);
      const key = valid.includes(field) ? field : (valid.includes(sort) ? sort : null);
      if (!key) throw new HttpError(400, `Unknown aggregate sort field: ${sort}`);
      sql += ` ORDER BY "${key}" ${desc ? 'DESC' : 'ASC'}`;
    }
    if (groupBy && limit) sql += ` LIMIT ${Math.min(Number(limit) || MAX_LIMIT, MAX_LIMIT)}`;

    const rows = sqlite.prepare(sql).all(...params);
    res.json({ rows });
  };
}

export function createEntityRouter() {
  for (const [name, entity] of Object.entries(ENTITIES)) entity.name = name;

  const router = express.Router();

  router.use((req, res, next) => {
    getCaller(req)
      .then((caller) => {
        req.caller = caller;
        next();
      })
      .catch(next);
  });

  router.post('/:name/aggregate', (req, res, next) => {
    const entity = ENTITIES[req.params.name];
    if (!entity) return next();
    return aggregateHandler(entity)(req, res);
  });

  router.post('/:name/update-many', (req, res, next) => {
    const entity = ENTITIES[req.params.name];
    if (!entity) return next();
    return updateManyHandler(entity)(req, res);
  });

  router.get('/:name', (req, res, next) => {
    const entity = ENTITIES[req.params.name];
    if (!entity) return next();
    return listHandler(entity)(req, res);
  });

  router.get('/:name/:id', (req, res, next) => {
    const entity = ENTITIES[req.params.name];
    if (!entity) return next();
    return getHandler(entity)(req, res);
  });

  router.post('/:name', (req, res, next) => {
    const entity = ENTITIES[req.params.name];
    if (!entity) return next();
    return createHandler(entity)(req, res);
  });

  router.patch('/:name/:id', (req, res, next) => {
    const entity = ENTITIES[req.params.name];
    if (!entity) return next();
    return updateHandler(entity)(req, res);
  });

  router.delete('/:name/:id', (req, res, next) => {
    const entity = ENTITIES[req.params.name];
    if (!entity) return next();
    return deleteHandler(entity)(req, res);
  });

  return router;
}

export { ENTITIES, HttpError };
