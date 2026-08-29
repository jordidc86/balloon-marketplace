# AeroTrade grouped release: social evidence, economics and conversion recovery

Status: release candidate only. Production is unchanged.

## Purpose

Ship five material, additive capabilities in one Netlify production deploy:

1. Per-content, network and placement social-publication receipts with provider-ID acceptance, bounded retry and attributable links.
2. Complete, evidence-backed unit economics on the existing commercial outcome, with unknown costs kept null and every measurement snapshotted immutably.
3. A private, capability-bound response loop for accepted indicative new-balloon proposals, with one immutable buyer response, database readback and an auditable internal notification.
4. A one-time, bounded recovery path for a genuine buyer-initiated annual Buyer Early Access checkout that expired without verified payment.
5. Explicit, owner-controlled consent for the existing bi-weekly newsletter, with no legacy opt-in inference, a signed POST-only stop control and a consent recheck before selective recovery.

The release also activates a deployment-cost guard: future production builds require an explicit change to `release/netlify-production.json`. Ordinary runtime commits may be staged on `main` but cannot independently consume a production-deploy charge.

The release does not change prices, publish a post, send a message by itself, create a commercial outcome, order, reservation, payment or assign inferred revenue or costs. A proposal email is still sent only when an authenticated administrator explicitly presses its existing send button. Buyer Early Access recovery remains dry-run only during release verification; sending any real recovery email requires separate approval after the eligible aggregate count is known.

## Exact source

- Production base: `9880e56df0b1f47089c0ea176d57a613c25847a5`.
- Runtime release candidate: `d810f3b1bae368f26434a220dc8f8632d9744f4e`.
- Material runtime commits: `2ba08b5`, `a569817`, `827cf84`, `ac3af21`, `2aba405`, `fb7bfa2`, `4f8373d` and `d810f3b`.
- Required migrations, in order:
  1. `20260829490000_social_publication_receipts.sql`
  2. `20260829500000_commercial_unit_economics.sql`
  3. `20260829510000_new_balloon_proposal_responses.sql`
  4. `20260829520000_buyer_early_access_checkout_recovery.sql`
  5. `20260829530000_newsletter_consent.sql`
- Explicit production release marker: `release/netlify-production.json` with release ID `2026-08-29-grouped-commercial-release`.

## Authorization gate

Do not apply any production migration, merge/push to `main`, trigger a deploy or call a production dry run until Jordi explicitly approves this grouped release. One approval should name all five migrations, the one grouped deploy and the post-deploy read-only verification.

Exact approval wording:

> Apruebo aplicar las migraciones 20260829490000, 20260829500000, 20260829510000, 20260829520000 y 20260829530000, realizar un único despliegue agrupado de Aerotrade —máximo estimado 15 créditos de Netlify— y ejecutar la verificación de producción, el dry run social sin publicar nada, el dry run de recuperación Buyer Early Access sin enviar emails ni crear cobros y el dry run de newsletter sin enviar emails.

## Pre-release gate

1. Confirm the feature branch and `origin/main` still resolve to the exact commits above or recalculate this plan.
2. Confirm the worktree is clean and no secret or generated directory is tracked.
3. Run `npm test`, `npm run audit:local`, `npm run lint`, `npx tsc --noEmit`, `git diff --check` and `npm run build`.
4. Confirm the expected result remains 150/150 tests and 150/150 operational contracts.
5. Capture read-only counts of existing commercial outcomes and current Supabase migration versions without including personal data.
6. Confirm GitHub Actions workflow `Send Bi-Weekly Newsletter Cron` remains `disabled_manually`; it was paused before the 1 September schedule so the old runtime cannot send another registration-based marketing batch.

## Database order and readback

Apply all five additive migrations before deploying the runtime. Immediately verify, without inserting synthetic rows:

- `social_publication_receipts` exists, has RLS enabled and exposes no anonymous/authenticated write privilege.
- `commercial_unit_economics_events` exists, has RLS enabled and exposes no anonymous/authenticated write privilege.
- `commercial_outcomes` has all three nullable cost fields, the generated contribution field and economics evidence metadata.
- `record_commercial_unit_economics` exists with authenticated execute permission and no public/anonymous execute permission.
- `new_balloon_proposal_response_events` exists, has RLS enabled, is empty before real buyer use and exposes no anonymous/authenticated privilege.
- `record_new_balloon_proposal_response` is executable only by `service_role`; it cannot close a quote or create an outcome, order, reservation or payment.
- A stored response changes only the open quote state to `BUYER_RESPONDED`; one 24-hour operational reminder is deduplicated by its durable receipt and any later commercial closure remains administrator-only.
- `due_buyer_early_access_checkout_recoveries` is executable only by `service_role` and returns only the latest expired checkout for a non-Premium account when the source is `signup`, `pricing` or `dashboard` and it is at least 24 hours old.
- Accepted or exhausted Buyer Early Access recovery receipts suppress any repeat. The recovery query and dry run create no Stripe session, charge, payment or email.
- Existing accounts have newsletter state `NOT_REQUESTED`; migration never marks a legacy account as consented.
- `set_own_newsletter_consent` is executable only by an authenticated profile owner, and the signed unsubscribe action changes only the newsletter preference.
- A live newsletter selects only profiles with complete `ACTIVE` consent evidence, embeds one signed stop link per recipient and rechecks current consent before any manual recovery.
- Existing commercial-outcome row counts are unchanged and pre-existing rows have null economics fields.
- No social receipt, economics event, proposal response, post, message, charge or other economic action was created by migration verification.

Abort before runtime deployment if any readback differs.

## One runtime deployment

After database readback succeeds:

1. Fast-forward or merge the exact release candidate to `main` once.
2. Confirm the release marker is part of the resulting `main` commit and Netlify starts exactly one production build.
3. Do not create evidence-only follow-up commits while that build is running.
4. Confirm the deployed commit, route health and protected-admin redirects.
5. Confirm Control Tower loads the new social and economics queries without a database error.
6. Confirm the private proposal route returns a safe unavailable state without a valid signed capability and never exposes buyer contact data.
7. Confirm the opportunity-follow-up dry run reports only the aggregate `dueBuyerEarlyAccessCheckoutRecoveries`; do not set `commit=1` during release verification.
8. Confirm the deployed build gate skips a subsequent non-release commit and that the skip is not a successful production deploy. Do not create a production commit solely for this test; verify it on the next genuine documentation-only change.

## Safe post-deploy checks

1. Run the social endpoint in `dryRun=1` first. It must plan at most the requested item and create no Meta media.
2. A provider credential check may be run only when separately covered by the release approval; it must not publish.
3. Do not run a live social publication merely to create evidence.
4. Do not create a synthetic outcome or invent costs. The first economics entry must be tied to a genuine existing outcome and operator-held evidence.
5. Run the PII-free read-only marketplace audit and confirm missing economics are counted separately from zero and negative contribution is preserved.
6. Do not create a synthetic proposal response. The first response event must come from a genuine buyer using a proposal link that was generated after this release.
7. Run Buyer Early Access recovery without `commit=1`. It may expose only the due count. Sending real recovery emails requires a separate explicit approval after that count is reviewed.
8. Run the newsletter endpoint in dry-run mode. Immediately after migration the eligible real-recipient count must be zero because no legacy account is inferred as consented; do not supply a test email or run a live send.
9. Re-enable the bi-weekly workflow only after the preference UI, signed unsubscribe route and zero-recipient dry run all pass production readback. Re-enabling the scheduler does not authorize a manual live send or infer consent for any existing account.

## Rollback plan

The safe rollback is runtime-first and non-destructive:

1. Roll Netlify back to production base `9880e56df0b1f47089c0ea176d57a613c25847a5` or its known-good deploy `6a92ffe4dbebcf0008be7dd7`.
2. Leave all five additive private tables/functions and nullable columns in Supabase. The previous runtime does not query them, so retaining them preserves audit evidence and avoids destructive rollback.
3. Pause the scheduled social function only if the reverted runtime or credential state cannot be proven safe; do not repeat any pending or ambiguous provider operation.
4. Keep the newsletter workflow disabled if runtime is rolled back below the consent-safe release.
5. Do not drop tables, columns, functions or events during incident response. Any later schema removal requires a separate migration, backup and explicit approval.

## Netlify credit gate

- Expected charge for this release: exactly one successful production deploy, currently 15 credits under Netlify's credit-based plan.
- Deploy previews and branch validation are not production releases and must be used for intermediate work.
- Never increment `release/netlify-production.json` for documentation, evidence or an isolated incremental change.
- If more than one production deploy is created, stop the release and investigate before any further push.

The production auditor is release-version aware: the currently deployed schema remains fully auditable while these five candidate migrations are pending. Candidate-only datasets are reported as `not_deployed`; authentication, permission and network failures still fail the audit closed.

## Score gate

This release alone does not authorize a commercial-proof score increase. Social acquisition needs a genuine provider-accepted placement and attributable visit; unit economics needs a genuine commercial outcome with complete evidence; proposal conversion needs a genuine buyer response; checkout recovery needs a genuine accepted reminder followed by a verified annual payment; newsletter acquisition needs an explicit consent followed by an attributable visit or conversion. Until then, all five remain implemented release candidates rather than commercially proven capabilities.
