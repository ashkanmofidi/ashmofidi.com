/**
 * POST /api/auth?action=login   body: { credential: "<Google ID token>" }
 * POST /api/auth?action=logout
 * GET  /api/auth?action=me      -> returns { email, admin } if session valid
 */
const {
  verifyGoogleIdToken,
  signJwt,
  setSessionCookie,
  clearSessionCookie,
  readCookie,
  verifyJwt,
  adminEmails,
  COOKIE_NAME,
  COOKIE_MAX_AGE,
} = require('../lib/auth.js');

module.exports = async function handler(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');

  const action = (req.query && req.query.action) || '';

  if (action === 'config' && req.method === 'GET') {
    return res.status(200).json({
      googleClientId: process.env.GOOGLE_CLIENT_ID || '',
    });
  }

  if (action === 'me' && req.method === 'GET') {
    const secret = process.env.JWT_SECRET || '';
    const token = readCookie(req, COOKIE_NAME);
    const payload = verifyJwt(token, secret);
    if (!payload) return res.status(200).json({ email: null, admin: false });
    const isAdmin = adminEmails().has((payload.email || '').toLowerCase());
    return res.status(200).json({ email: payload.email, admin: isAdmin });
  }

  if (action === 'logout' && req.method === 'POST') {
    clearSessionCookie(res);
    return res.status(200).json({ ok: true });
  }

  if (action === 'login' && req.method === 'POST') {
    const secret = process.env.JWT_SECRET;
    if (!secret || !process.env.GOOGLE_CLIENT_ID) {
      return res.status(503).json({ error: 'auth_not_configured' });
    }
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
    body = body || {};
    const idToken = typeof body.credential === 'string' ? body.credential : '';
    if (!idToken) return res.status(400).json({ error: 'missing_credential' });

    const info = await verifyGoogleIdToken(idToken);
    if (!info) return res.status(401).json({ error: 'invalid_token' });

    if (!adminEmails().has(info.email)) {
      return res.status(403).json({ error: 'not_admin' });
    }

    const now = Math.floor(Date.now() / 1000);
    const jwt = signJwt({
      sub: info.email,
      email: info.email,
      name: info.name,
      iat: now,
      exp: now + COOKIE_MAX_AGE,
    }, secret);
    setSessionCookie(res, jwt);
    return res.status(200).json({ ok: true, email: info.email, name: info.name });
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'method_not_allowed' });
};
