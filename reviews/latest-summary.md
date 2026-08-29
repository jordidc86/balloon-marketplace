# AeroTrade Latest Summary

Date: 2026-08-29
Status: `Production deployed, reconciled and measurable; used and new-balloon opportunities can progress to traceable proposals and closure, real liquidity and revenue remain unproven`

## Current evidence

- Production: `https://aerotrade.app`, deployed from `main`.
- Database migrations are registered and read back through `20260829420000`; four previously remote-only historical versions are also consolidated in source control.
- Validation: 110 automated tests, 103 operational contracts, ESLint, TypeScript and a full Next.js production build.
- Current evidence-based score: **92.8%**, detailed in `reviews/aerotrade-scorecard-2026-08-29.md`.
- Production deploy `6a92e0792536cb512ad0bb20` published the complete application release from source commit `07f29ad`; the following Git deploy `6a92e195b646a0000876b225` established the same source state as the tracked production baseline.
- Buyer-to-seller negotiation replies and the private buyer response route are live. The additive migration is read back, the public route is noindexed, the service-only transition is denied to anonymous callers with `42501`, and verification created no synthetic response or customer email.
- A conservative Netlify build gate is live: it skips only evidence, documentation, test, script and separately managed migration-only commits, and fails safe for application, function, configuration, unknown-file or diff errors. A replay of the latest 20 commits would have avoided 9 unnecessary builds (45%) while retaining all 11 runtime builds.
- The live Stripe webhook is enabled for checkout completion and expiry, successful charges, subscription updates/deletions and payment failures.
- Stripe rolling 90-day evidence: 5 checkout sessions, 1 completed/paid and 4 expired. The successful historical 9.99 EUR gross charge predates the current internal payment receipt and cannot be assigned to a product by inference.

## Material capabilities now live

- Used-equipment listings, 48-hour Buyer Early Access windows, seller contact and private buyer enquiries.
- The annual 9.99 EUR Buyer Early Access product and one-time 5 EUR Seller Launch Promotion are now named and scoped separately across the website, Stripe checkout, dashboard, payment notifications, recovery and terms. Prices, payment modes and webhook metadata remain unchanged; unsupported personal WhatsApp, personal outreach and priority-response claims were removed.
- A buyer may attach a structured indicative offer to a listing enquiry. The listing owner can continue negotiating, counter or decline through an owner-only atomic workflow; every event is stored before notification and read back. It is explicitly non-binding and performs no reservation, payment or contract action.
- Each current public listing now exposes a direct enquiry call-to-action next to its price and measures, without raw visitor identifiers, the progression from listing view to CTA click, visible form, first form interaction and stored enquiry. Control Tower reports the resulting drop-off stages while operator and listing-owner activity remains excluded.
- A buyer can answer one current seller negotiation event through a 30-day, purpose-bound private capability. Accept, counter and decline are atomic, idempotent and non-binding; the seller is notified only after persistence and readback, and neither money nor equipment can move through this route.
- Closing a marketplace enquiry or new-balloon quote as won now requires one admin-authorized atomic transaction. Gross value, AeroTrade revenue, WON state and an immutable evidence snapshot commit together. Manual WON bypasses are blocked at both UI/action and database levels; documented outcomes need a reference, settled revenue needs a bank or Stripe reference, and evidence cannot be downgraded.
- Private wanted-equipment requests with opt-in matching and zero-result catalog demand measurement.
- Daily, opt-in wanted-equipment matching now sends at most five compatible active listings per digest, never repeats an accepted advert and retries failed or stale provider attempts through a private dispatch ledger.
- First-class new Pasha/Schroeder balloon route with indicative-budget requests, bounded source and demand context, explicit consent, server-side revalidation, duplicate/rate control and a one-time 24-hour operational follow-up.
- Every missing-inventory state now gives the buyer two explicit commercial paths: tell AeroTrade what used equipment is needed, or request an approximate Pasha/Schroeder budget. Factory-new availability is stated independently of the used catalogue, while the price remains non-binding until configuration review.
- AeroTrade now states explicitly in its company positioning and contact journey that it can sell a factory-new Pasha or Schroeder balloon when used inventory is unsuitable. About, contact and zero-result entry points route to the same structured quotation path and retain a bounded source for conversion measurement.
- A stored new-balloon request can now become a structured operator-priced proposal with manufacturer, price range, configuration, delivery guidance, validity and conditions. It is saved before delivery, explicitly non-binding, deduplicated by content and advances to QUOTE_SENT only after provider acceptance plus database readback.
- Used-catalogue searches now carry category, equipment wording and country into the new-balloon request; production verification preserved all three without creating a fictitious lead.
- A specific used listing now carries its public model, category and country into the factory-new alternative, so the buyer does not restart the enquiry from zero.
- A daily server-HMAC journey key joins catalogue search, listing view, direct contact, tracked enquiry, wanted demand and new-balloon quotation without retaining a raw browser/user identifier; administrator and listing-owner activity is excluded and only aggregate stages are shown.
- A daily IndexNow workflow submits only current public commercial URLs. The first 24-URL delivery was accepted with HTTP 202, the result was read back from a private receipt, a repeated execution was suppressed and the admin dashboard exposes aggregate status.
- Public search contract shared by metadata, structured data and sitemap: 12/12 public listings verified with canonical, indexability, Open Graph and breadcrumbs; 7 truthful priced Product offers, 0 invalid offers, unreleased Premium inventory excluded, and authentication pages noindexed.
- Four clean, inventory-backed category landing pages now target high-intent used-equipment demand; empty categories are noindexed, historical filter URLs redirect without losing the search and every category keeps a direct new-balloon alternative.
- Three inventory-backed manufacturer pages now expose 6 Cameron, 3 Kubicek and 2 Ultramagic active matches. A two-public-listing threshold prevents thin pages; Schroeder and unknown manufacturers do not enter the sitemap. The 29-URL public set was accepted by IndexNow and a repeated run was deduplicated.
- Four inventory-backed country pages now expose 3 listings in Spain, 2 in Belgium, 2 in the Czech Republic and 5 in Türkiye. The same two-public-listing threshold prevents empty location pages; all four retain measured used-sourcing and factory-new alternatives. The resulting 33-URL public set was accepted by IndexNow and the repeated run was deduplicated.
- Buyer acknowledgement for stored marketplace enquiries, with private durable provider receipts.
- Two-check listing-image quarantine: one broken listing was paused, the seller notification was accepted and the post-action audit reports 0 inaccessible active image files.
- One-time Seller Launch Promotion checkout recovery: the real pending listing had one expired Stripe session and no paid session; one reminder was accepted, linked to the funnel and duplicate execution was suppressed.
- Seller-requested listing verification: only eligible public listings can enter the private queue; decisions require bounded identity/evidence categories and an explicit scope acknowledgement, state plus audit event commit atomically, notification evidence is durable, and no document copy or identifier is retained.
- Evidence-based admin commercial pipeline and outcome values separated from settled AeroTrade revenue.
- Seller funnel measurement and owner-only recovery of interrupted Seller Launch Promotion payment.
- A public but private-by-default assisted-sale intake now converts owners who lack photos, documents or pricing into a consented commercial case. It stores before notification, suppresses duplicates and abuse, receives one 24-hour admin follow-up, and cannot be marked LISTED without a matching normal marketplace listing.
- A public high-intent seller page routes owners into either the complete free listing or the private assisted path. Authentication happens before the long form, preserving the seller return path; a closed, non-PII entry label now measures which seller path reaches submission, checkout and publication.
- Assisted sellers can now provide an existing public advert URL once for private manual transfer review. The application validates and stores the reference but never fetches, copies or publishes its content automatically.
- Every active public listing now has channel-specific WhatsApp, email, native-share and copy links, while active owners have the same compact controls in their dashboard. The links use bounded campaign labels so genuine seller-led distribution can be separated from legacy unattributed views without sending any message automatically.
- A buyer not ready to contact can now request a private watch for one listing. Double opt-in, scanner-safe confirmation, material-change snapshots, final consent recheck, provider evidence, idempotent retry and signed unsubscribe keep the alert operational rather than promotional. Sellers see only the aggregate confirmed-watcher count, while Control Tower adds the watch stage to the measured buyer journey.
- The read-only production audit now uses named query specifications. This fixed a silent positional mismatch that had understated seller-funnel evidence and makes future table additions safe from cross-attribution.
- Private Buyer Early Access checkout ledger, safe session resumption/replacement and signed-webhook closure.
- Durable email/provider evidence, controlled recovery semantics and privacy-minimized attribution.

## Principal remaining constraints

1. Real marketplace liquidity: production still has 0 confirmed listing watchers, 0 marketplace enquiries and 0 negotiation events. The watch, enquiry, indicative-offer and seller-response paths are healthy, but no real buyer/seller exchange has exercised response time or conversion.
2. Checkout economics: the first real recovery is live and verified but has not yet improved the historical 20% completion rate; its eventual payment or free publication remains to be observed.
3. Supply quality: five sellers currently have active listings, eleven accounts have no active listing, no assisted-sale request, seller-share visit or listing-verification request has yet exercised those controlled workflows, and two historical flight records still lack a serial number that cannot be inferred.
4. Acquisition: public inventory is discoverable, daily IndexNow delivery is accepted and future journeys are attributable, but the 60 legacy views cannot be reconstructed. The accessible Google account has no `aerotrade.app` Search Console property, and a public search sample surfaced only the homepage plus one listing, so Google coverage/performance and seller recruitment remain absent.
5. Revenue proof: there is no settled marketplace intermediation outcome and no current internal receipt for the historical charge.
6. Build-credit efficiency is now deployed, but its production skip behavior still needs one post-baseline evidence-only Git commit before the historical 45% saving can be treated as observed rather than simulated.

## Next highest-value work

Observe the first genuine listing CTA, form start, stored enquiry and negotiation response before changing the conversion score; the system now identifies exactly where that journey loses buyers. Separately, with explicit owner approval, add `aerotrade.app` to Google Search Console and submit the existing sitemap. Do not inflate scores from implementation alone, infer revenue, alter prices, or launch unsolicited campaigns without evidence and authorization.
