# AeroTrade seller trust-to-distribution readiness — 2026-08-29

## Commercial problem

The latest read-only production evidence shows 12 active listings from 5 sellers, zero owner availability confirmations and zero attributable visits from seller/listing share links. Supply exists, but neither its current availability nor seller-led distribution has been exercised.

## Change

The existing private seller availability flow now continues into the existing measured listing-share flow after a successful, fully read-back confirmation:

1. the seller reviews the exact due active listings behind the accepted 14-day capability;
2. the existing database action records and reads back one immutable confirmation per listing;
3. only after success, the same page displays WhatsApp/native-share controls for those confirmed listings;
4. each destination uses the existing canonical `seller_share` attribution and `listing_distribution` campaign; and
5. the seller chooses whether and where to share. AeroTrade sends nothing automatically.

No new database, ledger, campaign system, contact collection or automatic outreach was introduced.

## Verification

- 161/161 automated tests pass, including canonical and bounded seller-share URLs.
- 169/169 operational contracts pass.
- ESLint and TypeScript pass.
- The full Next.js 16.3.3 production build passes.
- The confirmation component is statically prohibited from calling email, commercial-delivery or fetch operations.
- Production, Netlify and sellers were not contacted or changed.

## Commercial-proof boundary

This improves activation readiness but does not prove demand. Scores must not credit a seller-share conversion until a genuine seller confirms inventory, voluntarily shares a link, a non-operator buyer visits it and a downstream watch, enquiry, wanted request or new-balloon request is observed.
