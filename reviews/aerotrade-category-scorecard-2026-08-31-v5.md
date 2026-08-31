# AeroTrade category scorecard — 2026-08-31 v5

This update is based on the read-only production snapshot `marketplace-audit-2026-08-31-v5.json`, Stripe readback, production verification receipts, deployed database migrations and local release gates. It contains no personal data.

## Method

- **Technical readiness (70%)** measures whether the complete path exists, is guarded, auditable, tested and recoverable.
- **Production/commercial proof (30%)** measures whether real users and providers have completed the path recently.
- **Maturity** is `technical readiness × 0.70 + production/commercial proof × 0.30`, rounded to a whole percentage.
- No historical payment, lead, transaction, availability, delivery or attribution is reconstructed by inference.

| # | Category | Technical | Proof | Maturity | Current evidence and principal gap |
|---|---|---:|---:|---:|---|
| 1 | Value proposition, business model and unit economics | 92 | 30 | 73 | The 9.99 EUR annual buyer product and 5 EUR per-listing seller product have distinct provider metadata and entitlement links. One real recent buyer charge exists; no closed marketplace transaction has evidenced economics. |
| 2 | Seller acquisition, onboarding and activation | 93 | 42 | 78 | 12 active listings from 6 sellers and one pending-payment listing. The unpaid seller can resume the 5 EUR promotion or publish free, but has not yet chosen either path. |
| 3 | Listing quality, trust, verification and availability | 95 | 35 | 77 | All 84 active image files are reachable. Availability requests can be reissued after expiry and failed initiated deliveries retry safely. Zero document-verified listings and 11/12 active listings still lack current seller confirmation. |
| 4 | Catalogue, search and buyer experience | 96 | 30 | 76 | Public catalogue, bounded search, mobile routes, international landings and sold-listing recovery are live. Genuine attributable buyer demand remains low. |
| 5 | Buyer conversion, enquiry and marketplace closing | 97 | 5 | 69 | Account-free enquiry, negotiation, follow-up and closure paths are implemented. The comparable funnel still has no real stored enquiry or closed transaction. |
| 6 | Premium, payments and monetisation | 99 | 70 | 90 | Seller Launch checkouts are single-live, seller/listing-bound and fail closed if their ledger cannot persist. The one historical buyer payment remains truthfully separated from seller promotion revenue. |
| 7 | New-balloon sales: Pasha and Schroeder | 97 | 0 | 68 | Request, proposal, buyer response, outcome and settlement evidence paths exist. Production still has zero genuine requests or proposals. |
| 8 | SEO, international acquisition and distribution | 95 | 20 | 73 | Localised acquisition, structured data, IndexNow and measured social distribution exist. Future newsletters now carry deterministic non-personal attribution into listing views and every conversion path. The 45 historical accepted deliveries are not retroactively credited, and no attributable newsletter conversion exists yet. |
| 9 | Automation, communications and follow-up | 99 | 70 | 90 | Paid alerts, negotiations, new-balloon proposals, newsletters and seller-availability recovery are provider-idempotent, bounded and receipt-readback bound. Newsletter dry-runs create no recipient ledger row and send no email. |
| 10 | Analytics, Control Tower and commercial evidence | 99 | 60 | 87 | Control Tower distinguishes paid entitlement, seller activation, availability and downstream buyer stages. Newsletter source, medium and campaign now survive internal navigation without recipient-level tracking. |
| 11 | Security, privacy and transactional integrity | 99 | 90 | 96 | Campaign URLs contain no recipient or user identifier. Private ledgers remain inaccessible to clients, and invalid listing or campaign identifiers fail closed. |
| 12 | Deployment, production reliability and operability | 98 | 85 | 94 | 187 tests and 201 contracts pass. The first production dry-run exposed a suffixed audit-key mismatch before provider dispatch; the hotfix was deployed and the repeated production dry-run verified 10/10 attributed links, zero sends and zero recipient rows. Netlify deploy `6a957dd3bb140000082bd7e3` is ready. |

## Aggregate

- Mean technical readiness: **97%**.
- Mean production/commercial proof: **45%**.
- Mean evidence-weighted maturity: **81%**.
- Attribution is now technically measurable, but the score does not claim commercial proof before a real recipient clicks or converts.

## Next highest-value constraints

1. **Supply freshness:** 11 listings across 5 sellers need real owner confirmation. This requires Jordi's explicit approval for one grouped transactional email per seller.
2. **Seller activation:** the historical unpaid listing has a truthful self-service choice, but remains private until its owner chooses payment or free publication.
3. **Commercial proof:** no comparable buyer enquiry, new-balloon request or closed marketplace transaction exists yet. The next gains depend on qualified demand and real seller responses, now with reliable source attribution.
