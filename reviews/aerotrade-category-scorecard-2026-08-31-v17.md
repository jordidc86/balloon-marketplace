# AeroTrade category scorecard — 2026-08-31 v17

This update combines the read-only production snapshot `marketplace-audit-2026-08-31-v15.json`, existing Stripe and social provider audits, both disposable-database transaction rehearsals, the inventory and seller-availability candidate verifications, and `production-automation-dry-run-2026-08-31.json`. Candidate capability and dry-runs are not counted as commercial proof. The scorecard contains no personal data.

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
| 9 | Automation, communications and follow-up | 99 | 62 | 88 | Seven authenticated production dry-runs returned 200 and changed none of nine fingerprinted state datasets. The audit found that the deployed newsletter dry-run still writes audit rows; the candidate makes it genuinely observational before it can be tested live. |
| 10 | Analytics, Control Tower and commercial evidence | 99 | 62 | 88 | State fingerprints prove the production dry-runs did not alter listings, receipts, dispatches, newsletter or social evidence. Thirteen accounts are eligible for a one-time newsletter consent invitation, but no invitation was sent. |
| 11 | Security, privacy and transactional integrity | 99 | 90 | 96 | Sale evidence is append-only, seller outreach is scope-bound and all tested production dry-runs were authenticated. The audit artifact stores only aggregate counters and fingerprints, never response bodies or recipient data. |
| 12 | Deployment, production reliability and operability | 99 | 92 | 97 | The candidate passes 217 tests, 237 contracts, TypeScript, ESLint and the optimized build. Production dry-runs for quality, indexing, watches, consent eligibility, follow-up, social and wanted matching are healthy; newsletter simulation awaits the consolidated release fix. |

## Aggregate

- Mean technical readiness: **97%**.
- Mean production/commercial proof: **44%**.
- Mean evidence-weighted maturity: **82%**.
- Reliability evidence improved materially, but commercial proof remains unchanged because no email, publication, lead, payment or seller confirmation was created.

## Next highest-value constraints

1. **Production activation:** the candidate fixes the newsletter simulation mutation and contains the feed and exact seller batch, but all remain unpromoted pending one explicit consolidated release.
2. **Supply freshness:** 11 listings across 5 sellers are ready for one controlled batch after the release; no request has been sent.
3. **Consented demand:** 13 accounts are eligible for a one-time preference invitation; sending remains a separate explicit marketing-contact decision.
4. **Qualified demand and closing:** there is still no comparable enquiry or new-balloon request and no real transaction with complete economics.
