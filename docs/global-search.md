# External listings in the AeroTrade catalogue — 2026-11-03

Jordi requested integration into the existing search, removal of Hot Air Balloonist,
and a daily server-side catalogue refresh. The standalone global-search UI is retired.
`/global-search` redirects to `/catalog`, preserving a bounded search query.

## Customer experience

The existing catalogue form, colours and card grid are reused. When a visitor searches
or selects a category/manufacturer/country, AeroTrade listings appear first, followed
by matching external adverts. External cards use the original public thumbnail, carry the source name and link to the
original advert. There is no second search screen, source dashboard or technical status
panel. The unfiltered landing catalogue continues to show AeroTrade inventory.

Search matches model punctuation, registrations, country and manufacturer words.
External results respect known category/country metadata; unknown values are not
invented. Prices remain in their source currency; external price sorting groups
currencies instead of pretending they are directly comparable. External discovery
order is not represented as the seller's original publication date. Native access
control and Premium cards retain their existing visibility rules.

## Daily operation

Exactly one new Netlify schedule, `external-catalog-scheduled`, runs at **04:00 UTC
once a day**. It queues `external-catalog-background`; the initial HTTP 202 means
queued, not completed. This follows Netlify's documented separation between a
30-second scheduled dispatcher and a background job with a longer execution window:
https://docs.netlify.com/build/functions/scheduled-functions/
https://docs.netlify.com/build/functions/background-functions/

The worker uses the existing CRON_SECRET, Supabase URL and service role. It writes
only `external_catalog_sources`, a new RLS-protected table, isolated from users,
AeroTrade listings, newsletters, social queues and payments. Ordinary users cannot
read or mutate this table directly. Server-rendered catalogue pages and the legacy
read-only API expose only a whitelist of advert metadata.

A database lease per source prevents concurrent crawls. Completion is keyed by UTC
date, so duplicate invocations on the same day do not crawl again. A crashed worker's
lease expires after ten minutes; its obsolete token cannot overwrite a newer worker.
Each source has a four-minute budget, requests have ten-second timeouts, responses
are capped at 2 MB, and a transient network/5xx failure gets at most one retry.
403/access restrictions and parser errors are not retried. Other sources continue
if one source fails. Source summaries are logged and completion receipts remain in
`last_attempt_at`, `last_completed_at`, `last_run_key` and snapshot status/failed paths.

## Reconciliation

- A successfully read category replaces its saved page. Missing adverts leave that
  page's searchable index; disappearance is not labelled as a confirmed sale.
- Explicit sold/out-of-stock/test markers remove that URL across the source's saved
  pages, even if a different category failed in the same run.
- Failed pages retain their prior data **and prior observation timestamps**. Data
  older than 72 hours is hidden, including when the scheduled job stops running.
- Discovery timestamps survive updates. Exact original URLs are deduplicated; adverts
  sharing a registration are not silently merged because the sale packages may differ.
- Visitors read the saved index only. Searches never crawl sites or forward user
  queries. There is no hourly visitor-triggered refresh and no Mac automation.

## Sources and scope

| Source | Catalogue pages checked |
| --- | --- |
| Balloons4sale.eu | 11 balloon/equipment categories, replacing the old latest-50 limit |
| The Zebedee List | 11 balloon/equipment categories |
| SecondHand Balloons | 10 balloon/equipment categories |
| SwapBalloon | Latest additions page |
| Barnstormers | Lighter-Than-Air category page |

Hot Air Balloonist and Cameron France are excluded from both the registry and storage
constraints. The crawler reads public category pages; it does not assert that every
ad on every portal is indexed or that a seller has confirmed availability. Pagination
beyond the configured pages and per-ad detail crawling are not implemented. Sold
markers are recognised when the source exposes them on these catalogue pages.

Robots checks and crawl delays remain mandatory. Fixed origins/paths, no redirects,
minimal metadata (no seller contacts or descriptions), protected writes and
private HTTP responses bound exposure. Thumbnail URLs are restricted to observed source image paths; originals are loaded directly without a search-page referrer and are not copied into AeroTrade storage. Broken images use the existing card fallback. Robots permission is not a content licence.

## Five review areas

1. **Presentation/integration:** one existing form and grid, own adverts first,
   no extra menu entry, redirect compatibility, desktop/mobile visual review.
2. **Search relevance:** model variants, multiple words, manufacturers, categories,
   countries, source exclusion, empty results and currency-aware ordering.
3. **Daily refresh/reconciliation:** real source retrieval, additions, changed prices,
   removed/sold adverts, partial failures, stale expiry, retries and duplicate jobs.
4. **Security/regression:** isolated PostgreSQL migration/RLS/lease tests, URL allowlist,
   restricted writes, minimal public metadata, all existing tests/audits/lint/build.
5. **Production:** exact deployment, migration ledger, first background refresh and
   persisted per-source receipts, real catalogue results and scheduled-function metadata.

The actual dated execution results and any remaining limits are recorded in the release
review evidence outside the repository. Do not describe an unperformed visual check or
an unobserved future scheduled run as passed.
