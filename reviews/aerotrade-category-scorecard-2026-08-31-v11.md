# AeroTrade category scorecard — 2026-08-31 v11

This update combines the read-only production snapshot `marketplace-audit-2026-08-31-v12.json`, the live search-discovery checks, and the fully rehearsed candidate `2026-08-31-acquisition-and-supply-activation`. Candidate capability is not counted as production or commercial proof. The scorecard contains no personal data.

## Method

- **Technical readiness (70%)** measures whether the complete path exists, is guarded, auditable, tested and recoverable.
- **Production/commercial proof (30%)** measures whether real users and providers have completed the path recently.
- **Maturity** is `technical readiness × 0.70 + production/commercial proof × 0.30`, rounded to a whole percentage.

| # | Category | Technical | Proof | Maturity | Current evidence and principal gap |
|---|---|---:|---:|---:|---|
| 1 | Value proposition, business model and unit economics | 93 | 30 | 74 | Buyer and seller products have distinct provider evidence; one sold listing has an immutable closure. No marketplace transaction has evidenced complete economics. |
| 2 | Seller acquisition, onboarding and activation | 93 | 42 | 78 | 12 active listings from 6 sellers and one pending-payment listing. The pending seller has not chosen paid promotion or free publication. |
| 3 | Listing quality, trust, verification and availability | 97 | 35 | 78 | All 84 active image files are reachable. Eleven listings across five contactable sellers have never been availability-confirmed; the candidate now proves all five grouped requests are actionable before showing the send control. |
| 4 | Catalogue, search and buyer experience | 96 | 30 | 76 | Public catalogue, bounded search, mobile routes, international landings and sold-listing recovery are live. Search discovery is incomplete and attributable qualified demand remains absent. |
| 5 | Buyer conversion, enquiry and marketplace closing | 97 | 5 | 69 | Account-free enquiry, negotiation, follow-up and closure paths are implemented. The comparable cohort has zero genuine views and no stored enquiry. |
| 6 | Premium, payments and monetisation | 99 | 70 | 90 | Seller Launch checkout is durable and fail-closed. One historical buyer payment is evidenced; no seller-promotion or closing revenue is proven. |
| 7 | New-balloon sales: Pasha and Schroeder | 97 | 0 | 68 | Request, proposal, response, outcome and settlement paths exist. Production still has zero genuine requests or proposals. |
| 8 | SEO, international acquisition and distribution | 97 | 20 | 74 | Sitemap, structured data, IndexNow, social distribution and multilingual entry routes are implemented. The candidate fixes stale sold-listing freshness and future creatives point to AeroTrade, but production has zero attributable social or localised visits. |
| 9 | Automation, communications and follow-up | 99 | 70 | 90 | Paid alerts, negotiations, proposals, newsletters and recovery are provider-idempotent, bounded and receipt-readback bound. Four social placements and 14 one-time consent invitations were provider-accepted; only one newsletter consent is active. |
| 10 | Analytics, Control Tower and commercial evidence | 99 | 60 | 87 | Control Tower separates closures, attribution, delivery and economics. The candidate adds pre-send seller outreach readiness; no seller digest has yet been sent. |
| 11 | Security, privacy and transactional integrity | 99 | 90 | 96 | Sale evidence is append-only, seller outreach is cycle-bound and the candidate prevents stale timestamps from obscuring real listing mutations. |
| 12 | Deployment, production reliability and operability | 99 | 95 | 98 | Netlify publishes only `production`, ordinary `main` pushes cause no deploy, and the current candidate passes 211 tests, 225 contracts, lint, types, build and a disposable 74-migration rehearsal. |

## Aggregate

- Mean technical readiness: **97%**.
- Mean production/commercial proof: **46%**.
- Mean evidence-weighted maturity: **82%**.
- No percentage was increased merely because more candidate code exists. The aggregate can rise only after the release is promoted and real seller or buyer behaviour is observed.

## Next highest-value constraints

1. **Qualified demand:** the comparable cohort has zero real listing views, CTA clicks, requests or enquiries; acquisition routing must reach production before conversion can be measured.
2. **Supply freshness:** all five contactable seller portfolios are ready for one grouped request covering 11 listings, but external outreach still requires explicit approval.
3. **Commercial closing proof:** no genuine marketplace transaction or new-balloon lead has completed the implemented pipeline.
4. **Production activation:** the reviewed candidate and listing-freshness migration are ready but remain deliberately unpromoted pending exact approval.
