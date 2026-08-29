# AeroTrade Latest Summary

Date: 2026-08-29
Status: `Production deployed, reconciled and measurable; used-or-new buyer journey is operational, real liquidity remains unproven`

## Current evidence

- Production: `https://aerotrade.app`, deployed from `main`.
- Database migrations are registered and read back through `20260829270000`.
- Validation: 70 automated tests, 63 operational contracts, ESLint and a full Next.js production build.
- Current evidence-based score: **88.0%**, detailed in `reviews/aerotrade-scorecard-2026-08-29.md`.
- Production deploy `6a929e37af6a03b10298da8a` is live from commit `c80de97`.
- The live Stripe webhook is enabled for checkout completion and expiry, successful charges, subscription updates/deletions and payment failures.
- Stripe rolling 90-day evidence: 5 checkout sessions, 1 completed/paid and 4 expired. The successful historical 9.99 EUR gross charge predates the current internal payment receipt and cannot be assigned to a product by inference.

## Material capabilities now live

- Used-equipment listings, Premium windows, seller contact and private buyer enquiries.
- Private wanted-equipment requests with opt-in matching and zero-result catalog demand measurement.
- Daily, opt-in wanted-equipment matching now sends at most five compatible active listings per digest, never repeats an accepted advert and retries failed or stale provider attempts through a private dispatch ledger.
- First-class new Pasha/Schroeder balloon route with indicative-budget requests, bounded source and demand context, explicit consent, server-side revalidation, duplicate/rate control and a one-time 24-hour operational follow-up.
- Used-catalogue searches now carry category, equipment wording and country into the new-balloon request; production verification preserved all three without creating a fictitious lead.
- Public search contract shared by metadata, structured data and sitemap: 12/12 public listings verified with canonical, indexability, Open Graph and breadcrumbs; 7 truthful priced Product offers, 0 invalid offers, unreleased Premium inventory excluded, and authentication pages noindexed.
- Four clean, inventory-backed category landing pages now target high-intent used-equipment demand; empty categories are noindexed, historical filter URLs redirect without losing the search and every category keeps a direct new-balloon alternative.
- Buyer acknowledgement for stored marketplace enquiries, with private durable provider receipts.
- Two-check listing-image quarantine: one broken listing was paused, the seller notification was accepted and the post-action audit reports 0 inaccessible active image files.
- One-time Premium listing checkout recovery: the real pending listing had one expired Stripe session and no paid session; one reminder was accepted, linked to the funnel and duplicate execution was suppressed.
- Evidence-based admin commercial pipeline and outcome values separated from settled AeroTrade revenue.
- Seller funnel measurement and owner-only recovery of interrupted Premium listing payment.
- Private Premium-membership checkout ledger, safe session resumption/replacement and signed-webhook closure.
- Durable email/provider evidence, controlled recovery semantics and privacy-minimized attribution.

## Principal remaining constraints

1. Real marketplace liquidity: no tracked enquiry, wanted request or new-balloon quote has yet produced a validated live opportunity; the new matching loop is healthy but has no real consented request to exercise it.
2. Checkout economics: the first real recovery is live and verified but has not yet improved the historical 20% completion rate; its eventual payment or free publication remains to be observed.
3. Supply quality: five sellers currently have active listings, no listing has completed the controlled verification gate, and two historical flight records still lack a serial number that cannot be inferred.
4. Acquisition: public inventory is technically discoverable and measurable, but search and source ledgers still have little or no production volume; Search Console performance evidence and seller recruitment remain absent.
5. Revenue proof: there is no settled marketplace intermediation outcome and no current internal receipt for the historical charge.

## Next highest-value work

Connect actual Search Console coverage/performance evidence to the existing source, search, contact and outcome ledgers, then recruit supply only against repeated verified demand. Do not inflate scores from implementation alone, infer revenue, alter prices, or launch unsolicited campaigns without the relevant evidence and authorization.
