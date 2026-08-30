# AeroTrade grouped production release verification — 2026-08-30

## Release identity

- Production commit: `8e6bfef5f25a6610ef51f3e542f96857b37904f1`.
- Netlify deploy: `6a93e3e585f3840008e4aaa1`.
- Result: `ready`, published at `2026-08-30T08:04:47.556Z` after one production build.
- All twelve migrations from `20260829490000` through `20260829600000` are present in the remote ledger and passed readback.

## Gates and production smoke checks

- `162/162` automated tests and `173/173` operational contracts passed.
- ESLint, TypeScript and the full Next.js production build passed.
- Public catalogue, new-balloon, used-balloon and all four localized buyer entries returned HTTP 200.
- Protected commercial administration redirected unauthenticated access to login.
- Social, opportunity, newsletter and consent-invitation dry runs performed no publication, payment or commercial newsletter send.
- The linked database lint contained zero AeroTrade errors. The separate known Voyager function result-type warning was not changed by this release.

## One-time newsletter preference invitation

- Eligible non-admin undecided accounts: 15.
- Provider-accepted invitations with provider message ID: 14.
- Failed provider acceptance: 1, with one delivery attempt and a bounded retry not before `2026-08-30T14:06:15.190Z`.
- A second execution sent zero messages, recognized 14 accepted duplicates and deferred the one failed receipt.
- A valid signed GET returned HTTP 200 with `private, no-store`, `no-referrer` and `noindex` protections and left the stored preference unchanged as `NOT_REQUESTED`.
- No account was inferred as consented. At readback, all 16 profiles remained `NOT_REQUESTED`, including one administrator who was excluded from the invitation cohort.
- The bi-weekly workflow was re-enabled only after the consent UI, signed capability, POST-only activation boundary, zero-recipient newsletter dry run and production readback passed. A future newsletter can select only accounts that explicitly become `ACTIVE`.

## Remaining bounded follow-up

The one failed preference invitation may receive exactly one provider retry after its stored retry time. Accepted receipts are immutable and cannot be sent again. The retry does not authorize a newsletter, infer consent or alter any account preference.
