// GET /api/stats — aggregate stats over the cached code list.
// Read-only, served from cache (never triggers a scrape).
const { getCodes, SEED_CODES } = require('./_lib/scrape');

module.exports = async (req, res) => {
  try {
    const result = await getCodes(false);
    const codes = result.codes || [];
    const bySource = {};
    let fresh = 0, stale = 0, seed = 0, withTerms = 0;
    let newest = null, oldest = null;
    for (const c of codes) {
      const key = c.seed ? 'seed list' : (c.sourceTitle || c.source || 'unknown');
      bySource[key] = (bySource[key] || 0) + 1;
      if (c.stale) stale++; else fresh++;
      if (c.seed) seed++;
      if (c.terms && c.terms !== 'terms not stated in post') withTerms++;
      if (c.foundAt) {
        if (!newest || c.foundAt > newest) newest = c.foundAt;
        if (!oldest || c.foundAt < oldest) oldest = c.foundAt;
      }
    }
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    res.setHeader('Content-Type', 'application/json');
    res.status(200).json({
      ok: true,
      total: codes.length,
      fresh, stale, seed,
      withTerms,
      newestFoundAt: newest,
      oldestFoundAt: oldest,
      bySource: Object.entries(bySource)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 25)
        .map(([source, count]) => ({ source, count })),
      seedListSize: SEED_CODES.length,
      cached: !!result.cached,
      fetchedAt: result.fetchedAt,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'stats failed: ' + String(e && e.message || e) });
  }
};
