import { betterAuth } from 'better-auth';
import { emailOTP } from 'better-auth/plugins';
import { dash } from '@better-auth/infra';
import { sqlite } from './db.js';
import { sendMailSafe } from './mailer.js';

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
      const link = `${CLIENT_ORIGIN}/reset-password?token=${encodeURIComponent(token)}`;
      if (logTokens) {
        console.log(`[auth] Password reset requested for ${user.email}`);
        console.log(`[auth]   Open this link: ${link}`);
      }
      const sent = await sendMailSafe({
        to: user.email,
        subject: 'Reset your YooTerminal password',
        text: `Someone asked to reset the password for your YooTerminal account.\n\nOpen this link within 1 hour to choose a new password:\n${link}\n\nIf you did not request this, you can ignore this email.`,
      });
      if (!sent && !logTokens) {
        console.warn(`[auth] Password reset requested for ${user.email} — email could not be delivered.`);
      }
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
    dash({
      apiKey: process.env.BETTER_AUTH_API_KEY,
    }),
    emailOTP({
      sendVerificationOTP: async ({ email, otp }) => {
        if (logTokens) {
          console.log(`[auth] OTP for ${email}: ${otp}`);
        }
        const sent = await sendMailSafe({
          to: email,
          subject: 'Your YooTerminal sign-in code',
          text: `Your YooTerminal one-time code is: ${otp}\n\nIt expires shortly. If you did not try to sign in, ignore this email.`,
        });
        if (!sent && !logTokens) {
          console.warn(`[auth] OTP requested for ${email} — email could not be delivered.`);
        }
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
