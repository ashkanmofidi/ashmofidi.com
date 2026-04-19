/**
 * Thin wrapper over Upstash Redis REST API.
 * Auto-provisioned env vars when you install the Vercel Marketplace integration:
 *   - KV_REST_API_URL
 *   - KV_REST_API_TOKEN
 * If those aren't set, every call returns null and the caller no-ops gracefully.
 */

const URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';

function available() { return Boolean(URL && TOKEN); }

async function call(args) {
  if (!available()) return null;
  try {
    const r = await fetch(URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(args),
    });
    if (!r.ok) return null;
    const data = await r.json();
    return data.result;
  } catch (e) {
    console.error('kv_error', e && e.message);
    return null;
  }
}

async function incr(key) { return call(['INCR', key]); }
async function lpush(key, value) { return call(['LPUSH', key, typeof value === 'string' ? value : JSON.stringify(value)]); }
async function ltrim(key, start, stop) { return call(['LTRIM', key, String(start), String(stop)]); }
async function lrange(key, start, stop) {
  const r = await call(['LRANGE', key, String(start), String(stop)]);
  return Array.isArray(r) ? r : [];
}
async function llen(key) {
  const r = await call(['LLEN', key]);
  return typeof r === 'number' ? r : 0;
}
async function hincrby(key, field, n = 1) { return call(['HINCRBY', key, field, String(n)]); }
async function hgetall(key) {
  const r = await call(['HGETALL', key]);
  if (!r) return {};
  if (Array.isArray(r)) {
    const out = {};
    for (let i = 0; i < r.length; i += 2) out[r[i]] = r[i + 1];
    return out;
  }
  return r;
}
async function sadd(key, member) { return call(['SADD', key, member]); }
async function scard(key) { const r = await call(['SCARD', key]); return typeof r === 'number' ? r : 0; }
async function expire(key, seconds) { return call(['EXPIRE', key, String(seconds)]); }

module.exports = { available, incr, lpush, ltrim, lrange, llen, hincrby, hgetall, sadd, scard, expire };
