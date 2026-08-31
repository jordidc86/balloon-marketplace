# AeroTrade category scorecard — 2026-08-31 v7

This update is based on the read-only production snapshot `marketplace-audit-2026-08-31-v7.json`, the public-newsletter consent and attribution production receipts, Stripe readback, deployed database migrations and local release gates. It contains no personal data.

## Method

- **Technical readiness (70%)** measures whether the complete path exists, is guarded, auditable, tested and recoverable.
- **Production/commercial proof (30%)** measures whether real users and providers have completed the path recently.
- **Maturity** is `technical readiness × 0.70 + production/commercial proof × 0.30`, rounded to a whole percentage.
- No historical payment, lead, transaction, availability, delivery, consent or attribution is reconstructed by inference.

| # | Category | Technical | Proof | Maturity | Current evidence and principal gap |
|---|---|---:|---:|---:|---|
| 1 | Value proposition, business model and unit economics | 92 | 30 | 73 | The 9.99 EUR annual buyer product and 5 EUR per-listing seller product have distinct provider metadata and entitlement links. One real recent buyer charge exists; no closed marketplace transaction has evidenced economics. |
| 2 | Seller acquisition, onboarding and activation | 93 | 42 | 78 | 12 active listings from 6 sellers and one pending-payment listing. The unpaid seller can resume the 5 EUR promotion or publish free, but has not yet chosen either path. |
| 3 | Listing quality, trust, verification and availability | 95 | 35 | 77 | All 84 active image files are reachable. Availability requests can be reissued after expiry and failed initiated deliveries retry safely. Zero document-verified listings and 11/12 active listings still lack current seller confirmation. |
| 4 | Catalogue, search and buyer experience | 96 | 30 | 76 | Public catalogue, bounded search, mobile routes, international landings and sold-listing recovery are live. Genuine attributable buyer demand remains low. |
| 5 | Buyer conversion, enquiry and marketplace closing | 97 | 5 | 69 | Account-free enquiry, negotiation, follow-up and closure paths are implemented. The comparable funnel still has no real stored enquiry or closed transaction. |
| 6 | Premium, payments and monetisation | 99 | 70 | 90 | Seller Launch checkouts are single-live, seller/listing-bound and fail closed if their ledger cannot persist. The one historical buyer payment remains truthfully separated from seller promotion revenue. |
| 7 | New-balloon sales: Pasha and Schroeder | 97 | 0 | 68 | Request, proposal, buyer response, outcome and settlement evidence paths exist. Production still has zero genuine requests or proposals. |
| 8 | SEO, international acquisition and distribution | 97 | 20 | 74 | Localised acquisition, structured data, IndexNow, social distribution and public double opt-in are live. Public newsletter requests now preserve the bounded first source, but production still has zero requests or confirmations. |
| 9 | Automation, communications and follow-up | 99 | 70 | 90 | Paid alerts, negotiations, proposals, newsletters and recovery are provider-idempotent, bounded and receipt-readback bound. Account and public consent are combined without duplicate delivery; failed confirmation delivery has one exact-cycle retry. |
| 10 | Analytics, Control Tower and commercial evidence | 99 | 60 | 87 | Control Tower now separates public requests, pending confirmations, active consent, stops and closed acquisition source without showing addresses. Empty production counters remain zero rather than simulated. |
| 11 | Security, privacy and transactional integrity | 99 | 90 | 96 | Public newsletter attribution reuses the daily server-HMAC journey and stores no raw visitor, IP, browser string or full URL. Both old and new service-only request signatures remain available for safe rollback. |
| 12 | Deployment, production reliability and operability | 99 | 90 | 96 | 194 tests and 209 contracts pass. Migration and runtime were released once, Netlify deploy `6a9590c631e6c4000868601e` is ready, and production readback created no request or outbound message. |

## Aggregate

- Mean technical readiness: **97%**.
- Mean production/commercial proof: **45%**.
- Mean evidence-weighted maturity: **81%**.
- Attribution improves decision quality but does not create commercial proof. The scores therefore remain unchanged until genuine activity occurs.

## Next highest-value constraints

1. **Supply freshness:** 11 listings across 5 seller portfolios need genuine owner confirmation. One grouped email per seller is ready but still requires Jordi's exact outreach approval.
2. **Qualified demand:** production has no comparable buyer enquiry, new-balloon request or public newsletter confirmation. The system can now identify which real acquisition source changes that.
3. **Seller activation:** one historical pending-payment listing remains private until its owner chooses payment or free publication.
