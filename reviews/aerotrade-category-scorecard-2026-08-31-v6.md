# AeroTrade category scorecard — 2026-08-31 v6

This update is based on the read-only production snapshot `marketplace-audit-2026-08-31-v6.json`, the public-newsletter production receipt, Stripe readback, deployed database migrations and local release gates. It contains no personal data.

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
| 8 | SEO, international acquisition and distribution | 97 | 20 | 74 | Localised acquisition, structured data, IndexNow, measured social distribution and a public double-opt-in newsletter entry point are live. The new path has zero public requests or confirmations, so it adds no commercial proof yet. |
| 9 | Automation, communications and follow-up | 99 | 70 | 90 | Paid alerts, negotiations, proposals, newsletters and recovery are provider-idempotent, bounded and receipt-readback bound. Account and public newsletter consent are combined without duplicate delivery; failed confirmation delivery has one exact-cycle retry. |
| 10 | Analytics, Control Tower and commercial evidence | 99 | 60 | 87 | Control Tower distinguishes entitlement, seller activation, availability and downstream buyer stages. The production audit now separates account consent, public consent and their deduplicated active audience without exposing addresses. |
| 11 | Security, privacy and transactional integrity | 99 | 90 | 96 | Public newsletter rows are private, anonymous reads are blocked, abuse keys are one-way HMACs, and neither link opening nor provider acceptance activates consent without a signed explicit POST. |
| 12 | Deployment, production reliability and operability | 99 | 90 | 96 | 194 tests and 207 contracts pass. Migration and runtime were released once, Netlify deploy `6a958ba16d711200077401fa` is ready, public pages return 200, and both production dry runs sent zero messages. |

## Aggregate

- Mean technical readiness: **97%**.
- Mean production/commercial proof: **45%**.
- Mean evidence-weighted maturity: **81%**.
- Public newsletter acquisition is now technically usable, but the score deliberately remains proof-limited until a real visitor confirms and later produces attributable demand.

## Next highest-value constraints

1. **Supply freshness:** 11 listings across 5 sellers need real owner confirmation. This requires Jordi's exact approval for one grouped transactional email per seller; no request was sent in this release.
2. **Qualified demand:** the platform has no comparable real buyer enquiry, new-balloon request or closed marketplace transaction. Public double opt-in can now accumulate consented demand without importing legacy contacts.
3. **Seller activation:** the historical unpaid listing has a truthful self-service choice but remains private until its owner chooses payment or free publication.
