# AeroTrade Commercial And Payment-Evidence Release Candidate

Date: 2026-08-28  
Branch: `codex/aerotrade-reconcile-20260828`  
Base: `origin/main` at `35fb5d0`

## Scope

This candidate improves measurement and evidence without changing prices, checkout amounts, Premium entitlement rules, newsletter content/schedules or social publication:

- bounds listing-view recording per browser session;
- records successful public/anonymous seller-contact reveals;
- refuses to report a new-balloon quote as successful unless its database ID is read back;
- sends one administrative notice per successful Stripe charge;
- records a private, non-PII receipt only after Resend returns an acceptance ID;
- reads the receipt back before marking the Stripe event processed;
- adds a 30-day read-only commercial snapshot with gross payment-notification coverage.

## Local Gate

Run from a clean checkout:

```bash
npm ci
npm test
npm run audit:local
npm run lint
npm run build
git diff --check
```

Expected result: every command exits successfully. Do not run the production baseline without separate read-only production approval.

The candidate also pins Next.js and its ESLint configuration to 16.3.3 and Resend to 6.25.0. `npm audit --audit-level=low` must report zero known vulnerabilities before release.

## Approved Deployment Order

These are instructions for a future separately approved deployment, not authorization to execute it:

1. Record the candidate commit and current production deploy/rollback identifier.
2. Apply `supabase/migrations/20260828120000_payment_notification_receipts.sql`.
3. Read back table shape, RLS state and revoked `anon`/`authenticated` privileges.
4. Confirm `ADMIN_EMAIL`, `RESEND_API_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` exist without printing their contents.
5. Add `charge.succeeded` to the existing Stripe webhook endpoint if it is not already enabled. Do not create a second endpoint.
6. Deploy the exact reviewed candidate commit.
7. Perform the Stripe test-mode and commercial checks in `docs/production-audit-runbook.md`.
8. Verify exactly one notice and one receipt for the approved test charge, then record the result without customer data.

## Rollback

If the code fails, roll back the application to the recorded previous deploy. Leave the additive `payment_notification_receipts` table and any legitimate receipts intact as audit evidence. Disable `charge.succeeded` only if the previous code cannot safely accept it, and record that configuration change. Never delete receipts to make a retry appear clean.

## Explicitly Excluded

- no production deploy or migration;
- no live Stripe, Resend, Supabase, Netlify or Meta check;
- no real payment, refund or checkout;
- no price or Premium-rule change;
- no newsletter send;
- no social publication.
