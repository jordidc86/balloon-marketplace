# AeroTrade category scorecard — 2026-08-31 v15

This update combines the read-only production snapshot `marketplace-audit-2026-08-31-v14.json`, the existing Stripe and social provider audits, both disposable-database transaction rehearsals and `inventory-feed-verification-2026-08-31.json`. Candidate capability and synthetic rehearsal are not counted as production or commercial proof. The scorecard contains no personal data.

## Method

- **Technical readiness (70%)** measures whether the complete path exists, is guarded, auditable, tested and recoverable.
- **Production/commercial proof (30%)** measures whether real users and providers have completed the path recently.
- **Maturity** is `technical readiness × 0.70 + production/commercial proof × 0.30`, rounded to a whole percentage.

| # | Category | Technical | Proof | Maturity | Current evidence and principal gap |
|---|---|---:|---:|---:|---|
| 1 | Value proposition, business model and unit economics | 94 | 30 | 75 | Buyer and seller products have distinct provider evidence; one sold listing has an immutable closure. Both synthetic commercial paths prove revenue and contribution calculations, but no real marketplace transaction has evidenced complete economics. |
| 2 | Seller acquisition, onboarding and activation | 93 | 42 | 78 | 12 active listings from 6 sellers and one pending-payment listing. The pending seller has not chosen paid promotion or free publication. |
| 3 | Listing quality, trust, verification and availability | 97 | 35 | 78 | All 84 active image files are reachable. Eleven listings across five contactable sellers have never been availability-confirmed; all five grouped requests are actionable but unsent. |
| 4 | Catalogue, search and buyer experience | 96 | 30 | 76 | Public catalogue, bounded search, mobile routes, international landings and sold-listing recovery are live. Search discovery is incomplete and attributable qualified demand remains absent. |
| 5 | Buyer conversion, enquiry and marketplace closing | 98 | 5 | 70 | Account-free enquiry, bilateral negotiation, follow-up and closure paths pass one disposable-database transaction rehearsal, including authorization and duplicate-action gates. Production records 60 legacy/unattributed listing views but the fully comparable cohort still has no genuine stored enquiry. |
| 6 | Premium, payments and monetisation | 99 | 70 | 90 | Seller Launch checkout is durable and fail-closed. Stripe confirms two active Premium subscriptions and one unreimbursed 9.99 EUR charge in the 90-day window; no seller-promotion or closing revenue is proven. |
| 7 | New-balloon sales: Pasha and Schroeder | 98 | 0 | 69 | Request, proposal delivery, immutable buyer response, outcome, settlement and unit economics pass a complete disposable-database intermediation rehearsal. Production still has zero genuine requests or proposals. |
| 8 | SEO, international acquisition and distribution | 98 | 15 | 73 | Sitemap, structured data, IndexNow, social distribution and multilingual routes are implemented. The candidate adds a standards-based feed for the 12 genuinely active listings, excludes the sold listing and strips contact data, but it is not deployed and no partner has consumed it. Meta remains blocked by an expired token. |
| 9 | Automation, communications and follow-up | 99 | 62 | 88 | Paid alerts, negotiations, proposals, newsletters and recovery are provider-idempotent, bounded and receipt-readback bound. Social publication is currently blocked by the expired Meta token; only one newsletter consent is active. |
| 10 | Analytics, Control Tower and commercial evidence | 99 | 62 | 88 | Control Tower separates closures, attribution, delivery and economics. The candidate also separates Meta acceptance, awareness-only stories, destination candidates and observed traffic; no seller digest has yet been sent. |
| 11 | Security, privacy and transactional integrity | 99 | 90 | 96 | Sale evidence is append-only, seller outreach is cycle-bound and negotiation freshness uses monotonic database order instead of tied timestamps and random UUIDs. Both transaction rehearsals reject unauthorized or premature state transitions. |
| 12 | Deployment, production reliability and operability | 99 | 92 | 97 | Netlify publishes only `production`, ordinary `main` pushes cause no deploy, and the candidate passes 215 tests, 233 contracts, TypeScript, ESLint and the optimized build. Application production is healthy, but the expired external Meta credential prevents claiming end-to-end social operability. |

## Aggregate

- Mean technical readiness: **97%**.
- Mean production/commercial proof: **44%**.
- Mean evidence-weighted maturity: **82%**.
- The inventory feed raises technical distribution readiness only. It does not raise production proof because no deployment, partner consumption, visit, lead or transaction occurred.

## Next highest-value constraints

1. **Qualified demand:** the fully comparable acquisition cohort still has zero views, enquiries or new-balloon requests.
2. **Supply freshness:** five contactable seller portfolios are ready for one grouped request covering 11 listings, but external outreach still requires exact approval.
3. **Distribution activation:** the safe inventory feed is candidate-only until one consolidated production release is explicitly approved; partner consumption must be evidenced separately.
4. **Commercial closing proof:** both revenue paths pass in a disposable database, but no genuine marketplace transaction or new-balloon lead has completed either path.
