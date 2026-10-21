// GET /api/history — recent scrape runs on this serverless instance.
// In-memory ring buffer (last 20). Each instance keeps its own history;
// the UI labels this honestly.
const { getHistory } = require('./_lib/scrape');

module.exports = async (req, res) => {
  try {
    const history = getHistory();
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json');
    res.status(200).json({
      ok: true,
      count: history.length,
      note: 'per-instance history: each serverless instance tracks its own runs',
      history,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'history failed: ' + String(e && e.message || e) });
  }
};
