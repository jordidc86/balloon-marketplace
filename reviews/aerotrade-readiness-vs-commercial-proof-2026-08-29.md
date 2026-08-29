# AeroTrade: operational readiness versus commercial proof — 2026-08-29

## Why the distinction matters

The existing scorecard measures whether a capability exists, persists, is tested and fails safely. That is useful for software readiness, but it overstates how close AeroTrade is to a functioning marketplace when no genuine buyer-to-seller exchange has yet occurred. This review therefore reports two separate percentages:

- **Operational readiness:** verified capability in the currently deployed production release.
- **Commercial proof:** genuine production use showing supply, demand, conversion, payment or closure. Code, dry runs and synthetic checks receive no commercial-proof credit.

Authoritative snapshot: `reviews/marketplace-audit-current-2026-08-29.json`, captured read-only at `2026-08-29T17:11:17.219Z`. No row, message, payment or deployment was created by the audit.

## Current production evidence

- 12 active listings from 5 sellers; the three largest sellers hold 83.33% of active supply.
- 60 listing views in 30 days, all predating the complete comparable-funnel instrumentation; 0 comparable post-instrumentation views.
- 0 contact reveals, 0 listing watchers, 0 marketplace enquiries, 0 offer events and 0 listing closures.
- 0 owner availability confirmations and 0 verified listings.
- 0 new-balloon requests, proposals or responses.
- 0 commercial outcomes and 0 evidence-backed AeroTrade revenue in the current outcome ledger.
- One historical successful Stripe event exists, but it predates the current payment receipt and cannot be assigned to a product by inference.
- The bi-weekly newsletter has historically recorded 45 accepted recipient deliveries, but current production selects registered accounts without an explicit newsletter preference or individual stop control. This is a material privacy/operability gap; the grouped release candidate fixes it without treating legacy accounts as consented.
- Netlify created 96 successful production deploys on 29 August. At 15 credits per successful production deploy, at least 1,440 credits were consumed. The strict release-marker gate exists only in the grouped candidate and is not credited as current production.

## Category scores

| # | Category | Operational readiness | Commercial proof | Evidence-limited interpretation |
|---|---|---:|---:|---|
| 1 | Value proposition, model and unit economics | 68% | 15% | Products and outcome fields exist; no closed outcome, complete unit economics or settled intermediation revenue. |
| 2 | Seller acquisition and onboarding | 90% | 40% | Five real sellers and twelve active adverts prove basic supply, but assisted onboarding and recruitment have no real conversion. |
| 3 | Listing quality, verification and trust | 89% | 20% | Images and required fields are healthy; zero owners have confirmed availability and zero adverts are verified. |
| 4 | Catalogue, search and buyer experience | 93% | 45% | Public inventory and search work; inventory is narrow and no comparable buyer journey has started since instrumentation. |
| 5 | Buyer-seller conversion and opportunity tracking | 96% | 5% | The full enquiry/negotiation path is built; production has zero enquiries, offers, responses or closures. |
| 6 | Premium, payments and revenue traceability | 95% | 20% | Stripe and ledgers work, but current receipts do not prove a product-level recurring or marketplace revenue stream. |
| 7 | New-balloon requests and intermediation | 98% | 0% | Positioning and proposal flow exist; no genuine request has entered it. |
| 8 | SEO, international acquisition and demand measurement | 97% | 35% | IndexNow accepted public URLs and legacy views exist; Google Search Console and attributable conversion evidence do not. |
| 9 | Commercial automation and communications | 78% | 30% | Delivery ledgers operate, but genuine opportunity recovery is absent and newsletter consent is unsafe in current production. |
| 10 | Analytics and Control Tower | 98% | 50% | Aggregates are reliable enough to reveal the zeroes; source-to-outcome analysis cannot be proven without outcomes. |
| 11 | Security, privacy, antifraud and integrity | 78% | 35% | Core private workflows are strong, but the current newsletter recipient rule is not an acceptable European operating boundary. |
| 12 | Production, deploys, tests and recovery | 65% | 45% | Production is available and tested, but the repeated Netlify releases demonstrate weak release-cost control. |

**Current production average:** 87.1% operational readiness; **28.3% commercial proof**.

The grouped candidate may raise readiness after one controlled release and readback, but it cannot raise commercial proof merely by deploying.

## Highest-value sequence

1. **One controlled release, not incremental deploys.** Apply the additive candidate migrations, activate the explicit release marker and the consent-safe newsletter, then verify production in read-only/dry-run mode. Expected Netlify cost: one successful production deploy (15 credits), not a stream of commits.
2. **Re-establish truthful inventory.** Ask active owners to confirm availability through the existing authenticated action. Target: at least 8 of 12 active listings with fresh owner evidence before describing inventory as reliable.
3. **Run one attributable demand experiment.** Use the candidate social receipt ledger or explicitly consented newsletter recipients, not an untracked blast. Target: at least 25 comparable listing views and a non-zero CTA/form-start rate.
4. **Prove one complete commercial journey.** Target one genuine watch, enquiry or new-balloon request progressing to a stored response. No synthetic event counts.
5. **Prove economics on the first genuine close.** Record gross value, AeroTrade revenue, all costs and evidence; keep unknowns null and do not infer settlement.

## 14-day proof gate after release

Do not call AeroTrade commercially operational until production evidence shows all of:

- at least 8 fresh owner availability confirmations;
- at least 25 comparable buyer views from attributable journeys;
- at least 3 genuine high-intent actions across watches, enquiries, wanted requests or new-balloon requests;
- at least 1 genuine buyer-seller or buyer-AeroTrade response;
- zero newsletter delivery to a `NOT_REQUESTED` or `UNSUBSCRIBED` profile;
- exactly one expected Netlify production deploy for the grouped release;
- no invented outcome, payment, cost or revenue.
