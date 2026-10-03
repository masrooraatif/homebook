import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './db.js';
import { auth, authRoutes } from './auth.js';
import api from './routes.js';

const app = express();
const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');

app.disable('x-powered-by');
if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || 1);

app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'same-origin',
    'Content-Security-Policy': [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      'font-src https://fonts.gstatic.com',
      "img-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  });
  next();
});

app.use(express.json({ limit: '100kb' }));
app.use(express.static(publicDir, { extensions: ['html'] }));

app.use('/api', authRoutes);
app.use('/api', auth, api);
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const known = Number.isInteger(err.status) && err.status < 500;
  if (!known) console.error(err);
  res.status(known ? err.status : 500).json({
    error: known ? err.message : 'Something went wrong on the server. Please try again.',
  });
});

const port = Number(process.env.PORT ?? 3000);

try {
  await pool.query('SELECT 1');
} catch (err) {
  console.error(`\nCould not connect to MySQL: ${err.message}`);
  console.error('Check the DB_* values in .env and that you ran "npm run db:init".\n');
  process.exit(1);
}

app.listen(port, '0.0.0.0', () => {
  console.log(`Homebook is running on http://localhost:${port}`);
});
