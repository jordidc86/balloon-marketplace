# AeroTrade monetization-boundary audit — 2026-08-29

Status: evidence-based business decision required. No pricing, terms, checkout, Stripe or production change has been made.

## Finding

AeroTrade can now record a won opportunity, AeroTrade revenue and complete unit economics, but the current public product contract intentionally prevents the marketplace from charging a transaction commission:

- `/pricing` says AeroTrade is an open directory, not a broker, and never takes a percentage of an equipment sale.
- `/terms` says AeroTrade is not a broker or party to the transaction, does not handle payment for the equipment and that neither paid product creates a commission.
- Stripe currently sells only two closed products: annual Buyer Early Access at 9.99 EUR and one-time Seller Launch Promotion at 5 EUR.
- The current webhook, receipts and recovery logic recognize those products; unknown payments are reported as `other` but are not fulfilled as a transaction fee.

Therefore, adding a success-fee checkout is not merely an implementation improvement. It would contradict the current public promise and change the legal/commercial model.

## Current revenue capacity

The latest read-only production evidence has 16 users and 14 total listings. At current public prices, the purely illustrative upper bound for one annual subscription from every current account plus one launch promotion for every current listing would be:

- 16 × 9.99 EUR = 159.84 EUR annual buyer-subscription gross.
- 14 × 5 EUR = 70 EUR one-time listing-promotion gross.
- Combined illustrative gross = 229.84 EUR for the present cohort and listing set.

This is not forecast revenue and assumes 100% conversion, which has not occurred. The only confirmed rolling-90-day Stripe evidence is one historical 9.99 EUR gross charge, and it predates current product metadata/receipt attribution. No net revenue is inferred.

## Consequence

The existing directory model can validate demand and create transactions between users, but the present prices and supply volume cannot by themselves support meaningful AeroTrade income. Unit-economics instrumentation improves truth; it does not solve monetization.

## Coherent options

### A. Keep the no-commission directory model

Revenue remains limited to buyer access and seller promotion. Growth must come from much higher listing and buyer volume or later approved price/package changes. This preserves the current legal and product boundary.

### B. Add a separately purchased fixed commercial service

Examples could include a bounded seller transaction-support package, enhanced listing preparation or documented commercial coordination. The service would need an exact deliverable, fixed operator-approved price, refund rules, terms and Stripe metadata. It must not imply escrow, airworthiness, title verification or control of the equipment sale.

### C. Introduce a success fee or brokerage/intermediation model

This creates the clearest link between closed operations and AeroTrade income but directly changes the current promise. Before implementation it needs an explicit payer, fee basis, rate or fixed amount, trigger, invoicing/tax treatment, cancellation/refund/dispute handling, jurisdictional review and revised terms/copy.

### D. Monetize factory-new balloon opportunities separately

New Pasha/Schroeder requests can produce operator-supplied proposals and evidence-backed intermediation outcomes without charging for a used-equipment transaction. Revenue can be recorded only when supported by the actual commercial agreement and settlement evidence. The current system must not invent a commission or expose a guessed manufacturer price.

## Recommendation

Keep the used-equipment marketplace on option A for the current release while proving traffic and liquidity. Treat option D as the nearest path to material revenue because AeroTrade already has the structured new-balloon funnel and it does not require contradicting the used-marketplace “no commission” promise. Evaluate option B only after defining one concrete deliverable and price. Do not implement option C without a deliberate business/legal decision.

## Exact decision required before further payment development

Jordi must choose one of these commercial directions:

1. Keep used-equipment sales commission-free and monetize only existing products plus factory-new opportunities.
2. Design one fixed-price optional commercial service while retaining commission-free equipment sales.
3. Replace the no-commission promise with an approved success-fee model and authorize the required legal/product redesign.

No payment-development score should increase until the chosen model is live and at least one real payment can be attributed to it with complete unit economics.
