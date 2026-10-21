# Muse Referral Board

Public aggregator of **publicly posted** Meta Muse invite/referral codes. Mobile-friendly, keyless, static frontend + Vercel serverless scrapers.

## What it does

- Scrapes public sources for posted Muse invite codes (6-char codes like `56Y5KC`)
- Lists them newest-first with copy button, source link, date found, and reward terms from the post
- "Refresh" re-scrapes (rate-limited: max once a minute, cached 30 min)
- Dedups by code

## Honesty rules (built in)

- Every code is labeled **"publicly posted — not verified"**. Validity can only be confirmed by redeeming.
- Each Muse account can redeem **one** code, **within 48 hours of signup**. Codes also have limited uses (~20–30).
- The app **never attempts redemption** — that would burn the user's one-shot.
- Sources are keyless and rate-limited; results are cached, never hammered.

## Sources

1. **pullpush.io** — public Reddit submission archive API (primary; fast, no key)
2. **Bing HTML search** — result links decoded, pages fetched for codes (secondary)
3. **Seed list** — 13 publicly posted codes found via public web search (2026-10-01), used only when live scrape returns nothing

Reddit's own JSON and DuckDuckGo block datacenter IPs, so they're not used.

## API

- `GET /api/codes` — cached codes, newest first (`?force=1` to refresh, `?fresh=1` for fresh only, `?q=` to filter)
- `GET /api/scrape` — force a fresh scrape
- `GET /api/history` — last 20 scrape runs on this instance (timestamps, per-source stats, errors)
- `GET /api/export?format=csv|json` — download the cached code list (never triggers a scrape)
- `GET /api/stats` — aggregate stats: fresh/stale/seed counts, terms coverage, top sources

Full reference: [`docs/API.md`](docs/API.md). Changelog: [`CHANGELOG.md`](CHANGELOG.md).

Codes include `stale: true` + `ageDays` when found more than 14 days ago —
codes have limited uses, so old ones are probably used up. This is a label,
not verification (only redeeming verifies).

## Frontend features

- **Favorites** (★): saved in `localStorage` on the device only — nothing uploaded
- **Hide** codes you're not interested in; **mark as tried** to track attempts
- **Sort**: newest-first (fresh codes float above stale ones) or oldest-first
- **Fresh-only filter** + stale counts in the status line
- **Filter** matches code, source title, terms, and post context
- **Copy all** visible codes to clipboard
- **Export**: CSV / JSON download buttons
- **Scrape history** panel: per-instance run log with per-source results

## Deploy (Vercel)

Import `jaykk99/muse-referrals` in the Vercel dashboard (like city-driver): framework "Other", no build command, output `.`. `vercel.json` sets 60s max duration for the functions.

## Local dev

```bash
node -e "require('./api/_lib/scrape.js').scrapeAll().then(c => console.log(c.length, 'codes'))"
```
