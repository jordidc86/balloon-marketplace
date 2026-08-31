# AeroTrade category scorecard — 2026-08-31 v10

This update combines the read-only production snapshot `marketplace-audit-2026-08-31-v9.json`, the sale-clarification receipt and `netlify-production-guard-verification-2026-08-31.json`. No commercial proof is inferred and the scorecard contains no personal data.

## Method

- **Technical readiness (70%)** measures whether the complete path exists, is guarded, auditable, tested and recoverable.
- **Production/commercial proof (30%)** measures whether real users and providers have completed the path recently.
- **Maturity** is `technical readiness × 0.70 + production/commercial proof × 0.30`, rounded to a whole percentage.

| # | Category | Technical | Proof | Maturity | Current evidence and principal gap |
|---|---|---:|---:|---:|---|
| 1 | Value proposition, business model and unit economics | 93 | 30 | 74 | Buyer and seller products have distinct provider evidence; one sold listing has an immutable closure. No marketplace transaction has evidenced complete economics. |
| 2 | Seller acquisition, onboarding and activation | 93 | 42 | 78 | 12 active listings from 6 sellers and one pending-payment listing. The pending seller has not chosen paid promotion or free publication. |
| 3 | Listing quality, trust, verification and availability | 97 | 35 | 78 | All 84 active image files are reachable. No listing has real document-verification evidence and 11/12 active listings lack current availability. |
| 4 | Catalogue, search and buyer experience | 96 | 30 | 76 | Public catalogue, bounded search, mobile routes, international landings and sold-listing recovery are live. Attributable qualified demand remains low. |
| 5 | Buyer conversion, enquiry and marketplace closing | 97 | 5 | 69 | Account-free enquiry, negotiation, follow-up and closure paths are implemented. There is no comparable real enquiry or closed marketplace transaction. |
| 6 | Premium, payments and monetisation | 99 | 70 | 90 | Seller Launch checkout is durable and fail-closed. One historical buyer payment is evidenced; no seller-promotion or closing revenue is proven. |
| 7 | New-balloon sales: Pasha and Schroeder | 97 | 0 | 68 | Request, proposal, response, outcome and settlement paths exist. Production still has zero genuine requests or proposals. |
| 8 | SEO, international acquisition and distribution | 97 | 20 | 74 | Localised acquisition, structured data, IndexNow, social distribution and public double opt-in are live. Public newsletter requests remain at zero. |
| 9 | Automation, communications and follow-up | 99 | 70 | 90 | Paid alerts, negotiations, proposals, newsletters and recovery are provider-idempotent, bounded and receipt-readback bound. |
| 10 | Analytics, Control Tower and commercial evidence | 99 | 60 | 87 | Control Tower separates immutable closures from later evidence-bound attribution. The one closure remains undisclosed and there are no clarifications. |
| 11 | Security, privacy and transactional integrity | 99 | 90 | 96 | Sale clarifications are administrator-only and append-only. Anonymous invocation is rejected and no revenue or outcome is inferred. |
| 12 | Deployment, production reliability and operability | 99 | 95 | 98 | A real shared-credit outage was traced to 83 production deploys. Netlify now publishes only `production`, blocks manual non-Git production deploys, and two later `main` pushes created no deploy. Production readback is HTTP 200 and the published commit equals the protected branch. |

## Aggregate

- Mean technical readiness: **97%**.
- Mean production/commercial proof: **46%**.
- Mean evidence-weighted maturity: **82%**.
- Deployment maturity increased from 96% to 98% because a real outage was diagnosed, recovered and protected against the measured cause. Shared account-level quota remains a residual dependency.

## Next highest-value constraints

1. **Qualified demand:** production has no comparable buyer enquiry, new-balloon request or public newsletter confirmation.
2. **Supply freshness:** 11 listings across 5 seller portfolios need genuine owner confirmation; the grouped flow is ready but outbound use still requires exact approval.
3. **Commercial closing proof:** the complete closing and economics path has not yet been exercised by one genuine marketplace transaction.
4. **Shared hosting quota:** AeroTrade no longer consumes a deploy for ordinary `main` work, but another project on the same Netlify account can still exhaust the shared pool. Automatic top-up remains disabled and no economic action was taken.
