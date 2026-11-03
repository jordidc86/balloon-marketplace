# Global search beta — 2026-11-03

Jordi selected Balloons4sale.eu, The Zebedee List, SecondHand Balloons,
SwapBalloon, Hot Air Balloonist and Barnstormers. Cameron France is excluded.

`/global-search` searches retrieved titles and aircraft registrations in the
browser, with a portal filter and links to the original adverts. It is separate
from AeroTrade listings, seller accounts, Premium, newsletters and social queues.
External results are never imported into those systems. The catalogue and mobile
menu link to it. It is marked beta and noindex during the initial coverage review.

## Coverage and limitations

| Source | Retrieved pages |
| --- | --- |
| Balloons4sale.eu | `/last`: latest 50, not the entire inventory |
| The Zebedee List | First page of 11 balloon/equipment categories |
| SecondHand Balloons | First page of 10 balloon/equipment categories |
| SwapBalloon | `/shop/last-added/`: latest additions, not the entire inventory |
| Hot Air Balloonist | Direct link only; automated access is disabled because of its explicit AI access restrictions |
| Barnstormers | First Lighter-Than-Air category page |

This is not an exhaustive worldwide inventory. No pagination beyond the configured
pages is followed. Coverage is visible next to each source in the product.
Successful catalogue retrieval does not establish seller-confirmed availability.
Prices retain the source currency/qualifiers; unknown prices stay unknown. No
cross-currency price sorting is offered. Exact URLs are deduplicated within a
source. Matching registrations are flagged as possible related adverts, never
silently merged: an envelope and a complete balloon may share a registration.

## Operation

- Anonymous public metadata only: title, original URL, displayed price, optional
  registration, source and catalogue-check timestamp. No descriptions, photos,
  seller names, phone numbers or emails are stored in the snapshot.
- Fixed HTTPS source/page allowlist; outbound links must match source origin and
  advert path. Redirects are not followed. Queries are filtered locally and never
  forwarded to source sites.
- Source robots.txt is checked before each refresh with a descriptive
  `AeroTradeSearch/1.0` user agent. Denial, robots fetch failure or malformed robots
  prevents catalogue retrieval. Crawl delay is respected; long delays fail closed.
  No credentials, CAPTCHA bypasses or private APIs are used.
- 5-second request timeout, 2 MB body limit, 35-second source budget, bounded pages
  and output; one failed source does not block others. Partial retrieval is visible.
- Next's shared data cache refreshes after an hour when a visitor requests it.
  No scheduler or cron has been added. An in-process pending map coalesces identical
  refreshes; there is no global distributed crawl lock across cold instances.
- Browser responses are private/no-store because existing session middleware can
  refresh auth cookies. Only the anonymous underlying snapshot is cached.
- The stored timestamp is preserved on cache hits. The UI hides results older than
  48 hours if cache revalidation has failed. Source DOM changes produce an unavailable
  or partial state instead of reporting an empty complete catalogue.
- Sold/out-of-stock labels and explicit test/fake adverts are filtered where the
  source exposes them in these pages. Listings without such labels can still be sold.

## Initial verification

Read-only retrieval on 2026-11-03 returned 50 Balloons4sale, 139 Zebedee,
18 SecondHand, 12 SwapBalloon and 3 Barnstormers adverts (222 total before possible
cross-portal matches). These are a dated observation, not expected fixed counts.
Hot Air Balloonist made zero catalogue requests.

Tests cover source selection, URL isolation, private data omission, source layouts,
exact-link deduplication, fake/sold exclusion, combined filters, registration
false positives, robots decisions, request bounds and partial failures.

Follow-up: expand bounded coverage/pagination where appropriate, agree access with
restricted sources, and evaluate a persistent index if traffic warrants it. Do not
represent robots permission as a content licence or an agreement with the portal.
