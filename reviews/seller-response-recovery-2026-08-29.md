# AeroTrade seller-response recovery candidate — 2026-08-29

Status: implemented and locally verified; not deployed; no email sent and no recovery result claimed.

## Verified gap

The existing marketplace-enquiry path stores the lead, acknowledges the buyer and notifies the listing owner. The daily opportunity process sends one seller reminder after 24 hours, using the existing private, idempotent delivery receipt. If the seller still does nothing, production has no subsequent recovery stage and the opportunity can remain invisible indefinitely.

## Candidate behavior

1. Continue using the existing one-time seller reminder; do not add another seller message.
2. Treat only a provider-accepted reminder as the start of the escalation clock.
3. Wait a further 48 full hours.
4. Recheck that the enquiry remains `NEW` or `SELLER_NOTIFIED`.
5. Create at most one private administrator notification using the same commercial receipt ledger.
6. Link directly to the existing enquiry inside Control Tower and count the unresolved case in `Needs attention`.

The escalation contains no buyer contact data, sends nothing to the buyer, makes no promise and cannot reserve equipment, move money or form a contract. A failed internal delivery receives only the existing bounded retry budget; provider-accepted delivery is never repeated.

## Evidence gate

- 161/161 automated tests and 166/166 operational contracts pass in the complete grouped candidate after the database-integrity rehearsal.
- ESLint, TypeScript and the full Next.js production build pass.
- Migration `20260829580000` retains all 24 previous closed notification types and adds exactly `inquiry_seller_escalation`.
- The production snapshot contains zero marketplace enquiries, so this is operational readiness only. Commercial value requires a genuine stored enquiry, accepted seller reminder, 48-hour stall and a later recorded recovery action.

No production migration, outbound message, Netlify preview or Netlify deployment was created during implementation or verification.
