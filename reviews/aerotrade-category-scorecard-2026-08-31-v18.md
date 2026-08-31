# AeroTrade category scorecard — 2026-08-31 v18

This update combines the read-only production snapshot `marketplace-audit-2026-08-31-v15.json`, existing Stripe and social provider audits, both disposable-database transaction rehearsals, the inventory and seller-availability candidate verifications, `production-automation-dry-run-2026-08-31.json`, and `newsletter-consent-exact-batch-verification-2026-08-31.json`. Candidate capability and dry-runs are not counted as commercial proof. The scorecard contains no personal data.

## Method

- **Technical readiness (70%)** measures whether the complete path exists, is guarded, auditable, tested and recoverable.
- **Production/commercial proof (30%)** measures whether real users and providers have completed the path recently.
- **Maturity** is `technical readiness × 0.70 + production/commercial proof × 0.30`, rounded to a whole percentage.

| # | Category | Technical | Proof | Maturity | Current evidence and principal gap |
|---|---|---:|---:|---:|---|
| 1 | Value proposition, business model and unit economics | 94 | 30 | 75 | Buyer and seller products have distinct provider evidence; one sold listing has an immutable closure. Both synthetic commercial paths prove revenue and contribution calculations, but no real marketplace transaction has evidenced complete economics. |
| 2 | Seller acquisition, onboarding and activation | 93 | 42 | 78 | 12 active listings from 6 sellers and one pending-payment listing. The pending seller has not chosen paid promotion or free publication. |
| 3 | Listing quality, trust, verification and availability | 97 | 35 | 78 | All 12 active listings passed the authenticated production image-quality dry-run. Eleven listings across five contactable sellers remain availability-unconfirmed; their exact batch is candidate-only and unsent. |
| 4 | Catalogue, search and buyer experience | 96 | 30 | 76 | Public catalogue, bounded search, mobile routes, international landings and sold-listing recovery are live. Search discovery is incomplete and attributable qualified demand remains absent. |
| 5 | Buyer conversion, enquiry and marketplace closing | 98 | 5 | 70 | Account-free enquiry, bilateral negotiation, follow-up and closure paths pass one disposable-database transaction rehearsal. Production still has no comparable stored enquiry or active watcher. |
| 6 | Premium, payments and monetisation | 99 | 70 | 90 | Seller Launch checkout is durable and fail-closed. Stripe confirms two active Premium subscriptions and one unreimbursed 9.99 EUR charge in the 90-day window; no seller-promotion or closing revenue is proven. |
| 7 | New-balloon sales: Pasha and Schroeder | 98 | 0 | 69 | Request, proposal delivery, immutable buyer response, outcome, settlement and unit economics pass a complete disposable-database intermediation rehearsal. Production still has zero genuine requests or proposals. |
| 8 | SEO, international acquisition and distribution | 98 | 15 | 73 | The production indexing dry-run found 37 eligible URLs without submitting them. The candidate adds a safe active-inventory feed, but it is not deployed and no partner has consumed it. Meta remains blocked by an expired token. |
| 9 | Automation, communications and follow-up | 99 | 62 | 88 | Seven authenticated production dry-runs returned 200 and changed none of nine fingerprinted state datasets. The candidate makes newsletter simulation observational and disables blanket legacy-account consent delivery. |
| 10 | Analytics, Control Tower and commercial evidence | 99 | 62 | 88 | Candidate Admin Users now presents the exact consent-recipient set, requires a fingerprinted approval and durably excludes test or non-customer accounts. Thirteen production accounts remain candidates before operator exclusions; no invitation was sent. |
| 11 | Security, privacy and transactional integrity | 99 | 90 | 96 | Consent exclusion uses a private closed reason, does not modify consent, and previously accepted invitations cannot repeat. Sale evidence and seller outreach remain evidence-bound and all production dry-runs were authenticated. |
| 12 | Deployment, production reliability and operability | 99 | 92 | 97 | The candidate passes 219 tests, 239 contracts, TypeScript, ESLint and the optimized build. The new consent controls require an additive migration and remain unpromoted with the rest of the consolidated candidate. |

## Aggregate

- Mean technical readiness: **97%**.
- Mean production/commercial proof: **44%**.
- Mean evidence-weighted maturity: **82%**.
- Consent outreach became exact and operator-reviewable, but commercial proof remains unchanged because no email, publication, lead, payment or seller confirmation was created.

## Next highest-value constraints

1. **Production activation:** the consolidated candidate contains the newsletter simulation fix, feed, exact seller batch and exact consent batch, but remains unpromoted pending one explicit release and its additive migrations.
2. **Supply freshness:** 11 listings across 5 sellers are ready for one controlled batch after the release; no request has been sent.
3. **Consented demand:** 13 accounts require operator classification before an exact one-time preference batch can be approved; test and non-customer accounts must first be excluded durably.
4. **Qualified demand and closing:** there is still no comparable enquiry or new-balloon request and no real transaction with complete economics.
