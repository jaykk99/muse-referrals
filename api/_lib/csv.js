// CSV export for referral codes. Pure function, no I/O — testable.
'use strict';

function csvCell(v) {
  const s = String(v == null ? '' : v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

const COLUMNS = ['code', 'source', 'sourceTitle', 'terms', 'foundAt', 'verified', 'seed', 'stale'];

function codesToCSV(codes) {
  const lines = [COLUMNS.join(',')];
  for (const c of codes || []) {
    lines.push(COLUMNS.map((k) => csvCell(c[k])).join(','));
  }
  return lines.join('\r\n') + '\r\n';
}

module.exports = { codesToCSV, COLUMNS };
