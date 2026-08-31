# AeroTrade category scorecard — 2026-08-31 v12

This update combines the read-only production snapshots `marketplace-audit-2026-08-31-v13.json`, `stripe-commercial-audit-2026-08-31-v2.json` and `social-publication-audit-2026-08-31.json` with the fully rehearsed release candidate. Candidate capability is not counted as production or commercial proof. The scorecard contains no personal data.

## Method

- **Technical readiness (70%)** measures whether the complete path exists, is guarded, auditable, tested and recoverable.
- **Production/commercial proof (30%)** measures whether real users and providers have completed the path recently.
- **Maturity** is `technical readiness × 0.70 + production/commercial proof × 0.30`, rounded to a whole percentage.

| # | Category | Technical | Proof | Maturity | Current evidence and principal gap |
|---|---|---:|---:|---:|---|
| 1 | Value proposition, business model and unit economics | 93 | 30 | 74 | Buyer and seller products have distinct provider evidence; one sold listing has an immutable closure. No marketplace transaction has evidenced complete economics. |
| 2 | Seller acquisition, onboarding and activation | 93 | 42 | 78 | 12 active listings from 6 sellers and one pending-payment listing. The pending seller has not chosen paid promotion or free publication. |
| 3 | Listing quality, trust, verification and availability | 97 | 35 | 78 | All 84 active image files are reachable. Eleven listings across five contactable sellers have never been availability-confirmed; all five grouped requests are actionable but unsent. |
| 4 | Catalogue, search and buyer experience | 96 | 30 | 76 | Public catalogue, bounded search, mobile routes, international landings and sold-listing recovery are live. Search discovery is incomplete and attributable qualified demand remains absent. |
| 5 | Buyer conversion, enquiry and marketplace closing | 97 | 5 | 69 | Account-free enquiry, negotiation, follow-up and closure paths are implemented. Production records 60 legacy/unattributed listing views but the fully comparable cohort still has no genuine stored enquiry. |
| 6 | Premium, payments and monetisation | 99 | 70 | 90 | Seller Launch checkout is durable and fail-closed. Stripe confirms two active Premium subscriptions and one unreimbursed 9.99 EUR charge in the 90-day window; no seller-promotion or closing revenue is proven. |
| 7 | New-balloon sales: Pasha and Schroeder | 97 | 0 | 68 | Request, proposal, response, outcome and settlement paths exist. Production still has zero genuine requests or proposals. |
| 8 | SEO, international acquisition and distribution | 97 | 15 | 72 | Sitemap, structured data, IndexNow, social distribution and multilingual entry routes are implemented. Meta accepted four placements, but only two carried a destination in post text/caption, two were image-only stories, and no attributed AeroTrade action followed. The configured Meta token is now expired. |
| 9 | Automation, communications and follow-up | 99 | 62 | 88 | Paid alerts, negotiations, proposals, newsletters and recovery are provider-idempotent, bounded and receipt-readback bound. Social publication is currently blocked by the expired Meta token; only one newsletter consent is active. |
| 10 | Analytics, Control Tower and commercial evidence | 99 | 62 | 88 | Control Tower separates closures, attribution, delivery and economics. The candidate now also separates Meta acceptance, awareness-only stories, destination candidates and observed traffic; no seller digest has yet been sent. |
| 11 | Security, privacy and transactional integrity | 99 | 90 | 96 | Sale evidence is append-only, seller outreach is cycle-bound and stale timestamps cannot obscure real listing mutations. The social audit stores no provider identifiers, captions, tokens, account names or personal data. |
| 12 | Deployment, production reliability and operability | 99 | 92 | 97 | Netlify publishes only `production`, ordinary `main` pushes cause no deploy, and the candidate passes 212 tests, 228 contracts, lint, types and build. Application production is healthy, but the expired external Meta credential prevents claiming end-to-end social operability. |

## Aggregate

- Mean technical readiness: **97%**.
- Mean production/commercial proof: **44%**.
- Mean evidence-weighted maturity: **81%**.
- The maturity decrease is intentional: provider acceptance is no longer overstated as buyer acquisition, and an expired production credential is counted as a real operational gap.

## Next highest-value constraints

1. **Qualified demand:** accepted social placements produced no attributable action; future distribution needs a valid Meta session and a demonstrable destination path before it can count as acquisition.
2. **Supply freshness:** five contactable seller portfolios are ready for one grouped request covering 11 listings, but external outreach still requires explicit approval.
3. **Commercial closing proof:** no genuine marketplace transaction or new-balloon lead has completed the implemented pipeline.
4. **Production activation:** the reviewed candidate and pending migrations remain deliberately unpromoted pending exact approval.
