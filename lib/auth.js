/**
 * Auth helpers:
 *   - Verify Google ID token (OpenID tokeninfo endpoint, no deps needed).
 *   - Sign/verify HS256 JWT for admin session cookie.
 *   - Admin gate (call inside any endpoint that should be admin-only).
 *
 * Env vars used:
 *   - GOOGLE_CLIENT_ID   (required for login)
 *   - JWT_SECRET         (required for session cookie signing)
 *   - ADMIN_EMAILS       (comma-separated, defaults to ashkan.mofidi@gmail.com,mofidi.ash@gmail.com)
 */

const crypto = require('crypto');

const COOKIE_NAME = 'ash_admin';
const COOKIE_MAX_AGE = 60 * 60 * 24;

function adminEmails() {
  const raw = process.env.ADMIN_EMAILS || 'ashkan.mofidi@gmail.com,mofidi.ash@gmail.com';
  return new Set(raw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean));
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}
function b64urlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return Buffer.from(str, 'base64');
}

function signJwt(payload, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const h = b64url(JSON.stringify(header));
  const p = b64url(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', secret).update(`${h}.${p}`).digest();
  return `${h}.${p}.${b64url(sig)}`;
}

function verifyJwt(token, secret) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [h, p, s] = parts;
  const expected = b64url(crypto.createHmac('sha256', secret).update(`${h}.${p}`).digest());
  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(s))) return null;
  try {
    const payload = JSON.parse(b64urlDecode(p).toString('utf8'));
    if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) return null;
    return payload;
  } catch { return null; }
}

function readCookie(req, name) {
  const raw = req.headers.cookie || '';
  const match = raw.split(';').map(s => s.trim()).find(c => c.startsWith(name + '='));
  if (!match) return null;
  return decodeURIComponent(match.slice(name.length + 1));
}

function setSessionCookie(res, token) {
  res.setHeader('Set-Cookie', [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    `Max-Age=${COOKIE_MAX_AGE}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Strict',
  ].join('; '));
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Strict`);
}

async function verifyGoogleIdToken(idToken) {
  try {
    const r = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
    if (!r.ok) return null;
    const data = await r.json();
    const expectedAud = process.env.GOOGLE_CLIENT_ID;
    if (expectedAud && data.aud !== expectedAud) return null;
    if (data.iss !== 'accounts.google.com' && data.iss !== 'https://accounts.google.com') return null;
    if (data.email_verified !== 'true' && data.email_verified !== true) return null;
    if (Math.floor(Date.now() / 1000) > Number(data.exp || 0)) return null;
    return { email: (data.email || '').toLowerCase(), name: data.name || '', picture: data.picture || '' };
  } catch (e) {
    console.error('google_verify_error', e && e.message);
    return null;
  }
}

function requireAdmin(req, res) {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    res.status(503).json({ error: 'auth_not_configured' });
    return null;
  }
  const token = readCookie(req, COOKIE_NAME);
  const payload = verifyJwt(token, secret);
  if (!payload || !payload.email || !adminEmails().has(payload.email.toLowerCase())) {
    res.status(401).json({ error: 'unauthorized' });
    return null;
  }
  return payload;
}

module.exports = {
  adminEmails,
  signJwt,
  verifyJwt,
  readCookie,
  setSessionCookie,
  clearSessionCookie,
  verifyGoogleIdToken,
  requireAdmin,
  COOKIE_NAME,
  COOKIE_MAX_AGE,
};
