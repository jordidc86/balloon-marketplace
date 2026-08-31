# AeroTrade category scorecard — 2026-08-31 v8

This update is based on the read-only production snapshot `marketplace-audit-2026-08-31-v8.json`, the listing-verification handoff production receipt, Stripe readback, deployed database migrations and local release gates. It contains no personal data.

## Method

- **Technical readiness (70%)** measures whether the complete path exists, is guarded, auditable, tested and recoverable.
- **Production/commercial proof (30%)** measures whether real users and providers have completed the path recently.
- **Maturity** is `technical readiness × 0.70 + production/commercial proof × 0.30`, rounded to a whole percentage.
- No historical payment, lead, transaction, availability, delivery, consent, review or attribution is reconstructed by inference.

| # | Category | Technical | Proof | Maturity | Current evidence and principal gap |
|---|---|---:|---:|---:|---|
| 1 | Value proposition, business model and unit economics | 92 | 30 | 73 | The 9.99 EUR annual buyer product and 5 EUR per-listing seller product have distinct provider metadata and entitlement links. One real recent buyer charge exists; no closed marketplace transaction has evidenced economics. |
| 2 | Seller acquisition, onboarding and activation | 93 | 42 | 78 | 12 active listings from 6 sellers and one pending-payment listing. The unpaid seller can resume the 5 EUR promotion or publish free, but has not yet chosen either path. |
| 3 | Listing quality, trust, verification and availability | 97 | 35 | 78 | All 84 active image files are reachable. A seller-requested evidence review now has a reply-enabled external handoff, a persistent dashboard action, durable provider evidence and exact-state retry without retaining documents. Production still has zero real review requests or verified listings, and 11/12 active listings lack current availability. |
| 4 | Catalogue, search and buyer experience | 96 | 30 | 76 | Public catalogue, bounded search, mobile routes, international landings and sold-listing recovery are live. Genuine attributable buyer demand remains low. |
| 5 | Buyer conversion, enquiry and marketplace closing | 97 | 5 | 69 | Account-free enquiry, negotiation, follow-up and closure paths are implemented. The comparable funnel still has no real stored enquiry or closed transaction. |
| 6 | Premium, payments and monetisation | 99 | 70 | 90 | Seller Launch checkouts are single-live, seller/listing-bound and fail closed if their ledger cannot persist. The one historical buyer payment remains truthfully separated from seller promotion revenue. |
| 7 | New-balloon sales: Pasha and Schroeder | 97 | 0 | 68 | Request, proposal, buyer response, outcome and settlement evidence paths exist. Production still has zero genuine requests or proposals. |
| 8 | SEO, international acquisition and distribution | 97 | 20 | 74 | Localised acquisition, structured data, IndexNow, social distribution and public double opt-in are live. Public newsletter requests preserve the bounded first source, but production still has zero requests or confirmations. |
| 9 | Automation, communications and follow-up | 99 | 70 | 90 | Paid alerts, negotiations, proposals, newsletters and recovery are provider-idempotent, bounded and receipt-readback bound. Verification evidence instructions now use the same two-attempt recovery boundary and stop when the review state changes. |
| 10 | Analytics, Control Tower and commercial evidence | 99 | 60 | 87 | Control Tower separates public requests, pending confirmations, active consent, stops and closed acquisition source without showing addresses. Empty production counters remain zero rather than simulated. |
| 11 | Security, privacy and transactional integrity | 99 | 90 | 96 | Verification documents stay outside the marketplace database; only closed review categories and audit transitions persist. Reply destination is configured server-side and stale review requests cannot be revived by delivery recovery. |
| 12 | Deployment, production reliability and operability | 99 | 90 | 96 | 197 tests and 212 contracts pass. Migration and runtime were released once, Netlify deploy `6a959712873e8d00086c7369` is ready, and production dry-run performed no mutation or outbound message. |

## Aggregate

- Mean technical readiness: **97%**.
- Mean production/commercial proof: **45%**.
- Mean evidence-weighted maturity: **81%**.
- Category 3 technical readiness increased from 95% to 97%; its production proof remains unchanged because no real seller review was manufactured.

## Next highest-value constraints

1. **Supply freshness:** 11 listings across 5 seller portfolios need genuine owner confirmation. One grouped email per seller is ready but still requires Jordi's exact outreach approval.
2. **Qualified demand:** production has no comparable buyer enquiry, new-balloon request or public newsletter confirmation. Acquisition is measurable but has not yet produced evidence.
3. **Seller activation:** one historical pending-payment listing remains private until its owner chooses payment or free publication.
