# AeroTrade Latest Summary

Date: 2026-08-29
Status: `Production deployed, reconciled and measurable; real marketplace liquidity remains unproven`

## Current evidence

- Production: `https://aerotrade.app`, deployed from `main`.
- Database migrations are registered and read back through `20260829210000`.
- Validation: 46 automated tests, 49 operational contracts, ESLint and a full Next.js production build.
- Current evidence-based score: **83.3%**, detailed in `reviews/aerotrade-scorecard-2026-08-29.md`.
- The live Stripe webhook is enabled for checkout completion and expiry, successful charges, subscription updates/deletions and payment failures.
- Stripe rolling 90-day evidence: 5 checkout sessions, 1 completed/paid and 4 expired. The successful historical 9.99 EUR gross charge predates the current internal payment receipt and cannot be assigned to a product by inference.

## Material capabilities now live

- Used-equipment listings, Premium windows, seller contact and private buyer enquiries.
- Private wanted-equipment requests with opt-in matching and zero-result catalog demand measurement.
- First-class new Pasha/Schroeder balloon route with indicative-budget requests and bounded source attribution.
- Evidence-based admin commercial pipeline and outcome values separated from settled AeroTrade revenue.
- Seller funnel measurement and owner-only recovery of interrupted Premium listing payment.
- Private Premium-membership checkout ledger, safe session resumption/replacement and signed-webhook closure.
- Durable email/provider evidence, controlled recovery semantics and privacy-minimized attribution.

## Principal remaining constraints

1. Real marketplace liquidity: no tracked enquiry, wanted request or new-balloon quote has yet produced a validated live opportunity.
2. Checkout economics: the new recovery path is live but has not yet improved the historical 20% completion rate; no actual Stripe test secret is configured for a full non-live payment exercise.
3. Supply quality: six sellers have listings, no listing has completed the controlled verification gate, and one active listing has inaccessible image files.
4. Acquisition: search and source ledgers start with little or no production volume; seller recruitment has not been executed.
5. Revenue proof: there is no settled marketplace intermediation outcome and no current internal receipt for the historical charge.

## Next highest-value work

Use real funnel evidence to recruit supply against repeated buyer demand and measure source-to-contact-to-outcome conversion. Do not inflate scores from implementation alone, infer revenue, alter prices, or launch unsolicited campaigns without the relevant evidence and authorization.
