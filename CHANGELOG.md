# Changelog — muse-referrals

## 2026-10-20

- **Stale labeling**: codes older than 14 days get `stale: true` + `ageDays`;
  UI shows a "probably used up" badge and a "Fresh only" filter. Fresh codes
  sort above stale ones by default.
- **`/api/history`**: per-instance log of the last 20 scrape runs with
  per-source stats (pullpush/Bing ok, ms, found, errors).
- **`/api/export?format=csv|json`**: download the cached list; never triggers
  a scrape on its own.
- **`/api/stats`**: aggregate counts (fresh/stale/seed, terms coverage,
  newest/oldest, top sources). Read-only.
- **Code management UI** (device-local, `localStorage`, nothing uploaded):
  ★ favorites + favorites filter, hide codes, mark-as-tried.
- **Toolbar**: newest/oldest sort toggle, copy-all-visible, CSV/JSON export.
- **Filter** now matches code, source title, terms, and post context —
  not just the code text.
- **Scrape history panel** in the UI with per-source results.
- `scrapeAllWithStats()` separates per-source timing from the merge;
  `getCodes` records every run (success or failure) into the history ring.
- **Server-side filters**: `/api/codes` and `/api/export` accept `fresh=1`
  (drop stale) and `q=` (match code/source/terms/context, case-insensitive).
- **Rate-limit countdown**: the refresh button shows "retry in Ns" when
  throttled instead of a dead click.
- `docs/API.md`: full endpoint reference.

## 2026-10-13

- **Rate-limit bypass closed**: `?force=1` skips the 30-min TTL but can no
  longer skip the 60s scrape throttle; `/api/scrape` returns `429` +
  `Retry-After` when throttled.
- Node test suite (10 tests) + CI workflow (`npm test`).

## 2026-10-01

- Initial: keyless scrapers (pullpush.io + Bing), static mobile UI, 13-code
  seed list, honesty labels ("publicly posted — not verified").
