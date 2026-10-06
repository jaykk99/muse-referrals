// GET /api/scrape — force a fresh scrape (rate-limited: never more than once a minute).
const { getCodes } = require('./_lib/scrape');

module.exports = async (req, res) => {
  try {
    const result = await getCodes(true);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json');
    if (result.throttled) {
      const retryAfter = Math.max(1, Math.ceil((result.retryAfterMs || 0) / 1000));
      res.setHeader('Retry-After', String(retryAfter));
      res.status(429).json({
        ok: false,
        error: 'scrape rate limit: try again in ' + retryAfter + 's',
        retryAfter,
        count: result.codes.length,
        codes: result.codes,
        fetchedAt: result.fetchedAt,
      });
      return;
    }
    res.status(200).json({ ok: true, count: result.codes.length, ...result });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'scrape failed: ' + String(e && e.message || e) });
  }
};
