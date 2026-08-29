# AeroTrade grouped release: social evidence and unit economics

Status: release candidate only. Production is unchanged.

## Purpose

Ship two material, additive capabilities in one Netlify build:

1. Per-content, network and placement social-publication receipts with provider-ID acceptance, bounded retry and attributable links.
2. Complete, evidence-backed unit economics on the existing commercial outcome, with unknown costs kept null and every measurement snapshotted immutably.

The release does not change prices, publish a post, send a message, create a commercial outcome or assign inferred revenue or costs.

## Exact source

- Production base: `9880e56df0b1f47089c0ea176d57a613c25847a5`.
- Release candidate: `a569817c3950ffab95a71e59fb5787c503c98877`.
- Runtime commits: `2ba08b5` and `a569817`.
- Required migrations, in order:
  1. `20260829490000_social_publication_receipts.sql`
  2. `20260829500000_commercial_unit_economics.sql`

## Authorization gate

Do not apply either production migration, merge/push to `main`, trigger a deploy or call a production dry run until Jordi explicitly approves this grouped release. One approval should name both migrations, the one grouped deploy and the post-deploy read-only verification.

## Pre-release gate

1. Confirm the feature branch and `origin/main` still resolve to the exact commits above or recalculate this plan.
2. Confirm the worktree is clean and no secret or generated directory is tracked.
3. Run `npm test`, `npm run audit:local`, `npm run lint`, `npx tsc --noEmit`, `git diff --check` and `npm run build`.
4. Confirm the expected result remains 141/141 tests and 137/137 operational contracts.
5. Capture read-only counts of existing commercial outcomes and current Supabase migration versions without including personal data.

## Database order and readback

Apply both additive migrations before deploying the runtime. Immediately verify, without inserting synthetic rows:

- `social_publication_receipts` exists, has RLS enabled and exposes no anonymous/authenticated write privilege.
- `commercial_unit_economics_events` exists, has RLS enabled and exposes no anonymous/authenticated write privilege.
- `commercial_outcomes` has all three nullable cost fields, the generated contribution field and economics evidence metadata.
- `record_commercial_unit_economics` exists with authenticated execute permission and no public/anonymous execute permission.
- Existing commercial-outcome row counts are unchanged and pre-existing rows have null economics fields.
- No social receipt, economics event, post, message, charge or other economic action was created by migration verification.

Abort before runtime deployment if any readback differs.

## One runtime deployment

After database readback succeeds:

1. Fast-forward or merge the exact release candidate to `main` once.
2. Confirm Netlify starts exactly one production build for the resulting `main` commit.
3. Do not create evidence-only follow-up commits while that build is running.
4. Confirm the deployed commit, route health and protected-admin redirects.
5. Confirm Control Tower loads the new social and economics queries without a database error.

## Safe post-deploy checks

1. Run the social endpoint in `dryRun=1` first. It must plan at most the requested item and create no Meta media.
2. A provider credential check may be run only when separately covered by the release approval; it must not publish.
3. Do not run a live social publication merely to create evidence.
4. Do not create a synthetic outcome or invent costs. The first economics entry must be tied to a genuine existing outcome and operator-held evidence.
5. Run the PII-free read-only marketplace audit and confirm missing economics are counted separately from zero and negative contribution is preserved.

## Rollback plan

The safe rollback is runtime-first and non-destructive:

1. Roll Netlify back to production base `9880e56df0b1f47089c0ea176d57a613c25847a5` or its known-good deploy `6a92ffe4dbebcf0008be7dd7`.
2. Leave both additive private tables and nullable columns in Supabase. The previous runtime does not query them, so retaining them preserves audit evidence and avoids destructive rollback.
3. Pause the scheduled social function only if the reverted runtime or credential state cannot be proven safe; do not repeat any pending or ambiguous provider operation.
4. Do not drop tables, columns, functions or events during incident response. Any later schema removal requires a separate migration, backup and explicit approval.

## Score gate

This release alone does not authorize a score increase. Social acquisition needs a genuine provider-accepted placement and attributable visit; unit economics needs a genuine commercial outcome with complete evidence. Until then, both remain implemented release candidates rather than commercially proven capabilities.
