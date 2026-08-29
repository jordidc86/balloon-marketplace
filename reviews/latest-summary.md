# AeroTrade Latest Summary

Date: 2026-08-29
Status: `Production deployed, reconciled and measurable; buyer demand and unready seller supply now remain recoverable, real liquidity remains unproven`

## Current evidence

- Production: `https://aerotrade.app`, deployed from `main`.
- Database migrations are registered and read back through `20260829310000`.
- Validation: 84 automated tests, 73 operational contracts, ESLint and a full Next.js production build.
- Current evidence-based score: **90.0%**, detailed in `reviews/aerotrade-scorecard-2026-08-29.md`.
- Production deploy `6a92ab978e4a2000087b18b1` is live from commit `2921ba8`.
- The live Stripe webhook is enabled for checkout completion and expiry, successful charges, subscription updates/deletions and payment failures.
- Stripe rolling 90-day evidence: 5 checkout sessions, 1 completed/paid and 4 expired. The successful historical 9.99 EUR gross charge predates the current internal payment receipt and cannot be assigned to a product by inference.

## Material capabilities now live

- Used-equipment listings, Premium windows, seller contact and private buyer enquiries.
- Private wanted-equipment requests with opt-in matching and zero-result catalog demand measurement.
- Daily, opt-in wanted-equipment matching now sends at most five compatible active listings per digest, never repeats an accepted advert and retries failed or stale provider attempts through a private dispatch ledger.
- First-class new Pasha/Schroeder balloon route with indicative-budget requests, bounded source and demand context, explicit consent, server-side revalidation, duplicate/rate control and a one-time 24-hour operational follow-up.
- Used-catalogue searches now carry category, equipment wording and country into the new-balloon request; production verification preserved all three without creating a fictitious lead.
- A specific used listing now carries its public model, category and country into the factory-new alternative, so the buyer does not restart the enquiry from zero.
- A daily server-HMAC journey key joins catalogue search, listing view, direct contact, tracked enquiry, wanted demand and new-balloon quotation without retaining a raw browser/user identifier; administrator and listing-owner activity is excluded and only aggregate stages are shown.
- A daily IndexNow workflow submits only current public commercial URLs. The first 24-URL delivery was accepted with HTTP 202, the result was read back from a private receipt, a repeated execution was suppressed and the admin dashboard exposes aggregate status.
- Public search contract shared by metadata, structured data and sitemap: 12/12 public listings verified with canonical, indexability, Open Graph and breadcrumbs; 7 truthful priced Product offers, 0 invalid offers, unreleased Premium inventory excluded, and authentication pages noindexed.
- Four clean, inventory-backed category landing pages now target high-intent used-equipment demand; empty categories are noindexed, historical filter URLs redirect without losing the search and every category keeps a direct new-balloon alternative.
- Buyer acknowledgement for stored marketplace enquiries, with private durable provider receipts.
- Two-check listing-image quarantine: one broken listing was paused, the seller notification was accepted and the post-action audit reports 0 inaccessible active image files.
- One-time Premium listing checkout recovery: the real pending listing had one expired Stripe session and no paid session; one reminder was accepted, linked to the funnel and duplicate execution was suppressed.
- Seller-requested listing verification: only eligible public listings can enter the private queue; decisions require bounded identity/evidence categories and an explicit scope acknowledgement, state plus audit event commit atomically, notification evidence is durable, and no document copy or identifier is retained.
- Evidence-based admin commercial pipeline and outcome values separated from settled AeroTrade revenue.
- Seller funnel measurement and owner-only recovery of interrupted Premium listing payment.
- A public but private-by-default assisted-sale intake now converts owners who lack photos, documents or pricing into a consented commercial case. It stores before notification, suppresses duplicates and abuse, receives one 24-hour admin follow-up, and cannot be marked LISTED without a matching normal marketplace listing.
- Private Premium-membership checkout ledger, safe session resumption/replacement and signed-webhook closure.
- Durable email/provider evidence, controlled recovery semantics and privacy-minimized attribution.

## Principal remaining constraints

1. Real marketplace liquidity: no tracked enquiry, wanted request or new-balloon quote has yet produced a validated live opportunity; the new matching and factory-new paths are healthy but have no real consented request to exercise them.
2. Checkout economics: the first real recovery is live and verified but has not yet improved the historical 20% completion rate; its eventual payment or free publication remains to be observed.
3. Supply quality: five sellers currently have active listings, no assisted-sale request or listing-verification request has yet exercised either controlled workflow, and two historical flight records still lack a serial number that cannot be inferred.
4. Acquisition: public inventory is discoverable, daily IndexNow delivery is accepted and future journeys are attributable, but the 60 legacy views cannot be reconstructed. The accessible Google account has no `aerotrade.app` Search Console property, and a public search sample surfaced only the homepage plus one listing, so Google coverage/performance and seller recruitment remain absent.
5. Revenue proof: there is no settled marketplace intermediation outcome and no current internal receipt for the historical charge.

## Next highest-value work

With explicit owner approval, add `aerotrade.app` to Google Search Console and submit the existing sitemap; then connect real coverage/performance evidence to the acquisition-to-request ledger. IndexNow is already autonomous for participating engines but is not Google proof. Do not inflate scores from implementation alone, infer revenue, alter prices, or launch unsolicited campaigns without evidence and authorization.
