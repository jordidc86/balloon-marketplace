# AeroTrade Latest Summary

Date: 2026-08-31
Status: `Production is technically mature; the principal constraints are real marketplace liquidity, fresh seller participation and a currently expired Meta credential.`

## Authoritative production state

- Production: `https://aerotrade.app`, served from commit `e9630bda8507e7c609adad3148ab4c05df8bffd2` by ready Netlify deploy `6a95a2b7d784cef925c11da3` on the protected `production` branch.
- Candidate validation: 212 automated tests, 231 operational contracts, ESLint, TypeScript, the optimized Next.js production build and a complete 75-migration disposable database recovery plus marketplace and new-balloon transaction rehearsals pass. Candidate capability is not counted as live production.
- Latest PII-free audit: `reviews/marketplace-audit-2026-08-31-v13.json`.
- Current category scorecard: `reviews/aerotrade-category-scorecard-2026-08-31-v14.md` — mean technical readiness 97%, production/commercial proof 44%, evidence-weighted maturity 81%.
- Supply: 12 active listings from 6 sellers; all 84 active image files are reachable; one additional listing remains pending payment.
- Trust: 1/12 active listings has current owner availability evidence; 11 remain unconfirmed and no listing has document-verification evidence.
- Demand and closing: no comparable stored marketplace enquiry, negotiation, new-balloon request or closed marketplace transaction exists yet.
- Monetisation: Buyer Early Access and Seller Launch Promotion remain separate products. One historical real buyer payment is provider-evidenced; no seller-promotion or marketplace-closing revenue is proven.
- Inventory closure: one listing is immutably sold and excluded from available inventory. Its channel remains honestly undisclosed; Control Tower can now add one administrator-only, append-only clarification later without altering the closure, reopening inventory or creating revenue.
- Deployment isolation: a measured shared-credit outage was traced to 83 production deploys. Netlify now publishes AeroTrade only from `production`, manual non-Git production deploys are blocked, and two subsequent `main` pushes created no Netlify deploy. Production and the sold-listing readback return HTTP 200. Evidence: `reviews/netlify-production-guard-verification-2026-08-31.json`.
- Transaction integrity: one fully synthetic, disposable-database path now covers enquiry, seller counteroffer, buyer response, owner-authorized closure, atomic WON outcome and complete unit economics. It found and corrected an ordering ambiguity caused by tied transaction timestamps and random UUIDs; freshness now uses a monotonic database sequence. No production system or external recipient was touched. Evidence: `reviews/marketplace-transaction-rehearsal-2026-08-31.json`.
- New-balloon integrity: a second fully synthetic path now covers stored request, operator proposal, provider-accepted delivery, immutable buyer interest, administrator-only commercial outcome and complete intermediation economics. Premature and unauthorized transitions fail closed, repeated delivery and buyer responses are idempotent, and no external message was sent. Evidence: `reviews/new-balloon-transaction-rehearsal-2026-08-31.json`.

## Newly live acquisition capability

- A visitor who does not create an account can now request the existing twice-monthly marketplace newsletter from the homepage or catalogue.
- The flow is double opt-in: the request remains `PENDING`, provider acceptance alone does not activate it, opening the link performs no write, and only a signed explicit POST produces `ACTIVE` consent.
- Public preference rows are private; anonymous reads are blocked. The abuse key is a one-way HMAC and no raw IP address or browser identifier is retained.
- Account and public consent are deduplicated by normalized address. Account consent remains authoritative when both exist.
- Every public newsletter recipient receives a signed explicit stop action. Failed confirmation delivery can retry once only for the exact current consent cycle.
- Production started with 0 public requests and 0 public active consents. The combined current newsletter audience is 1 explicitly consented account. No legacy contact was imported and no campaign was sent during release.
- Production proof: `reviews/public-newsletter-production-verification-2026-08-31.json`.
- Public requests now reuse AeroTrade&apos;s existing bounded first-source and daily HMAC journey attribution. Control Tower can separate homepage, catalogue and campaign acquisition without displaying the address or retaining a raw visitor identifier. Production proof: `reviews/public-newsletter-attribution-production-verification-2026-08-31.json`.
- A requested listing evidence review now gives the seller a reply-enabled checklist and persistent dashboard handoff, records provider acceptance separately and retries only while the exact review request remains open. No document copy, number or evidence link is stored in the marketplace database. Production proof: `reviews/listing-verification-evidence-handoff-production-verification-2026-08-31.json`.
- A sold listing whose channel was initially unknown can now be clarified once in Control Tower. AeroTrade attribution requires a matching non-spam enquiry; the clarification never creates a commercial outcome or revenue. Production proof: `reviews/listing-sale-clarification-production-verification-2026-08-31.json`.

## Material commercial constraints

1. **Fresh supply:** 11 active listings across 5 seller portfolios need genuine owner reconfirmation. The grouped, one-email-per-seller flow is technically ready, but sending it requires Jordi's exact outreach approval.
2. **Qualified buyers:** the catalogue has traffic but no comparable post-instrumentation buyer enquiry. Public double opt-in can now accumulate consented demand; it has not yet produced a real subscriber or conversion.
3. **Seller activation:** the pending-payment seller can either resume the 5 EUR promotion checkout or publish free. AeroTrade must not choose for the seller.
4. **Commercial closing proof:** used-equipment and new-balloon revenue paths now pass end-to-end synthetic rehearsals, but no genuine equipment transaction has exercised either path in production.
5. **Availability and verification:** current photos do not prove current ownership, availability, identity, documents or airworthiness. These states remain separate and evidence-bound.
6. **Social distribution:** Meta accepted four historical placements, but two were image-only stories and only two carried the destination in post text or caption. No attributable AeroTrade action followed, and the current production Meta token is expired. Evidence: `reviews/social-publication-audit-2026-08-31.json`.

## Next highest-value action

The next internal engineering work should improve acquisition and commercial follow-up only where it can be validated without manufacturing activity. Social reporting now separates provider acceptance, awareness-only stories, destination candidates and observed traffic; it must not claim acquisition from acceptance alone. The next external action with the highest immediate supply value is a single grouped availability request to each of the 5 due sellers covering 11 listings, but no seller message may be sent without explicit approval. Restoring Meta requires a valid credential and a read-only provider check before any new publication. Commercial-proof scores must not rise until a real seller confirms, a real visitor opts in, a qualified buyer contacts a seller, or a transaction/outcome is evidenced.
