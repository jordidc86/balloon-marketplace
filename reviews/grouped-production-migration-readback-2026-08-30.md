# Grouped production migration readback — 2026-08-30

## Outcome

All twelve additive AeroTrade migrations `20260829490000` through `20260829600000` are registered in the linked production migration ledger. Runtime deployment and customer messaging had not begun at the time of this readback.

## Safe stop and correction

The first push applied `20260829490000` and then stopped on `20260829500000` because production exposes `uuid_generate_v4` through the `extensions` schema rather than the session search path. No later migration or runtime was applied during that attempt. The two pending UUID defaults were qualified as `extensions.uuid_generate_v4()`, the full 61-version recovery rehearsal passed again, and the push then applied `20260829500000` through `20260829600000` successfully.

## Verification

- Remote ledger: all twelve versions match local source.
- Linked database lint: zero AeroTrade errors.
- One known shared Voyager lint error remains in `public.vb_redeem_open_gift_internal_v1`; this release did not modify it.
- Read-only production audit: 16 newsletter profiles, all `NOT_REQUESTED`, 0 `ACTIVE`.
- Candidate datasets for social receipts, unit economics, proposal responses, newsletter consent and localized demand are all readable.
- Existing inventory remains 12 active listings from 5 sellers.
- No social publication, newsletter, consent invitation, availability request, payment or commercial outcome was created by migration application or readback.
