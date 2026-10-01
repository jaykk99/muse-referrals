// GET /api/scrape — force a fresh scrape (rate-limited to once a minute).
const { getCodes } = require('./_lib/scrape');

module.exports = async (req, res) => {
  try {
    const result = await getCodes(true);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json');
    res.status(200).json({ ok: true, count: result.codes.length, ...result });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'scrape failed: ' + String(e && e.message || e) });
  }
};
