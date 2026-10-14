import { betterAuth } from 'better-auth';
import { emailOTP } from 'better-auth/plugins';
import { sqlite } from './db.js';

if (!process.env.BETTER_AUTH_SECRET) {
  console.error(
    '[server] BETTER_AUTH_SECRET is not set. Set it in the process environment (pm2 env / shell) and restart. Refusing to start.',
  );
  process.exit(1);
}

const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
const EXTRA_ORIGINS = (process.env.TRUSTED_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

export const googleEnabled = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

// Never print OTPs or reset links in production or on the live server.
// Local dev can opt in with AUTH_LOG_TOKENS=1.
const logTokens = process.env.AUTH_LOG_TOKENS === '1';

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL || 'http://localhost:3001',
  basePath: '/api/auth',
  // The Vite dev server proxies /api but keeps its own origin; allow it plus
  // any extra origins listed in TRUSTED_ORIGINS (comma separated).
  trustedOrigins: [CLIENT_ORIGIN, ...EXTRA_ORIGINS],
  database: sqlite,
  emailAndPassword: {
    enabled: true,
    sendResetPassword: async ({ user, token }) => {
      if (!logTokens) {
        console.warn(`[auth] Password reset requested for ${user.email} — no email provider configured (set AUTH_LOG_TOKENS=1 in dev to print the link).`);
        return;
      }
      const link = `${CLIENT_ORIGIN}/reset-password?token=${encodeURIComponent(token)}`;
      console.log(`[auth] Password reset requested for ${user.email}`);
      console.log(`[auth]   Open this link: ${link}`);
    },
  },
  ...(googleEnabled
    ? {
      socialProviders: {
        google: {
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        },
      },
    }
    : {}),
  user: {
    additionalFields: {
      role: { type: 'string', defaultValue: 'user', input: false },
    },
  },
  plugins: [
    emailOTP({
      sendVerificationOTP: async ({ email, otp }) => {
        if (!logTokens) {
          console.warn(`[auth] OTP requested for ${email} — no email provider configured (set AUTH_LOG_TOKENS=1 in dev to print the code).`);
          return;
        }
        console.log(`[auth] OTP for ${email}: ${otp}`);
      },
    }),
  ],
});

/** Resolve the signed-in user for a request, or null. */
export async function getCaller(req) {
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session || !session.user) return null;
    return {
      id: session.user.id,
      email: session.user.email,
      role: session.user.role || 'user',
      name: session.user.name || '',
    };
  } catch {
    return null;
  }
}
