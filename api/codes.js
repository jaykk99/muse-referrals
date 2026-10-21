// GET /api/codes[?force=1][&fresh=1][&q=text] — cached referral codes, newest first.
// force=1 refreshes past the 30-min TTL but never bypasses the 60s scrape throttle.
// fresh=1 drops stale (>14d) codes; q= filters by code/source/terms/context.
const { getCodes, filterCodes } = require('./_lib/scrape');

module.exports = async (req, res) => {
  try {
    const force = req.query && req.query.force === '1';
    const result = await getCodes(force);
    const codes = filterCodes(result.codes, req.query);
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    res.setHeader('Content-Type', 'application/json');
    res.status(200).json({ ok: true, count: codes.length, ...result, codes });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'scrape failed: ' + String(e && e.message || e) });
  }
};
