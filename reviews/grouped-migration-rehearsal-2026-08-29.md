# AeroTrade grouped migration rehearsal

Date: 2026-08-29  
Candidate: `5cddd94094dd3f19a177a5acc661e3287109470f`  
Production base: `9880e56df0b1f47089c0ea176d57a613c25847a5`  
Status: locally proven release candidate; production unchanged

## Scope and safety boundary

This rehearsal validates migrations `20260829490000` through `20260829590000` against a read-only dump of the actual production `public` schema. It ran in an isolated local PostgreSQL 17/Supabase container. It applied no production migration, wrote no production row, sent no message, created no payment and triggered no Netlify deploy.

The remote comparison was read-only. `supabase migration list --linked` confirmed production remains registered through `20260829480000`. `supabase db push --linked --dry-run` listed exactly the eleven candidate migrations and explicitly applied none.

## Defects found before release

1. `20260829490000_social_publication_receipts.sql` referenced `public.is_admin(auth.uid())`, but the real production schema has no such function. The first migration would therefore have failed. The RLS policy now uses the established `public.users` role check directly and retains authenticated-admin-only reads.
2. The existing `confirm_listing_availability` function exposed `confirmed_on` as an output name and also used it unqualified in `ON CONFLICT`. Production schema lint reported the resulting PL/pgSQL ambiguity.
3. The candidate bulk and seller-email availability functions had the same conflict-target risk; the seller-email function also used an unqualified `listing_id` inside its duplicate-scope check. Migration `20260829590000` replaces all three functions with qualified scope names and the existing named daily unique constraint.

These corrections do not change listing publication, price, ownership, payment state or the authority model. Individual and bulk seller actions remain authenticated-owner-only. The email capability remains executable only by `service_role` after the existing accepted-delivery and bounded-HMAC checks.

## Clean application and database readback

The production-schema baseline plus all eleven candidate migrations applied in order with `ON_ERROR_STOP` and no migration error. Readback proved:

- twelve local migration versions from the production baseline `20260829480000` through candidate `20260829590000`;
- RLS enabled on `social_publication_receipts`, `commercial_unit_economics_events` and `new_balloon_proposal_response_events`;
- the social receipt policy resolves to an inline admin-role lookup against `public.users`;
- all three availability functions are `SECURITY DEFINER`, pin `search_path` to `public, pg_temp` and use `listing_availability_confirmations_listing_id_confirmed_on_key`;
- anonymous execution is denied for seller confirmation and economics input; authenticated execution is limited to owner/admin functions; proposal response, checkout recovery and seller-email availability remain `service_role` only;
- localized demand has one non-null, closed `entry_context` column and an indexed `(entry_context, created_at desc)` access path;
- the closed notification vocabulary retains every prior value and adds `inquiry_seller_escalation`;
- candidate event tables were empty immediately after migration application.

## Isolated behavioral proof

Synthetic rows existed only inside the disposable local database. The rehearsal proved:

- an owner can confirm one active listing and repeat the action without creating a second daily row;
- the bulk function returns only the owner's active public/Premium inventory and preserves one row per listing/day;
- a current provider-accepted seller digest confirms its exact bounded listing scope and records `SELLER_EMAIL_CAPABILITY` on a previously unconfirmed listing;
- an ordinary authenticated seller reads zero private social receipts while an authenticated administrator reads the expected receipt;
- newsletter consent transitions from `NOT_REQUESTED` to `ACTIVE` and then `UNSUBSCRIBED` only for the authenticated profile;
- complete reported unit economics create one immutable event and generate the expected contribution margin; unknown costs are never converted to zero.

## Lint and application gates

- AeroTrade schema lint: zero remaining errors after the fixes.
- Shared-schema lint: one pre-existing error remains in `public.vb_redeem_open_gift_internal_v1` (`RETURN QUERY` column 3 type mismatch). The `vb_*` namespace belongs to Voyager and is deliberately outside this AeroTrade release.
- Application tests: 161/161 passing.
- Operational contracts: 166/166 passing.
- ESLint: passing.
- TypeScript `--noEmit`: passing.
- Next.js production build: passing locally; 29 static pages generated, with only the known non-blocking Edge Runtime deprecation warning.

## Separate reproducibility gap

Replaying every historical repository migration into a completely empty database still stops at `20260517214543_create_quote_requests.sql` because that old migration references `public.users` before the repository creates it. This does not affect the candidate-on-production rehearsal, because production already contains the table and the actual production-schema baseline applied cleanly. It remains a source-history bootstrap defect to repair separately without rewriting migrations already registered in production.

## Release decision

The candidate is technically ready for the controlled production gate described in `docs/grouped-release-social-economics-20260829.md`. Readiness does not authorize release. Production migrations, `main`, Netlify and outbound dry runs remain unchanged until Jordi provides the exact grouped approval.
