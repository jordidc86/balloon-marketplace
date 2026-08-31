# AeroTrade Latest Summary

Date: 2026-08-31
Status: `Production is technically mature and measurable; the principal constraint is now real marketplace liquidity and fresh seller participation, not missing core workflow code.`

## Authoritative production state

- Production: `https://aerotrade.app`, served from commit `39a16cfaa693618b3d617c6de7d1f46c774b564d` by ready Netlify deploy `6a958ba16d711200077401fa`.
- Validation: 194 automated tests, 207 operational contracts, ESLint, TypeScript and the optimized Next.js production build pass.
- Latest PII-free audit: `reviews/marketplace-audit-2026-08-31-v6.json`.
- Current category scorecard: `reviews/aerotrade-category-scorecard-2026-08-31-v6.md` — mean technical readiness 97%, production/commercial proof 45%, evidence-weighted maturity 81%.
- Supply: 12 active listings from 6 sellers; all 84 active image files are reachable; one additional listing remains pending payment.
- Trust: 1/12 active listings has current owner availability evidence; 11 remain unconfirmed and no listing has document-verification evidence.
- Demand and closing: no comparable stored marketplace enquiry, negotiation, new-balloon request or closed marketplace transaction exists yet.
- Monetisation: Buyer Early Access and Seller Launch Promotion remain separate products. One historical real buyer payment is provider-evidenced; no seller-promotion or marketplace-closing revenue is proven.

## Newly live acquisition capability

- A visitor who does not create an account can now request the existing twice-monthly marketplace newsletter from the homepage or catalogue.
- The flow is double opt-in: the request remains `PENDING`, provider acceptance alone does not activate it, opening the link performs no write, and only a signed explicit POST produces `ACTIVE` consent.
- Public preference rows are private; anonymous reads are blocked. The abuse key is a one-way HMAC and no raw IP address or browser identifier is retained.
- Account and public consent are deduplicated by normalized address. Account consent remains authoritative when both exist.
- Every public newsletter recipient receives a signed explicit stop action. Failed confirmation delivery can retry once only for the exact current consent cycle.
- Production started with 0 public requests and 0 public active consents. The combined current newsletter audience is 1 explicitly consented account. No legacy contact was imported and no campaign was sent during release.
- Production proof: `reviews/public-newsletter-production-verification-2026-08-31.json`.

## Material commercial constraints

1. **Fresh supply:** 11 active listings across 5 seller portfolios need genuine owner reconfirmation. The grouped, one-email-per-seller flow is technically ready, but sending it requires Jordi's exact outreach approval.
2. **Qualified buyers:** the catalogue has traffic but no comparable post-instrumentation buyer enquiry. Public double opt-in can now accumulate consented demand; it has not yet produced a real subscriber or conversion.
3. **Seller activation:** the pending-payment seller can either resume the 5 EUR promotion checkout or publish free. AeroTrade must not choose for the seller.
4. **Commercial closing proof:** negotiation, proposal, outcome and economics ledgers exist, but no genuine equipment transaction has exercised them end to end.
5. **Availability and verification:** current photos do not prove current ownership, availability, identity, documents or airworthiness. These states remain separate and evidence-bound.

## Next highest-value action

The next internal engineering work should improve acquisition measurement and commercial follow-up only where it can be validated without manufacturing activity. The next external action with the highest immediate supply value is a single grouped availability request to each of the 5 due sellers covering 11 listings, but no seller message may be sent without explicit approval. Commercial-proof scores must not rise until a real seller confirms, a real visitor opts in, a qualified buyer contacts a seller, or a transaction/outcome is evidenced.
