// Tests for the referral-code scraper lib + rate-limit behavior.
// Run: npm test  (node --test). No network: the live scraper is stubbed.
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const lib = require('../api/_lib/scrape');
const { getCodes, extractCodes, detectTerms, SEED_CODES } = lib;
const T = lib._test;

// ---------------------------------------------------------------------------
test('extractCodes finds mixed 6-char codes near keywords', () => {
  const hits = extractCodes('grab your invite code 56Y5KC to redeem 1B tokens on Muse');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].code, '56Y5KC');
});

test('extractCodes ignores blocklist words, pure letters, pure digits, and keyword-free text', () => {
  assert.equal(extractCodes('click REDEEM to claim your INVITE now').length, 0);
  assert.equal(extractCodes('ABCDEF invite code redeem').length, 0); // letters only
  assert.equal(extractCodes('123456 invite code redeem').length, 0); // digits only
  assert.equal(extractCodes('serial number ABC123 for the device').length, 0); // no keywords
});

test('detectTerms picks up token terms and usage counts', () => {
  assert.match(detectTerms('Get 1 billion tokens, redeem within 48 hours, ~30 uses both sides'), /1B tokens/);
  assert.match(detectTerms('nothing relevant here'), /terms not stated/);
});

// ---------------------------------------------------------------------------
test('force=1 skips TTL but NOT the 60s throttle (bypass closed)', async () => {
  let calls = 0;
  T.setScrapeImpl(async () => { calls++; return [{ code: 'ZZ9ZZ9', source: 's', sourceTitle: 't', foundAt: '2026-10-01T00:00:00.000Z' }]; });
  T.resetCache();

  const r1 = await getCodes(true);
  assert.equal(calls, 1);
  assert.equal(r1.cached, false);
  assert.ok(r1.codes.some((c) => c.code === 'ZZ9ZZ9'));

  // Immediate second forced scrape: must NOT scrape again.
  const r2 = await getCodes(true);
  assert.equal(calls, 1, 'force=1 must not bypass the throttle');
  assert.equal(r2.throttled, true);
  assert.equal(r2.cached, true);
  assert.ok(r2.retryAfterMs > 0 && r2.retryAfterMs <= T.MIN_INTERVAL_MS);
});

test('force=1 refreshes past the TTL (scrapes again when stale)', async () => {
  let calls = 0;
  T.setScrapeImpl(async () => { calls++; return []; });
  T.resetCache();
  await getCodes(true);
  assert.equal(calls, 1);
  // Age the cache past TTL (TTL is 30min; throttle is 60s — both elapse).
  T.cache().fetchedAt = Date.now() - (T.TTL_MS + 1000);
  const r = await getCodes(true);
  assert.equal(calls, 2, 'stale cache + force should scrape again');
  assert.ok(!r.throttled);
});

test('non-force serves cache inside TTL without scraping', async () => {
  let calls = 0;
  T.setScrapeImpl(async () => { calls++; return [{ code: 'AA1BB2', source: 's', sourceTitle: 't', foundAt: '2026-10-01T00:00:00.000Z' }]; });
  T.resetCache();
  await getCodes(true); // primes cache, fetchedAt=now
  const r = await getCodes(false);
  assert.equal(calls, 1);
  assert.equal(r.cached, true);
  assert.ok(!r.throttled);
});

test('concurrent scrape returns inProgress instead of double-scraping', async () => {
  let calls = 0;
  T.setScrapeImpl(async () => { calls++; await new Promise((r) => setTimeout(r, 50)); return []; });
  T.resetCache();
  const p1 = getCodes(true);
  await new Promise((r) => setTimeout(r, 10));
  const r2 = await getCodes(true);
  await p1;
  assert.equal(calls, 1);
  assert.equal(r2.inProgress, true);
});

test('cold cache with failing scraper falls back to seed codes', async () => {
  T.setScrapeImpl(async () => { throw new Error('boom'); });
  T.resetCache();
  const r = await getCodes(false);
  assert.ok(r.codes.length > 0);
  assert.ok(r.codes.every((c) => c.seed === true));
  assert.equal(r.codes.length, SEED_CODES.length);
});

// ---------------------------------------------------------------------------
test('/api/scrape returns 429 + Retry-After when throttled', async () => {
  const handler = require('../api/scrape');
  let calls = 0;
  T.setScrapeImpl(async () => { calls++; return []; });
  T.resetCache();

  const fakeRes = () => {
    const s = { statusCode: 0, headers: {}, body: null,
      setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
      status(n) { this.statusCode = n; return this; },
      json(o) { this.body = o; return this; } };
    return s;
  };

  // First hit: proceeds (cold cache), not throttled.
  const r1 = fakeRes();
  await handler({}, r1);
  assert.equal(r1.statusCode, 200);

  // Second hit within the minute: throttled.
  const r2 = fakeRes();
  await handler({}, r2);
  assert.equal(r2.statusCode, 429);
  assert.ok(Number(r2.headers['retry-after']) > 0);
  assert.match(r2.body.error, /rate limit/);
});

test('/api/codes honors ?force=1 without crashing and returns code list', async () => {
  const handler = require('../api/codes');
  T.setScrapeImpl(async () => { throw new Error('net down'); });
  T.resetCache();
  const res = { statusCode: 0, headers: {},
    setHeader() {}, status(n) { this.statusCode = n; return this; },
    json(o) { this.body = o; return this; } };
  await handler({ query: { force: '1' } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.ok(res.body.count > 0); // seed fallback
});
