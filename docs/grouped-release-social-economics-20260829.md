# AeroTrade grouped release: social evidence, unit economics and proposal conversion

Status: release candidate only. Production is unchanged.

## Purpose

Ship three material, additive capabilities in one Netlify build:

1. Per-content, network and placement social-publication receipts with provider-ID acceptance, bounded retry and attributable links.
2. Complete, evidence-backed unit economics on the existing commercial outcome, with unknown costs kept null and every measurement snapshotted immutably.
3. A private, capability-bound response loop for accepted indicative new-balloon proposals, with one immutable buyer response, database readback and an auditable internal notification.

The release does not change prices, publish a post, send a message by itself, create a commercial outcome, order, reservation, payment or assign inferred revenue or costs. A proposal email is still sent only when an authenticated administrator explicitly presses its existing send button.

## Exact source

- Production base: `9880e56df0b1f47089c0ea176d57a613c25847a5`.
- Runtime release candidate: `ac3af213e3ea3b794456794dda18e0d69475f021`.
- Runtime commits: `2ba08b5`, `a569817`, `827cf84` and `ac3af21`.
- Required migrations, in order:
  1. `20260829490000_social_publication_receipts.sql`
  2. `20260829500000_commercial_unit_economics.sql`
  3. `20260829510000_new_balloon_proposal_responses.sql`

## Authorization gate

Do not apply any production migration, merge/push to `main`, trigger a deploy or call a production dry run until Jordi explicitly approves this grouped release. One approval should name all three migrations, the one grouped deploy and the post-deploy read-only verification.

Exact approval wording:

> Apruebo aplicar las migraciones 20260829490000, 20260829500000 y 20260829510000, realizar un único despliegue agrupado de Aerotrade y ejecutar la verificación de producción y el dry run social sin publicar nada.

## Pre-release gate

1. Confirm the feature branch and `origin/main` still resolve to the exact commits above or recalculate this plan.
2. Confirm the worktree is clean and no secret or generated directory is tracked.
3. Run `npm test`, `npm run audit:local`, `npm run lint`, `npx tsc --noEmit`, `git diff --check` and `npm run build`.
4. Confirm the expected result remains 145/145 tests and 142/142 operational contracts.
5. Capture read-only counts of existing commercial outcomes and current Supabase migration versions without including personal data.

## Database order and readback

Apply all three additive migrations before deploying the runtime. Immediately verify, without inserting synthetic rows:

- `social_publication_receipts` exists, has RLS enabled and exposes no anonymous/authenticated write privilege.
- `commercial_unit_economics_events` exists, has RLS enabled and exposes no anonymous/authenticated write privilege.
- `commercial_outcomes` has all three nullable cost fields, the generated contribution field and economics evidence metadata.
- `record_commercial_unit_economics` exists with authenticated execute permission and no public/anonymous execute permission.
- `new_balloon_proposal_response_events` exists, has RLS enabled, is empty before real buyer use and exposes no anonymous/authenticated privilege.
- `record_new_balloon_proposal_response` is executable only by `service_role`; it cannot close a quote or create an outcome, order, reservation or payment.
- A stored response changes only the open quote state to `BUYER_RESPONDED`; one 24-hour operational reminder is deduplicated by its durable receipt and any later commercial closure remains administrator-only.
- Existing commercial-outcome row counts are unchanged and pre-existing rows have null economics fields.
- No social receipt, economics event, proposal response, post, message, charge or other economic action was created by migration verification.

Abort before runtime deployment if any readback differs.

## One runtime deployment

After database readback succeeds:

1. Fast-forward or merge the exact release candidate to `main` once.
2. Confirm Netlify starts exactly one production build for the resulting `main` commit.
3. Do not create evidence-only follow-up commits while that build is running.
4. Confirm the deployed commit, route health and protected-admin redirects.
5. Confirm Control Tower loads the new social and economics queries without a database error.
6. Confirm the private proposal route returns a safe unavailable state without a valid signed capability and never exposes buyer contact data.

## Safe post-deploy checks

1. Run the social endpoint in `dryRun=1` first. It must plan at most the requested item and create no Meta media.
2. A provider credential check may be run only when separately covered by the release approval; it must not publish.
3. Do not run a live social publication merely to create evidence.
4. Do not create a synthetic outcome or invent costs. The first economics entry must be tied to a genuine existing outcome and operator-held evidence.
5. Run the PII-free read-only marketplace audit and confirm missing economics are counted separately from zero and negative contribution is preserved.
6. Do not create a synthetic proposal response. The first response event must come from a genuine buyer using a proposal link that was generated after this release.

## Rollback plan

The safe rollback is runtime-first and non-destructive:

1. Roll Netlify back to production base `9880e56df0b1f47089c0ea176d57a613c25847a5` or its known-good deploy `6a92ffe4dbebcf0008be7dd7`.
2. Leave all three additive private tables and nullable columns in Supabase. The previous runtime does not query them, so retaining them preserves audit evidence and avoids destructive rollback.
3. Pause the scheduled social function only if the reverted runtime or credential state cannot be proven safe; do not repeat any pending or ambiguous provider operation.
4. Do not drop tables, columns, functions or events during incident response. Any later schema removal requires a separate migration, backup and explicit approval.

## Score gate

This release alone does not authorize a score increase. Social acquisition needs a genuine provider-accepted placement and attributable visit; unit economics needs a genuine commercial outcome with complete evidence; proposal conversion needs a genuine buyer response. Until then, all three remain implemented release candidates rather than commercially proven capabilities.
