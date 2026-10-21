// Tests for: annotateCodes (stale labeling), scrape history, /api/history,
// /api/export (csv/json), and the CSV builder. No network: scrapers stubbed.
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const lib = require('../api/_lib/scrape');
const { getCodes, annotateCodes, getHistory, SEED_CODES } = lib;
const T = lib._test;
const { codesToCSV } = require('../api/_lib/csv');

const DAY = 86400000;
const NOW = Date.now();

function codeRow(code, ageDays) {
  return { code, source: 's', sourceTitle: 't',
           foundAt: new Date(NOW - ageDays * DAY).toISOString() };
}

function fakeRes() {
  return { statusCode: 0, headers: {}, body: null,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    status(n) { this.statusCode = n; return this; },
    json(o) { this.body = o; return this; },
    send(s) { this.body = s; return this; } };
}

// ---------------------------------------------------------------------------
test('annotateCodes marks >14d codes stale with ageDays', () => {
  const out = annotateCodes([codeRow('AA1BB2', 0), codeRow('CC3DD4', 20)], NOW);
  const fresh = out.find((c) => c.code === 'AA1BB2');
  const old = out.find((c) => c.code === 'CC3DD4');
  assert.equal(fresh.stale, false);
  assert.equal(fresh.ageDays, 0);
  assert.equal(old.stale, true);
  assert.equal(old.ageDays, 20);
});

test('seed codes (2026-10-01) annotate as stale — honestly old', () => {
  const out = annotateCodes(SEED_CODES);
  assert.ok(out.every((c) => c.stale === true));
});

test('getCodes annotates results with stale flags', async () => {
  T.setScrapeImpl(async () => [codeRow('ZZ9ZZ9', 30)]);
  T.resetCache(); T.resetHistory();
  const r = await getCodes(true);
  const c = r.codes.find((x) => x.code === 'ZZ9ZZ9');
  assert.ok(c);
  assert.equal(c.stale, true);
});

// ---------------------------------------------------------------------------
test('successful scrape records a history entry with stats', async () => {
  T.setScrapeImpl(async () => ({ codes: [codeRow('HH1HH1', 0)],
    stats: { pullpush: { ok: true, ms: 5, found: 1 }, bing: { ok: true, ms: 7, found: 0 } } }));
  T.resetCache(); T.resetHistory();
  await getCodes(true);
  const h = getHistory();
  assert.equal(h.length, 1);
  assert.equal(h[0].ok, true);
  assert.equal(h[0].found, 1);
  assert.ok(h[0].ms >= 0);
  assert.equal(h[0].stats.pullpush.found, 1);
  assert.ok(h[0].at);
});

test('failed scrape records ok:false with error, keeps old cache', async () => {
  T.setScrapeImpl(async () => { throw new Error('net down'); });
  T.resetCache(); T.resetHistory();
  const r = await getCodes(false); // cold cache, scrape fails -> seeds
  assert.ok(r.codes.length > 0);
  const h = getHistory();
  assert.equal(h.length, 1);
  assert.equal(h[0].ok, false);
  assert.match(h[0].error, /net down/);
});

test('history ring buffer caps at 20 entries', async () => {
  T.setScrapeImpl(async () => []);
  T.resetCache(); T.resetHistory();
  for (let i = 0; i < 25; i++) {
    T.cache().fetchedAt = 0; // force cold so every call scrapes
    await getCodes(true);
  }
  assert.equal(getHistory().length, 20);
});

test('getCodes passes through {codes, stats} impl results into history', async () => {
  const { scrapeAllWithStats } = lib;
  assert.equal(typeof scrapeAllWithStats, 'function');
  T.setScrapeImpl(async () => ({ codes: [], stats: { pullpush: { ok: false, ms: 0, found: 0, error: 'x' } } }));
  T.resetCache(); T.resetHistory();
  await getCodes(true);
  const h = getHistory();
  assert.equal(h[0].stats.pullpush.ok, false);
  assert.equal(h[0].stats.pullpush.error, 'x');
});

// ---------------------------------------------------------------------------
test('/api/history returns recorded runs', async () => {
  const handler = require('../api/history');
  T.setScrapeImpl(async () => [codeRow('QQ1QQ1', 0)]);
  T.resetCache(); T.resetHistory();
  await getCodes(true);
  const res = fakeRes();
  await handler({}, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.count, 1);
  assert.equal(res.body.history[0].found, 1);
  assert.match(res.body.note, /per-instance/);
});

// ---------------------------------------------------------------------------
test('codesToCSV builds a header + escaped rows', () => {
  const csv = codesToCSV([
    { code: 'AB1CD2', source: 'https://x.test/a', sourceTitle: 'T', terms: '1B tokens', foundAt: '2026-10-20T00:00:00.000Z', verified: false, seed: false, stale: false },
    { code: 'EF3GH4', source: 'https://x.test/b', sourceTitle: 'Quote "hi", comma, here', terms: null, foundAt: '2026-10-20T00:00:00.000Z', verified: false, seed: true, stale: true },
  ]);
  const lines = csv.split('\r\n');
  assert.equal(lines[0], 'code,source,sourceTitle,terms,foundAt,verified,seed,stale');
  assert.ok(lines[1].startsWith('AB1CD2,https://x.test/a,'));
  assert.ok(lines[2].includes('"Quote ""hi"", comma, here"'));
  assert.ok(csv.endsWith('\r\n'));
});

test('codesToCSV handles empty input', () => {
  assert.equal(codesToCSV([]), 'code,source,sourceTitle,terms,foundAt,verified,seed,stale\r\n');
});

// ---------------------------------------------------------------------------
test('/api/export?format=csv downloads the cached list without scraping', async () => {
  const handler = require('../api/export');
  let calls = 0;
  T.setScrapeImpl(async () => { calls++; return [codeRow('WW1WW1', 0)]; });
  T.resetCache(); T.resetHistory();
  await getCodes(true); // prime cache: 1 scrape
  assert.equal(calls, 1);

  const res = fakeRes();
  await handler({ query: { format: 'csv' } }, res);
  assert.equal(res.statusCode, 200);
  assert.match(res.headers['content-type'], /text\/csv/);
  assert.match(res.headers['content-disposition'], /attachment; filename="muse-codes-.*\.csv"/);
  assert.ok(res.body.includes('WW1WW1'));
  assert.equal(calls, 1, 'export must not trigger a scrape');
});

test('/api/export?format=json returns annotated codes', async () => {
  const handler = require('../api/export');
  T.setScrapeImpl(async () => []);
  T.resetCache(); T.resetHistory();
  const res = fakeRes();
  await handler({ query: { format: 'json' } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.ok(res.body.count > 0); // seed fallback
  assert.ok('stale' in res.body.codes[0]);
  assert.match(res.headers['content-disposition'], /\.json"/);
});

test('/api/export rejects bad format', async () => {
  const handler = require('../api/export');
  const res = fakeRes();
  await handler({ query: { format: 'xml' } }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.ok, false);
});

// ---------------------------------------------------------------------------
test('annotateCodes boundary: 14 days is fresh, 14d+1ms is stale', () => {
  const ms14 = 14 * DAY;
  const out = annotateCodes([
    { code: 'AA1BB2', foundAt: new Date(NOW - ms14).toISOString() },
    { code: 'CC3DD4', foundAt: new Date(NOW - ms14 - 1).toISOString() },
  ], NOW);
  assert.equal(out.find((c) => c.code === 'AA1BB2').stale, false);
  assert.equal(out.find((c) => c.code === 'CC3DD4').stale, true);
});

test('annotateCodes handles missing foundAt as very old', () => {
  const out = annotateCodes([{ code: 'XX1XX1' }], NOW);
  assert.equal(out[0].stale, true);
});

// ---------------------------------------------------------------------------
test('/api/stats aggregates fresh/stale/seed and top sources', async () => {
  const handler = require('../api/stats');
  T.setScrapeImpl(async () => [
    { code: 'FRESH1', source: 'https://a.test/', sourceTitle: 'A', foundAt: new Date(NOW).toISOString(), terms: '1B tokens' },
    { code: 'OLD2X3', source: 'https://b.test/', sourceTitle: 'B', foundAt: new Date(NOW - 30 * DAY).toISOString() },
  ]);
  T.resetCache(); T.resetHistory();
  const res = fakeRes();
  await handler({}, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.total, 2);
  assert.equal(res.body.fresh, 1);
  assert.equal(res.body.stale, 1);
  assert.equal(res.body.withTerms, 1);
  assert.equal(res.body.bySource.length, 2);
  assert.ok(res.headers['cache-control'].includes('s-maxage=300'));
});

test('/api/stats on cold cache falls back to seeds', async () => {
  const handler = require('../api/stats');
  T.setScrapeImpl(async () => { throw new Error('down'); });
  T.resetCache(); T.resetHistory();
  const res = fakeRes();
  await handler({}, res);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.total, SEED_CODES.length);
  assert.equal(res.body.seed, SEED_CODES.length);
  assert.equal(res.body.stale, SEED_CODES.length);
});

// ---------------------------------------------------------------------------
test('merge order: fresh scrape results merge into cache without dupes', async () => {
  T.setScrapeImpl(async () => [
    { code: 'DUP123', source: 's1', sourceTitle: 't', foundAt: new Date(NOW).toISOString() },
  ]);
  T.resetCache(); T.resetHistory();
  const r1 = await getCodes(true);
  T.cache().fetchedAt = 0; // force another scrape returning the same code
  const r2 = await getCodes(true);
  const codes = r2.codes.filter((c) => c.code === 'DUP123');
  assert.equal(codes.length, 1, 'same code must not duplicate across scrapes');
  assert.ok(r1.codes.length >= 1 && r2.codes.length >= 1);
});

test('history entries are newest-first', async () => {
  T.setScrapeImpl(async () => []);
  T.resetCache(); T.resetHistory();
  await getCodes(true);
  T.cache().fetchedAt = 0;
  await new Promise((r) => setTimeout(r, 5));
  await getCodes(true);
  const h = getHistory();
  assert.equal(h.length, 2);
  assert.ok(new Date(h[0].at) >= new Date(h[1].at));
});

// ---------------------------------------------------------------------------
test('filterCodes: fresh=1 drops stale codes', () => {
  const rows = [
    { code: 'FRESH1', stale: false },
    { code: 'OLD222', stale: true },
  ];
  const out = lib.filterCodes(rows, { fresh: '1' });
  assert.deepEqual(out.map((c) => c.code), ['FRESH1']);
  assert.equal(lib.filterCodes(rows, {}).length, 2);
});

test('filterCodes: q matches code, source, terms, context (case-insensitive)', () => {
  const rows = [
    { code: 'AB1CD2', sourceTitle: 'Reddit post', terms: '1B tokens', context: 'hello world' },
    { code: 'EF3GH4', sourceTitle: 'Blog', terms: 'none', context: 'nothing' },
  ];
  assert.deepEqual(lib.filterCodes(rows, { q: 'ab1cd2' }).map((c) => c.code), ['AB1CD2']);
  assert.deepEqual(lib.filterCodes(rows, { q: 'reddit' }).map((c) => c.code), ['AB1CD2']);
  assert.deepEqual(lib.filterCodes(rows, { q: '1b TOKENS' }).map((c) => c.code), ['AB1CD2']);
  assert.deepEqual(lib.filterCodes(rows, { q: 'hello' }).map((c) => c.code), ['AB1CD2']);
  assert.equal(lib.filterCodes(rows, { q: 'zzz' }).length, 0);
  // fresh + q combine
  const mixed = [
    { code: 'AB1CD2', stale: true, sourceTitle: 'Reddit', terms: '', context: '' },
    { code: 'AB1CD3', stale: false, sourceTitle: 'Reddit', terms: '', context: '' },
  ];
  assert.deepEqual(lib.filterCodes(mixed, { fresh: '1', q: 'reddit' }).map((c) => c.code), ['AB1CD3']);
});

test('/api/codes honors fresh=1 and q=', async () => {
  const handler = require('../api/codes');
  T.setScrapeImpl(async () => [
    { code: 'FRESH1', source: 's', sourceTitle: 'Reddit gems', terms: '1B tokens',
      foundAt: new Date(Date.now()).toISOString() },
    { code: 'OLD222', source: 's', sourceTitle: 'Old blog', terms: '',
      foundAt: new Date(Date.now() - 30 * DAY).toISOString() },
  ]);
  T.resetCache(); T.resetHistory();
  const res = fakeRes();
  await handler({ query: { fresh: '1', q: 'reddit' } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.count, 1);
  assert.equal(res.body.codes[0].code, 'FRESH1');
});

test('/api/export?format=csv&fresh=1 exports only fresh codes', async () => {
  const handler = require('../api/export');
  T.setScrapeImpl(async () => [
    { code: 'FRESH1', source: 's', sourceTitle: 't', foundAt: new Date(Date.now()).toISOString() },
    { code: 'OLD222', source: 's', sourceTitle: 't', foundAt: new Date(Date.now() - 30 * DAY).toISOString() },
  ]);
  T.resetCache(); T.resetHistory();
  const res = fakeRes();
  await handler({ query: { format: 'csv', fresh: '1' } }, res);
  assert.equal(res.statusCode, 200);
  assert.ok(res.body.includes('FRESH1'));
  assert.ok(!res.body.includes('OLD222'));
});
