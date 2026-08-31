# AeroTrade category scorecard — 2026-08-31 v21

This update uses the fresh read-only snapshot `marketplace-audit-2026-08-31-v16.json`, existing Stripe and provider evidence, both disposable-database transaction rehearsals, and the candidate verifications for inventory feed, seller availability, exact consent, seller distribution, schema-bound promotion and backward compatibility with the deployed application. Candidate capability is not counted as commercial proof. The scorecard contains no personal data.

## Method

- **Technical readiness (70%)** measures whether the complete path exists, is guarded, auditable, tested and recoverable.
- **Production/commercial proof (30%)** measures whether real users and providers have completed the path recently.
- **Maturity** is `technical readiness × 0.70 + production/commercial proof × 0.30`, rounded to a whole percentage.

| # | Category | Technical | Proof | Maturity | Current evidence and principal gap |
|---|---|---:|---:|---:|---|
| 1 | Value proposition, business model and unit economics | 94 | 30 | 75 | Buyer and seller products have distinct provider evidence; one sold listing has an immutable closure. Synthetic paths prove complete calculations, but no real marketplace transaction has evidenced complete economics. |
| 2 | Seller acquisition, onboarding and activation | 94 | 42 | 78 | 12 active listings from 6 sellers and one pending-payment listing. The candidate extends the existing private funnel through seller distribution, but sellers have not used it in production. |
| 3 | Listing quality, trust, verification and availability | 97 | 35 | 78 | All active inventory has reachable images. Eleven listings across five contactable sellers remain availability-unconfirmed; their exact batch is candidate-only and unsent. |
| 4 | Catalogue, search and buyer experience | 96 | 30 | 76 | Public catalogue, bounded search, mobile routes, international landings and sold-listing recovery are live. Attributable qualified demand remains absent. |
| 5 | Buyer conversion, enquiry and marketplace closing | 98 | 5 | 70 | The complete closing path is rehearsed, but the new comparable cohort has zero listing views. There is no evidence that the form itself is the current bottleneck. |
| 6 | Premium, payments and monetisation | 99 | 70 | 90 | Seller Launch checkout is durable and fail-closed. Stripe confirms two active Premium subscriptions and one historic real payment; no seller-promotion or closing revenue is proven. |
| 7 | New-balloon sales: Pasha and Schroeder | 98 | 0 | 69 | Request, proposal, response, outcome, settlement and economics pass a complete disposable rehearsal. Production still has zero genuine requests or proposals. |
| 8 | SEO, international acquisition and distribution | 99 | 15 | 74 | The candidate adds a safe feed plus measured seller distribution over WhatsApp, email, copy, native share, LinkedIn and Facebook. None is live and no attributable visit has resulted. Meta remains blocked by an expired token. |
| 9 | Automation, communications and follow-up | 99 | 62 | 88 | Seven production dry-runs changed no fingerprinted state. The candidate makes newsletter simulation observational and disables blanket legacy-account consent delivery. |
| 10 | Analytics, Control Tower and commercial evidence | 99 | 62 | 88 | Control Tower will separate authenticated seller share actions by channel from actual buyer return visits. Fresh production evidence shows 60 older views but zero comparable views since full funnel measurement began. |
| 11 | Security, privacy and transactional integrity | 99 | 90 | 96 | Share evidence is owner-authenticated, active-listing-bound and stores no recipient, destination or message. Consent and transaction controls remain evidence-bound. |
| 12 | Deployment, production reliability and operability | 99 | 92 | 97 | The candidate passes 236 tests, 243 contracts, TypeScript, ESLint, optimized build and a 77-migration recovery. Its five append-only migrations remove no accepted vocabulary or hard schema, preserve the deployed negotiation RPC, accept all 25 current affected rows and successfully execute all eight seller-stage writes used by the live application before any one-deploy promotion. It remains unpromoted. |

## Aggregate

- Mean technical readiness: **97%**.
- Mean production/commercial proof: **44%**.
- Mean evidence-weighted maturity: **82%**.
- Deployment and rollback uncertainty decreased again, but commercial proof remains unchanged because no activity was manufactured.

## Next highest-value constraints

1. **Consolidated production activation:** the candidate is now proven schema-first and backward-compatible with both current data and the deployed application. Five exact migrations remain unapplied pending explicit release approval.
2. **Seller participation:** 11 listings need availability confirmation and seller networks remain unused as an acquisition source.
3. **Comparable traffic:** production has zero listing views since the complete buyer funnel became comparable; changing the form before acquiring traffic would be speculation.
4. **Commercial proof:** there is still no real comparable enquiry, new-balloon request or transaction with complete economics.
