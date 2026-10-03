import crypto from 'node:crypto';
import { Router } from 'express';

// Optional single-password protection. Set APP_PASSWORD in .env to turn it on.
const PASSWORD = process.env.APP_PASSWORD ?? '';
const SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const COOKIE = 'hb_session';
const MAX_AGE_S = 60 * 60 * 24 * 30;

const sign = (v) => crypto.createHmac('sha256', SECRET).update(String(v)).digest('base64url');
const digest = (s) => crypto.createHash('sha256').update(String(s)).digest();

function makeToken() {
  const exp = Date.now() + MAX_AGE_S * 1000;
  return `${exp}.${sign(exp)}`;
}
function validToken(token) {
  if (!token) return false;
  const [exp, sig] = token.split('.');
  if (!exp || !sig) return false;
  const a = Buffer.from(sig);
  const b = Buffer.from(sign(exp));
  return a.length === b.length && crypto.timingSafeEqual(a, b) && Number(exp) > Date.now();
}
function readCookies(req) {
  return Object.fromEntries(
    (req.headers.cookie ?? '')
      .split(';')
      .map((p) => p.trim().split(/=(.*)/s).slice(0, 2))
      .filter(([k]) => k),
  );
}

const attempts = new Map(); // ip -> { count, resetAt }
function tooManyAttempts(ip) {
  const now = Date.now();
  const rec = attempts.get(ip);
  if (!rec || rec.resetAt < now) return false;
  return rec.count >= 10;
}
function recordFailure(ip) {
  const now = Date.now();
  const rec = attempts.get(ip);
  if (!rec || rec.resetAt < now) attempts.set(ip, { count: 1, resetAt: now + 15 * 60 * 1000 });
  else rec.count += 1;
}

export function auth(req, res, next) {
  if (!PASSWORD) return next();
  if (validToken(readCookies(req)[COOKIE])) return next();
  res.status(401).json({ error: 'Sign in required' });
}

export const authRoutes = Router();

authRoutes.get('/session', (req, res) => {
  res.json({
    authRequired: Boolean(PASSWORD),
    authenticated: !PASSWORD || validToken(readCookies(req)[COOKIE]),
  });
});

authRoutes.post('/login', (req, res) => {
  if (!PASSWORD) return res.json({ ok: true });
  if (tooManyAttempts(req.ip)) {
    return res.status(429).json({ error: 'Too many attempts. Try again in a few minutes.' });
  }
  const given = digest(req.body?.password ?? '');
  if (!crypto.timingSafeEqual(given, digest(PASSWORD))) {
    recordFailure(req.ip);
    return res.status(401).json({ error: 'That password is not right.' });
  }
  res.cookie(COOKIE, makeToken(), {
    httpOnly: true,
    sameSite: 'lax',
    secure: req.secure,
    maxAge: MAX_AGE_S * 1000,
    path: '/',
  });
  res.json({ ok: true });
});

authRoutes.post('/logout', (req, res) => {
  res.clearCookie(COOKIE, { path: '/' });
  res.json({ ok: true });
});
