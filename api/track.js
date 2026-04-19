/**
 * POST /api/track
 * Body: { type: 'pageview' | 'chip_click' | 'deep_link' | 'api_fallback' | 'ask_submit', meta?: object }
 *
 * Records engagement events to KV. Rate-limited per IP to prevent abuse.
 */
const kv = require('../lib/kv.js');
const crypto = require('crypto');

const ALLOWED_TYPES = new Set(['pageview', 'chip_click', 'deep_link', 'api_fallback', 'ask_submit', 'ask_answered']);
const ALLOWED_ORIGINS = new Set(['https://ashmofidi.com', 'https://www.ashmofidi.com']);

const RATE_MAX = 60;
const RATE_WINDOW = 60 * 1000;
const buckets = new Map();

function ipKey(req) {
  const fwd = (req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return fwd || req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown';
}

function rateLimited(req) {
  const k = ipKey(req);
  const now = Date.now();
  const b = buckets.get(k) || { c: 0, r: now + RATE_WINDOW };
  if (now > b.r) { b.c = 0; b.r = now + RATE_WINDOW; }
  b.c += 1;
  buckets.set(k, b);
  if (buckets.size > 5000) { for (const [kk, vv] of buckets) if (vv.r < now) buckets.delete(kk); }
  return b.c > RATE_MAX;
}

function hashIp(ip) {
  const salt = process.env.HASH_SALT || 'ashmofidi-salt-2026';
  return crypto.createHash('sha256').update(ip + '|' + salt).digest('hex').slice(0, 12);
}

function todayKey() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

module.exports = async function handler(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'method_not_allowed' }); }

  const origin = req.headers.origin || '';
  const referer = req.headers.referer || '';
  const originOk = !origin || ALLOWED_ORIGINS.has(origin) ||
    [...ALLOWED_ORIGINS].some(o => referer.startsWith(o + '/') || referer === o);
  if (!originOk) return res.status(403).json({ error: 'forbidden' });

  if (rateLimited(req)) return res.status(429).json({ error: 'rate_limited' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};

  const type = typeof body.type === 'string' ? body.type : '';
  if (!ALLOWED_TYPES.has(type)) return res.status(400).json({ error: 'invalid_type' });

  const meta = (body.meta && typeof body.meta === 'object') ? body.meta : {};

  if (!kv.available()) return res.status(200).json({ ok: true, logged: false });

  const now = Date.now();
  const ipHash = hashIp(ipKey(req));
  const uaShort = (req.headers['user-agent'] || '').slice(0, 120);

  try {
    await Promise.all([
      kv.incr(`metric:events:total`),
      kv.incr(`metric:events:${type}`),
      kv.hincrby(`metric:daily:${todayKey()}`, type, 1),
      kv.sadd(`metric:visitors:${todayKey()}`, ipHash).then(() => kv.expire(`metric:visitors:${todayKey()}`, 60 * 60 * 24 * 40)),
    ]);

    if (type === 'chip_click' && meta.key) {
      await kv.hincrby('metric:chip_clicks', String(meta.key).slice(0, 40), 1);
    }
    if (type === 'deep_link' && meta.q) {
      await kv.hincrby('metric:deep_links', String(meta.q).slice(0, 40), 1);
    }
    if (type === 'pageview') {
      await kv.lpush('feed:events', JSON.stringify({ t: 'pv', ts: now, ip: ipHash, ref: (meta.ref || '').slice(0, 200), path: (meta.path || '').slice(0, 80) }));
      await kv.ltrim('feed:events', 0, 499);
    }
  } catch (e) {
    console.error('track_error', e && e.message);
  }

  return res.status(200).json({ ok: true });
};
