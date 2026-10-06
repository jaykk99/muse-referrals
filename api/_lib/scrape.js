// Shared scraper for the Muse referral aggregator.
// Keyless public sources only:
//   1. pullpush.io — public Reddit submission archive API (no key)
//   2. Bing HTML search — parse result links, fetch pages, extract codes
// Rate-limited, cached, never attempts redemption.
'use strict';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const TTL_MS = 30 * 60 * 1000; // serve cache for 30 min
const MIN_INTERVAL_MS = 60 * 1000; // never scrape more than once a minute

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Seed codes: publicly posted codes found via public web search on 2026-10-01.
// Marked seed:true. These were posted publicly; none are verified valid.
// ---------------------------------------------------------------------------
const SEED_CODES = [
  { code: '56Y5KC', source: 'https://medium.com/@mudassir.gcs/muse-ai-referral-code-2026-get-1-billion-free-tokens-how-to-redeem-84d948617e8b', sourceTitle: 'Muse AI Referral Code (2026): Get 1 Billion Free Tokens — Medium', terms: '1B tokens both sides; redeem within 48h of signup' },
  { code: 'FWD2PH', source: 'https://medium.com/@liuruichao555/muse-ai-referral-code-2026-get-1-billion-free-tokens-how-to-redeem-ae4920b66082', sourceTitle: 'Muse AI Referral Code (2026) — Medium', terms: '1B tokens both sides; redeem within 48h of signup; ~30 uses' },
  { code: '82LCYZ', source: 'https://aiexplainerindia.com/articles/muse-ai-referral-code-1-billion-tokens', sourceTitle: 'Muse AI Referral Code: Get 1 Billion Muse Tokens', terms: '1B tokens both sides; redeem within 48h of signup' },
  { code: 'H8NGW1', source: 'https://aiexplainerindia.com/articles/muse-ai-referral-code-1-billion-tokens', sourceTitle: 'Muse AI Referral Code: Get 1 Billion Muse Tokens', terms: '1B tokens both sides; redeem within 48h of signup' },
  { code: '90V8NH', source: 'https://reviewanddecide.com/muse-ai-referral-code/', sourceTitle: 'Muse AI Referral Code 2026: Get 1B Free Tokens', terms: '1B tokens both sides; redeem within 48h of signup' },
  { code: 'FTITRD', source: 'https://onehack.st/t/muse-by-meta-invite-code-that-skips-the-waitlist-30-uses-tokens-for-both-the-code-ftitrd/325635/11', sourceTitle: 'Muse by Meta — invite code (onehack.st)', terms: '1B tokens both sides; ~30 uses; redeem within 48h' },
  { code: 'PPFD4W', source: 'https://onehack.st/t/muse-by-meta-invite-code-that-skips-the-waitlist-30-uses-tokens-for-both-the-code-ftitrd/325635/11', sourceTitle: 'Muse by Meta — invite code (onehack.st)', terms: '1B tokens both sides; redeem within 48h' },
  { code: '0EFF46', source: 'https://frostrank.com/muse-ai-1-billion-free-tokens', sourceTitle: 'How to Get 1 Billion Muse AI Tokens for Free', terms: '1B tokens; ~20 uses; redeem within 48h of signup' },
  { code: 'GNRTQK', source: 'https://rankplan.us/muse-ai-invite-code/', sourceTitle: 'Muse AI Referral Code: Get 1 Billion Free Tokens', terms: '1B tokens both sides; redeem within 48h of signup' },
  { code: 'VRIM67', source: 'https://jsrlegals.ca/blog/muse-ai-referral-code-vrim67/', sourceTitle: 'Muse AI Referral Code VRIM67', terms: '1,000,000 tokens; redeem soon after joining' },
  { code: 'TFZNE1', source: 'http://dev.to/ying_liao_0a481102ff971b4/automating-real-work-with-muse-connectors-scheduled-tasks-58co', sourceTitle: 'Automating Real Work with Muse (dev.to)', terms: '1B tokens; redeem within 48h of signup' },
  { code: '7YV4Z3', source: 'https://www.youtube.com/watch?v=Jpg6TK8pnn4', sourceTitle: 'Muse AI 1 Billion Free Tokens! (YouTube)', terms: '1B tokens; redeem within 48h of signup' },
  { code: 'Q8P0NW', source: 'https://substack.com/profile/541075785-vpsrankings/note/c-345343522', sourceTitle: 'vpsrankings note (Substack)', terms: '1B tokens both sides; redeem within 48h of signup' },
].map((c) => ({
  ...c,
  foundAt: '2026-10-01T00:00:00.000Z',
  verified: false,
  seed: true,
}));

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------
async function fetchText(url, { timeoutMs = 10000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html,application/json;q=0.9,*/*;q=0.8' },
      signal: ctrl.signal,
      redirect: 'follow',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');
}

function guessTitle(html) {
  const m = html.match(/<title[^>]*>([^<]{1,120})<\/title>/i);
  return m ? m[1].replace(/\s+/g, ' ').trim() : 'web page';
}

// ---------------------------------------------------------------------------
// Code extraction
// ---------------------------------------------------------------------------
const KEYWORDS = ['invite', 'referral', 'redeem', 'code', 'token', 'muse'];
// Common 6-char uppercase words that are NOT codes.
const BLOCKLIST = new Set([
  'REDEEM', 'INVITE', 'REFERR', 'TOKENS', 'BONUS', 'CLAIM', 'SIGNUP',
  'WITHIN', 'HOURS', 'MUSEAI', 'FOLLOW', 'SHARE', 'SUBMIT', 'UPDATE', 'DELETE',
  'CANCEL', 'SEARCH', 'RESULT', 'PAGES', 'MOBILE', 'DESKTOP', 'WINDOW', 'SCREEN',
  'BUTTON', 'INPUT', 'FORM', 'MODAL', 'BANNER', 'HEADER', 'FOOTER', 'NAVBAR',
  'PYTHON', 'SCRIPT', 'STYLE', 'HTTPS', 'ABOUT', 'CONTACT', 'PRIVACY',
  'TERMS', 'COOKIE', 'NOTICE', 'ERROR', 'SUCCESS', 'FAILED', 'LOADING',
]);

function extractCodes(text) {
  const hits = [];
  const seen = new Set();
  const re = /\b([A-Z0-9]{6})\b/g;
  let m;
  while ((m = re.exec(text))) {
    const code = m[1];
    if (seen.has(code) || BLOCKLIST.has(code)) continue;
    // Real Muse codes mix letters and digits (e.g. 56Y5KC, 90V8NH).
    if (!/[A-Z]/.test(code) || !/[0-9]/.test(code)) continue;
    const start = Math.max(0, m.index - 140);
    const end = Math.min(text.length, m.index + 140);
    const ctxLower = text.slice(start, end).toLowerCase();
    if (KEYWORDS.some((k) => ctxLower.includes(k))) {
      seen.add(code);
      hits.push({
        code,
        context: text.slice(start, end).replace(/\s+/g, ' ').trim().slice(0, 220),
      });
    }
  }
  return hits;
}

function detectTerms(text) {
  const t = text.toLowerCase();
  const terms = [];
  if (t.includes('1 billion') || /\b1b\b/.test(t)) terms.push('1B tokens');
  if (/1,?000,?000/.test(t) && !terms.includes('1B tokens')) terms.push('1M tokens');
  if (t.includes('48 hour')) terms.push('redeem within 48h of signup');
  const uses = t.match(/(\d{1,3})\s*(uses|redemptions|times)/);
  if (uses) terms.push(`~${uses[1]} uses`);
  if (t.includes('both')) terms.push('both sides rewarded');
  return terms.join('; ') || 'terms not stated in post';
}

// ---------------------------------------------------------------------------
// Source 1: pullpush.io — public Reddit submission archive (keyless)
// ---------------------------------------------------------------------------
async function scrapePullpush() {
  const queries = [
    'https://api.pullpush.io/reddit/search/submission/?q=muse%20invite%20code&sort=desc&size=50',
    'https://api.pullpush.io/reddit/search/submission/?q=muse%20referral%20code&sort=desc&size=50',
  ];
  const out = [];
  for (const url of queries) {
    try {
      const data = JSON.parse(await fetchText(url, { timeoutMs: 15000 }));
      for (const p of data.data || []) {
        const body = `${p.title || ''}\n${p.selftext || ''}`;
        if (!/muse/i.test(body)) continue;
        const sourceUrl = p.subreddit && p.id
          ? `https://www.reddit.com/r/${p.subreddit}/comments/${p.id}/`
          : 'https://www.reddit.com/';
        const foundAt = p.created_utc
          ? new Date(p.created_utc * 1000).toISOString()
          : new Date().toISOString();
        const terms = detectTerms(body);
        for (const hit of extractCodes(body)) {
          out.push({
            code: hit.code,
            source: sourceUrl,
            sourceTitle: `r/${p.subreddit || 'reddit'}: ${(p.title || 'post').slice(0, 100)}`,
            context: hit.context,
            terms,
            foundAt,
          });
        }
      }
    } catch (e) {
      // source hiccup — continue with what we have
    }
    await sleep(1000);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Source 2: Bing HTML — decode result links (u=a1<base64>), fetch pages
// ---------------------------------------------------------------------------
function bingResultLinks(html) {
  const links = [];
  const seen = new Set();
  const re = /u=a1([A-Za-z0-9+/=]+)&/g;
  let m;
  while ((m = re.exec(html)) && links.length < 15) {
    try {
      const url = Buffer.from(m[1], 'base64').toString('utf8');
      if (/^https?:\/\//i.test(url) && !seen.has(url)) {
        seen.add(url);
        links.push(url);
      }
    } catch (e) { /* bad encoding */ }
  }
  return links;
}

async function scrapeBing() {
  const queries = [
    'https://www.bing.com/search?q=%22muse.ai%22+%22invite+code%22',
    'https://www.bing.com/search?q=muse.ai+referral+code+1+billion+tokens',
  ];
  const out = [];
  for (const qurl of queries) {
    let links = [];
    try {
      const html = await fetchText(qurl, { timeoutMs: 12000 });
      links = bingResultLinks(html);
    } catch (e) {
      continue;
    }
    for (const link of links.slice(0, 5)) {
      if (/^(https?:\/\/)?(www\.)?(muse\.ai|ai\.meta\.com|about\.fb\.com)/i.test(link)) continue;
      try {
        const page = await fetchText(link, { timeoutMs: 6000 });
        const plain = stripHtml(page);
        if (!/muse/i.test(plain)) continue;
        const terms = detectTerms(plain);
        for (const hit of extractCodes(plain)) {
          out.push({
            code: hit.code,
            source: link,
            sourceTitle: guessTitle(page),
            context: hit.context,
            terms,
          });
        }
      } catch (e) {
        // skip dead/blocked pages
      }
      await sleep(1200);
    }
    await sleep(1500);
  }
  return out;
}

async function scrapeAll() {
  const raw = [];
  try { raw.push(...await scrapePullpush()); } catch (e) { /* source down */ }
  try { raw.push(...await scrapeBing()); } catch (e) { /* source down */ }
  const now = new Date().toISOString();
  const seen = new Map();
  for (const r of raw) {
    if (!seen.has(r.code)) {
      seen.set(r.code, { ...r, foundAt: r.foundAt || now, verified: false, seed: false });
    }
  }
  return [...seen.values()];
}

// ---------------------------------------------------------------------------
// Cache + merge
// ---------------------------------------------------------------------------
// In-memory cache, one per serverless instance: each Vercel instance keeps its
// own copy and enforces its own throttle. Worst case is one scrape per
// instance per MIN_INTERVAL_MS, which still protects upstream sources.
// ---------------------------------------------------------------------------
let CACHE = { codes: [], fetchedAt: 0, scraping: false };

// Test hook: lets tests inject a stub scraper instead of hitting the network.
let _scrapeImpl = scrapeAll;
function _setScrapeImpl(fn) { _scrapeImpl = fn; }
function _resetCache() { CACHE = { codes: [], fetchedAt: 0, scraping: false }; }

function mergeCodes(existing, fresh) {
  const map = new Map();
  for (const c of existing) map.set(c.code, c);
  for (const c of fresh) {
    if (!map.has(c.code)) map.set(c.code, c);
  }
  return [...map.values()].sort((a, b) => String(b.foundAt || '').localeCompare(String(a.foundAt || '')));
}

function seedIfEmpty(codes) {
  if (codes.length) return codes;
  return [...SEED_CODES].sort((a, b) => b.foundAt.localeCompare(a.foundAt));
}

async function getCodes(force) {
  const now = Date.now();
  const hasCache = CACHE.codes.length > 0;
  if (CACHE.scraping) {
    return { codes: seedIfEmpty(CACHE.codes), cached: true, inProgress: true, fetchedAt: CACHE.fetchedAt };
  }
  const freshEnough = hasCache && now - CACHE.fetchedAt < TTL_MS;
  if (!force && freshEnough) {
    return { codes: CACHE.codes, cached: true, fetchedAt: CACHE.fetchedAt };
  }
  // Hard throttle: force=1 only skips the TTL gate — it NEVER skips the
  // MIN_INTERVAL floor. Without this, ?force=1 / /api/scrape could hammer
  // pullpush.io and Bing with zero delay. Keyed on "a scrape ran recently"
  // (not on cache contents) so empty results don't escape the throttle.
  // Cold starts (fetchedAt=0) always proceed so first loads still work.
  if (CACHE.fetchedAt && now - CACHE.fetchedAt < MIN_INTERVAL_MS) {
    return {
      codes: seedIfEmpty(CACHE.codes), cached: true, fetchedAt: CACHE.fetchedAt,
      throttled: true,
      retryAfterMs: MIN_INTERVAL_MS - (now - CACHE.fetchedAt),
    };
  }
  CACHE.scraping = true;
  try {
    const fresh = await _scrapeImpl();
    CACHE.codes = mergeCodes(CACHE.codes, fresh);
    CACHE.fetchedAt = Date.now();
  } catch (e) {
    // keep old cache on failure
  } finally {
    CACHE.scraping = false;
  }
  const codes = seedIfEmpty(CACHE.codes);
  return { codes, cached: false, fetchedAt: CACHE.fetchedAt };
}

module.exports = { getCodes, scrapeAll, scrapePullpush, scrapeBing, extractCodes, detectTerms, SEED_CODES };
module.exports._test = { setScrapeImpl: _setScrapeImpl, resetCache: _resetCache, cache: () => CACHE, MIN_INTERVAL_MS, TTL_MS };
