# Newsletter consent invitation readiness — 2026-08-30

## Outcome

The release candidate now supports one provider-audited preference invitation for every existing non-admin AeroTrade account that still has `NOT_REQUESTED`. It does not treat registration or delivery as consent.

## Safety boundary

- The invitation contains no listing, price, offer or promotional catalogue content.
- `ACTIVE`, `UNSUBSCRIBED` and administrator accounts are excluded before dispatch.
- One immutable idempotency key is used per account; accepted delivery cannot repeat.
- The capability is bound to user, normalized email, fixed campaign expiry and server secret.
- Link opening is private, no-store, no-referrer and noindex, and performs no write.
- A second explicit POST is required to change exactly `NOT_REQUESTED` to `ACTIVE`.
- The action verifies the provider-accepted invitation receipt before changing preference and reads the stored consent state back.
- Ignoring the invitation leaves the account excluded from every newsletter.

## Verification

- `162/162` automated tests passed.
- `173/173` operational contracts passed.
- ESLint passed.
- TypeScript passed.
- Full Next.js 16.3.3 production build passed and emitted both the private consent page and protected invitation endpoint.
- Disposable database recovery applied 12 forward migrations through `20260829600000`, reconstructed 61 migration versions, 65 public tables, 26 functions and 53 RLS-enabled tables with zero AeroTrade lint errors.
- No production database, email provider, customer record, consent or Netlify deploy was touched by this readiness work.
