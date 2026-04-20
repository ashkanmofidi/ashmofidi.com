/**
 * GET /api/stats
 * Returns dashboard data. Admin-gated via JWT cookie set by /api/auth?action=login.
 */
const { requireAdmin } = require('../lib/auth.js');
const kv = require('../lib/kv.js');

async function getRecentQuestions(limit = 100) {
  const raw = await kv.lrange('chat:log', 0, limit - 1);
  return raw.map(s => { try { return JSON.parse(s); } catch { return null; } }).filter(Boolean);
}

async function getRecentEvents(limit = 100) {
  const raw = await kv.lrange('feed:events', 0, limit - 1);
  return raw.map(s => { try { return JSON.parse(s); } catch { return null; } }).filter(Boolean);
}

async function dailySeries(days = 30) {
  const out = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400000);
    const key = d.toISOString().slice(0, 10);
    const [daily, visitors] = await Promise.all([
      kv.hgetall(`metric:daily:${key}`),
      kv.scard(`metric:visitors:${key}`),
    ]);
    out.push({
      date: key,
      questions: Number(daily && daily.ask_answered) || 0,
      refusals: Number(daily && daily.ask_refused) || 0,
      chipClicks: Number(daily && daily.chip_click) || 0,
      deepLinks: Number(daily && daily.deep_link) || 0,
      pageviews: Number(daily && daily.pageview) || 0,
      visitors: Number(visitors) || 0,
    });
  }
  return out;
}

// Count unique visitors over the last N days via Redis set-union.
async function uniqueVisitorsOverDays(days) {
  const keys = [];
  const now = new Date();
  for (let i = 0; i < days; i++) {
    const d = new Date(now.getTime() - i * 86400000);
    keys.push(`metric:visitors:${d.toISOString().slice(0, 10)}`);
  }
  const tmp = `tmp:uniqv:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
  try {
    await kv.sunionstore(tmp, ...keys);
    const count = await kv.scard(tmp);
    await kv.del(tmp);
    return count;
  } catch (e) { return 0; }
}

module.exports = async function handler(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const admin = requireAdmin(req, res);
  if (!admin) return;

  if (!kv.available()) {
    return res.status(200).json({
      kvAvailable: false,
      message: 'Connect Vercel Marketplace "Upstash Redis" to enable analytics.',
      totals: {}, series: [], questions: [], events: [], chipClicks: {}, deepLinks: {},
    });
  }

  try {
    const todayKey = new Date().toISOString().slice(0,10);
    const [
      totals,
      chipClicks,
      deepLinks,
      series,
      questions,
      events,
      uniqueToday,
      uniqueAllTime,
      unique7d,
      unique30d,
      totalAllTime,
    ] = await Promise.all([
      kv.hgetall(`metric:daily:${todayKey}`),
      kv.hgetall('metric:chip_clicks'),
      kv.hgetall('metric:deep_links'),
      dailySeries(30),
      getRecentQuestions(100),
      getRecentEvents(100),
      kv.scard(`metric:visitors:${todayKey}`),
      kv.scard('metric:visitors:all_time'),
      uniqueVisitorsOverDays(7),
      uniqueVisitorsOverDays(30),
      kv.hgetall('metric:total'),
    ]);

    // Returning-visitor rate: of today's visitors, how many were already in the all-time set before today?
    // Approximation: today's visitors minus (all-time count - prior all-time count) = returning count.
    // For simplicity, compute as: today visitors who also appeared in any of the prior 30 days.
    const returning30d = Math.max(0, uniqueToday + (unique30d - uniqueAllTime) + (uniqueAllTime - unique30d) - (unique30d));

    return res.status(200).json({
      kvAvailable: true,
      admin: { email: admin.email, name: admin.name || '' },
      today: {
        questions: Number(totals && totals.ask_answered) || 0,
        refusals: Number(totals && totals.ask_refused) || 0,
        chipClicks: Number(totals && totals.chip_click) || 0,
        deepLinks: Number(totals && totals.deep_link) || 0,
        pageviews: Number(totals && totals.pageview) || 0,
      },
      visitors: {
        uniqueToday: Number(uniqueToday) || 0,
        unique7d: Number(unique7d) || 0,
        unique30d: Number(unique30d) || 0,
        uniqueAllTime: Number(uniqueAllTime) || 0,
      },
      totalsAllTime: totalAllTime || {},
      chipClicks,
      deepLinks,
      series,
      questions,
      events,
    });
  } catch (e) {
    console.error('stats_error', e && e.message);
    return res.status(500).json({ error: 'internal' });
  }
};
