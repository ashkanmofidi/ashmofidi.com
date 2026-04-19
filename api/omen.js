/**
 * GET /api/omen
 * Returns the visitor's omen-of-the-day, sequenced across PST days.
 *
 * Logic:
 *   - Visitor ID = sha256(IP + UA + salt), first 16 chars (hash, not PII).
 *   - Current date = America/Los_Angeles YYYY-MM-DD.
 *   - First visit:    seq=1, date=today. Return omen #1.
 *   - Same PST day:   return the stored omen (same one, all day).
 *   - New PST day:    seq += 1 (wraps at catalog length), date=today. Return next omen.
 *
 * Response:
 *   { day, total, text, returning, sameDay, cycle }
 */
const crypto = require('crypto');
const kv = require('../lib/kv.js');
const { OMENS, TOTAL } = require('../lib/omens.js');

const ALLOWED_ORIGINS = new Set(['https://ashmofidi.com', 'https://www.ashmofidi.com']);

function pstDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

function visitorId(req) {
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
    || req.headers['x-real-ip']
    || (req.socket && req.socket.remoteAddress)
    || 'unknown';
  const ua = (req.headers['user-agent'] || '').slice(0, 256);
  const salt = process.env.HASH_SALT || 'ashmofidi-salt-2026';
  return crypto.createHash('sha256').update(ip + '|' + ua + '|' + salt).digest('hex').slice(0, 16);
}

module.exports = async function handler(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const origin = req.headers.origin || '';
  const referer = req.headers.referer || '';
  const originOk = !origin || ALLOWED_ORIGINS.has(origin) ||
    [...ALLOWED_ORIGINS].some(o => referer.startsWith(o + '/') || referer === o);
  if (!originOk) {
    return res.status(403).json({ error: 'forbidden' });
  }

  const vid = visitorId(req);
  const today = pstDate();

  // Fast path: KV not configured. Still return a deterministic omen so the UX works.
  if (!kv.available()) {
    const dayStr = today.replace(/-/g, '');
    const idx = (Number(dayStr.slice(-4)) + parseInt(vid.slice(0, 6), 16)) % TOTAL;
    return res.status(200).json({
      day: idx + 1,
      total: TOTAL,
      text: OMENS[idx],
      returning: false,
      sameDay: false,
      cycle: 1,
      degraded: true,
    });
  }

  try {
    const seqKey = `omen:v:${vid}:seq`;
    const dateKey = `omen:v:${vid}:date`;
    const [storedSeq, storedDate] = await Promise.all([
      kv.call ? kv.call(['GET', seqKey]) : null,
      kv.call ? kv.call(['GET', dateKey]) : null,
    ]);

    let seq;
    let returning = false;
    let sameDay = false;

    if (!storedSeq || !storedDate) {
      seq = 1;
      returning = false;
      sameDay = false;
      await Promise.all([
        kv.call(['SET', seqKey, '1', 'EX', String(60 * 60 * 24 * 180)]),
        kv.call(['SET', dateKey, today, 'EX', String(60 * 60 * 24 * 180)]),
        kv.incr('omen:total_shown'),
        kv.hincrby('omen:daily:' + today, 'shown', 1),
        kv.hincrby('omen:daily:' + today, 'new_visitors', 1),
      ]);
    } else if (storedDate === today) {
      seq = Math.max(1, parseInt(storedSeq, 10) || 1);
      returning = true;
      sameDay = true;
    } else {
      seq = Math.max(1, parseInt(storedSeq, 10) || 1) + 1;
      returning = true;
      sameDay = false;
      await Promise.all([
        kv.call(['SET', seqKey, String(seq), 'EX', String(60 * 60 * 24 * 180)]),
        kv.call(['SET', dateKey, today, 'EX', String(60 * 60 * 24 * 180)]),
        kv.incr('omen:total_shown'),
        kv.hincrby('omen:daily:' + today, 'shown', 1),
        kv.hincrby('omen:daily:' + today, 'return_visitors', 1),
      ]);
    }

    const cycle = Math.floor((seq - 1) / TOTAL) + 1;
    const idx = (seq - 1) % TOTAL;

    return res.status(200).json({
      day: idx + 1,
      total: TOTAL,
      text: OMENS[idx],
      returning,
      sameDay,
      cycle,
    });
  } catch (e) {
    console.error('omen_error', e && e.message);
    const fallbackIdx = Math.floor(Math.random() * TOTAL);
    return res.status(200).json({
      day: fallbackIdx + 1,
      total: TOTAL,
      text: OMENS[fallbackIdx],
      returning: false,
      sameDay: false,
      cycle: 1,
      degraded: true,
    });
  }
};
