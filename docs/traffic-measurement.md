# Traffic and contact measurement

The administrator panel is `/admin/traffic`. Collection starts with the traffic release; it cannot reconstruct earlier public page views. Netlify site readback on 3 November 2026 returned `analytics_instance_id: null`; no paid analytics product was enabled.

Public page navigation is collected by a small first-party client. The intake requires the canonical same-origin request and rejects private paths, oversized payloads and common bots. Signed-in admins, webdriver sessions, DNT and GPC are excluded. No IP, full URL query, search text or raw referrer URL is stored. The existing visitor identifier is HMACed with the same UTC daily journey key as commercial actions. Browsers and logged-in accounts are estimates, not identities. Reloads inside ten seconds are coalesced; UUID event keys prevent duplicate deliveries and an atomic 200-event daily journey cap bounds noisy clients. This is not a bot-proof visitor census.

The report has daily visitors and page views, first source/campaign per visitor-day, top pages, total stored marketplace/quote/wanted requests and visitors with an attributable request after their first measured visit. Totals include unattributed requests; conversion only compares joined daily journeys. Repeat days are explicitly visitor-days, never claimed as monthly unique people. Data failures are shown as unavailable, not zero. Raw traffic older than 30 days is purged on subsequent intake; there is no new scheduler.

Scheduled social destinations and newsletter listing links already use UTM labels. The newsletter now also has an attributed catalogue button. The panel supplies channel-specific search-launch links. Instagram captions and image-only API stories are not clickable placements; use an actual bio link or a manually added story link sticker. Never infer clicks from a Meta acceptance receipt or an email delivery.

## Database and recovery

Migration `20261103150000` adds an RLS-protected traffic table and two service-only functions. No existing row, table, permission or closed event vocabulary is modified. The previous application is compatible with the additive migration. Rollback: deploy the previous application through a reviewed release; leave the private table intact for audit, no destructive rollback SQL. No new secrets, accounts, subscriptions or schedules.

Verification: Node tests (path rejection, campaign URLs and SPA attribution), lint, types, production build and local operational audit. The SQL was exercised in isolated PGlite with synthetic fixtures: migration execution, duplicate event prevention, source/contact aggregation, retention and anonymous table/RPC denial. Production checks must not generate fake visitor events.
