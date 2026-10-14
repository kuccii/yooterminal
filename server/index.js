import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { toNodeHandler } from 'better-auth/node';
import { auth, googleEnabled } from './auth.js';
import { createEntityRouter, HttpError } from './entities.js';
import { createPaymentsRouter } from './payments.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3001;

const app = express();
app.disable('x-powered-by');

// Better Auth handles everything under /api/auth itself. Mounted before
// express.json() so it can read the raw request body.
app.all('/api/auth/*splat', toNodeHandler(auth));

app.use(express.json());

app.get('/api/config', (req, res) => {
  res.json({
    google: googleEnabled,
    flutterwavePublicKey: process.env.FLW_PUBLIC_KEY || '',
  });
});

app.use('/api/entities', createEntityRouter());
app.use('/api/payments', createPaymentsRouter());

// Unknown /api routes → 404 JSON (never the SPA).
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Production build, if present.
const dist = path.join(__dirname, '..', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.use((req, res, next) => {
    if (req.method !== 'GET') return next();
    return res.sendFile(path.join(dist, 'index.html'));
  });
}

 
app.use((err, req, res, next) => {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message });
  }
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }
   
  console.error('[server]', err);
  return res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`[server] API listening on http://localhost:${PORT}`);
  if (!googleEnabled) {
    console.log('[server] Google sign-in disabled (set GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET to enable).');
  }
  if (!process.env.FLW_SECRET_KEY || !process.env.FLW_PUBLIC_KEY) {
    console.log('[server] Flutterwave keys not set — online payments disabled (FLW_PUBLIC_KEY / FLW_SECRET_KEY).');
  }
});
