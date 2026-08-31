# AeroTrade category scorecard — 2026-08-31 v3

This update is based on the read-only production snapshot `marketplace-audit-2026-08-31-v4.json`, the Stripe and production verification receipts, deployed database migrations and local release gates. It contains no personal data.

## Method

- **Technical readiness (70%)** measures whether the complete path exists, is guarded, auditable, tested and recoverable.
- **Production/commercial proof (30%)** measures whether real users and providers have completed the path recently.
- **Maturity** is `technical readiness × 0.70 + production/commercial proof × 0.30`, rounded to a whole percentage.
- No historical payment, lead, transaction, availability or provider delivery is reconstructed by inference.

| # | Category | Technical | Proof | Maturity | Current evidence and principal gap |
|---|---|---:|---:|---:|---|
| 1 | Value proposition, business model and unit economics | 92 | 30 | 73 | The 9.99 EUR annual buyer product and 5 EUR per-listing seller product have distinct provider metadata and entitlement links. One real recent buyer charge exists; no closed marketplace transaction has evidenced economics. |
| 2 | Seller acquisition, onboarding and activation | 91 | 42 | 76 | 12 active listings from 6 sellers and one pending-payment listing. Assisted and self-service paths work; recent seller activation remains sparse. |
| 3 | Listing quality, trust, verification and availability | 95 | 35 | 77 | All 84 active image files are reachable and aircraft fields are strong. Availability requests can now be reissued after their private link expires, failed initiated deliveries retry safely and stale inventory is never emailed. Zero document-verified listings and 11/12 active listings still lack current seller confirmation. |
| 4 | Catalogue, search and buyer experience | 96 | 30 | 76 | Public catalogue, bounded search, mobile routes, international landings and sold-listing recovery are live. Genuine attributable buyer demand remains low. |
| 5 | Buyer conversion, enquiry and marketplace closing | 97 | 5 | 69 | Account-free enquiry, negotiation, follow-up and closure paths are implemented. Buyer receipts distinguish accepted delivery from stored recovery, and failed negotiation updates retry safely without reviving superseded messages. The comparable funnel still has no real stored enquiry or closed transaction. |
| 6 | Premium, payments and monetisation | 99 | 70 | 90 | Seller Launch checkouts are single-live, seller/listing-bound and fail closed if their ledger cannot persist. Signed Stripe fulfillment verifies entitlement, seller confirmation, Premium alert and readback. The one historical payment predates this ledger and remains truthfully unlinked. |
| 7 | New-balloon sales: Pasha and Schroeder | 97 | 0 | 68 | Request, proposal, buyer response, outcome and settlement evidence paths exist. Failed proposal and internal response deliveries recover from trusted stored evidence. Production still has zero genuine requests or proposals. |
| 8 | SEO, international acquisition and distribution | 93 | 20 | 71 | Localised acquisition, structured data, IndexNow and measured social distribution exist. Four social placements were accepted, but no attributable landing journey has converted. |
| 9 | Automation, communications and follow-up | 99 | 70 | 90 | Paid alerts, negotiations, new-balloon proposals and seller-availability recovery are provider-idempotent, bounded and receipt-readback bound. The recovery cron retries only an explicitly initiated exact request; it never starts seller outreach by itself. |
| 10 | Analytics, Control Tower and commercial evidence | 99 | 60 | 87 | Control Tower distinguishes gross receipt evidence, exact paid entitlement links, availability age and Seller Launch intent state. Historic pre-ledger evidence is intentionally not backfilled. |
| 11 | Security, privacy and transactional integrity | 99 | 90 | 96 | Private seller authority is seller/email/inventory/expiry bound, opening a link changes nothing and database confirmation cannot alter publication, price, ownership or payment. Private ledgers remain inaccessible to clients and unsigned webhooks fail closed. |
| 12 | Deployment, production reliability and operability | 98 | 85 | 94 | 183 tests and 196 contracts pass. Migration `20260831650000` matches production, its service-role boundary rejects invalid authority, the protected dry-run passed and Netlify deploy `6a957433fd54d50008baabd3` is ready. The remaining build warning is the non-outage Edge Runtime deprecation. |

## Aggregate

- Mean technical readiness: **96%**.
- Mean production/commercial proof: **45%**.
- Mean evidence-weighted maturity: **81%**.
- The release improves operational reliability but deliberately does not raise availability, demand or transaction proof without real seller and buyer actions.

## Next highest-value constraint

The system is technically ready to recover seller availability, but 11 listings across 5 sellers still need real owner confirmation. No seller email was sent during this release. The next material step is an explicitly authorised grouped request: one transactional email per seller, followed by provider readback and seller-originated confirmation evidence. Until that happens, AeroTrade must not represent most active supply as recently owner-confirmed.
