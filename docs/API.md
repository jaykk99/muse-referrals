# Muse Referral Board — API reference

Base: the deployed Vercel URL (or `http://localhost:3000` with `vercel dev`).
All endpoints are GET, keyless, and JSON unless noted. No endpoint attempts
redemption — the app only aggregates publicly posted codes.

## `GET /api/codes[?force=1][&fresh=1][&q=text]`

The code list, newest first. Cached 30 minutes; `?force=1` refreshes past the
TTL but **never** bypasses the 60-second scrape throttle. `fresh=1` drops
stale codes; `q=` filters by code, source title, terms, or post context
(case-insensitive).

Response:

```json
{
  "ok": true,
  "count": 14,
  "cached": true,
  "fetchedAt": 1729460000000,
  "codes": [
    {
      "code": "56Y5KC",
      "source": "https://medium.com/...",
      "sourceTitle": "Muse AI Referral Code (2026) — Medium",
      "terms": "1B tokens both sides; redeem within 48h of signup",
      "context": "…surrounding post text…",
      "foundAt": "2026-10-01T00:00:00.000Z",
      "verified": false,
      "seed": true,
      "stale": true,
      "ageDays": 19
    }
  ]
}
```

Field notes:

- `verified` is always `false` — validity can only be confirmed by redeeming,
  and the app never redeems.
- `seed: true` marks the hand-collected fallback list (used when a cold scrape
  returns nothing). Seed codes are old and almost certainly used up.
- `stale: true` when `foundAt` is more than 14 days old. Codes have ~20–30
  uses, so old codes are probably dead. Label, not verification.
- When throttled, `/api/codes?force=1` still returns 200 with the cached list
  plus `"throttled": true` (unlike `/api/scrape`, which 429s — see below).

Cache headers: `s-maxage=300, stale-while-revalidate=600`.

## `GET /api/scrape`

Force a fresh scrape now. Same 60-second throttle as `?force=1`.

- `200` — fresh scrape completed: `{ok, count, codes, cached: false, fetchedAt}`
- `429` — throttled: `{ok: false, error, retryAfter, count, codes, fetchedAt}`
  with a `Retry-After` header (seconds). The cached list is still included so
  the UI never goes empty.

## `GET /api/history`

Last 20 scrape runs **on this serverless instance** (each Vercel instance
keeps its own in-memory history — cold starts reset it).

```json
{
  "ok": true,
  "count": 3,
  "note": "per-instance history: each serverless instance tracks its own runs",
  "history": [
    {
      "at": "2026-10-20T19:00:00.000Z",
      "ok": true,
      "ms": 4213,
      "found": 2,
      "total": 15,
      "stats": {
        "pullpush": { "ok": true, "ms": 1800, "found": 2 },
        "bing": { "ok": false, "ms": 0, "found": 0, "error": "HTTP 429 for ..." }
      }
    }
  ]
}
```

Failed runs record `"ok": false` with an `error` string and keep serving the
old cache.

## `GET /api/export?format=csv|json[&fresh=1][&q=text]`

Download the current cached list. **Never triggers a scrape** — it exports
whatever `/api/codes` would serve from cache. Accepts the same `fresh`/`q`
filters as `/api/codes`.

- `format=csv` → `text/csv` download (`muse-codes-YYYY-MM-DD.csv`), columns:
  `code,source,sourceTitle,terms,foundAt,verified,seed,stale`
- `format=json` → JSON download with `{ok, exportedAt, count, codes}`
- anything else → `400 {ok: false, error}`

## `GET /api/stats`

Aggregate stats over the cached list (read-only, no scrape triggered):

```json
{
  "ok": true,
  "total": 14,
  "fresh": 2,
  "stale": 12,
  "seed": 13,
  "withTerms": 11,
  "newestFoundAt": "2026-10-20T18:00:00.000Z",
  "oldestFoundAt": "2026-10-01T00:00:00.000Z",
  "bySource": [{ "source": "seed list", "count": 13 }],
  "seedListSize": 13,
  "cached": true,
  "fetchedAt": 1729460000000
}
```

`bySource` is capped at the top 25 sources.

## Rate limits (all scrape-triggering paths)

- Serve cache: 30-minute TTL
- Scrape throttle: max once per 60 seconds per instance (forced or not)
- Concurrent scrapes: second caller gets `inProgress: true` + cached data
- Upstream politeness: 1s between pullpush queries, 1.2–1.5s between Bing pages

## Local dev

```bash
# scrape once, print code count (hits the live network)
node -e "require('./api/_lib/scrape.js').scrapeAll().then(c => console.log(c.length, 'codes'))"

# run the test suite (no network — scrapers are stubbed)
npm test
```
