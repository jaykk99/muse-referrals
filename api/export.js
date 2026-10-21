// GET /api/export?format=csv|json — download the current code list.
// Serves the cached list (same data as /api/codes, no force param: exports
// never trigger a scrape on their own).
const { getCodes, filterCodes } = require('./_lib/scrape');
const { codesToCSV } = require('./_lib/csv');

module.exports = async (req, res) => {
  try {
    const format = (req.query && req.query.format) || 'csv';
    if (format !== 'csv' && format !== 'json') {
      res.status(400).json({ ok: false, error: 'format must be csv or json' });
      return;
    }
    const result = await getCodes(false);
    const codes = filterCodes(result.codes || [], req.query);
    const stamp = new Date().toISOString().slice(0, 10);
    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="muse-codes-${stamp}.csv"`);
      res.status(200).send(codesToCSV(codes));
    } else {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="muse-codes-${stamp}.json"`);
      res.status(200).json({ ok: true, exportedAt: new Date().toISOString(), count: codes.length, codes });
    }
  } catch (e) {
    res.status(500).json({ ok: false, error: 'export failed: ' + String(e && e.message || e) });
  }
};
