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
    const [totals, chipClicks, deepLinks, series, questions, events] = await Promise.all([
      kv.hgetall(`metric:daily:${new Date().toISOString().slice(0,10)}`),
      kv.hgetall('metric:chip_clicks'),
      kv.hgetall('metric:deep_links'),
      dailySeries(30),
      getRecentQuestions(100),
      getRecentEvents(100),
    ]);

    const all = await Promise.all([
      kv.hgetall('metric:total'),
    ]);

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
      totalsAllTime: all[0] || {},
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
