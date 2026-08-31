# AeroTrade production release

## Invariant

Netlify publishes AeroTrade only from the remote `production` branch. Development and evidence are consolidated on `main`; pushing `main` must not create a production deploy. Manual non-Git production deploys are disabled in Netlify.

Every production release must therefore be one reviewed fast-forward movement from `production` to an exact commit already present on `main`. A release is allowed to request exactly one Netlify production deploy. When the candidate contains Supabase migrations, those migrations are content-bound to the release marker, applied before the application, and verified against the linked production migration ledger before the `production` branch may move.

## Prepare a release

1. Consolidate all intended runtime changes on `main` and run the normal tests.
2. Update `release/netlify-production.json` in the same consolidated commit:
   - give it a new dated `releaseId`;
   - set `productionBaseCommit` to the current full SHA of `origin/production`;
   - keep `expectedProductionDeploys` at `1`;
   - keep `requiresExplicitApproval` at `true`.
   - list every migration introduced since the current production commit; migrations are append-only, so modifying or deleting an existing file blocks the release;
   - record the exact migration count, ordered versions and content-derived SHA-256;
   - keep `applyBeforeApplication` and `requiresExactConfirmation` at `true`.
3. Push the consolidated commit to `main`.

`main` is deliberately not Netlify's production branch, so this staging push does not publish or consume a production-deploy charge.

## Rehearse without publishing

Run:

```bash
npm run promote:production
```

The dry run fetches both remote branches and refuses the release unless the worktree is clean, the candidate is a fast-forward descendant, the marker targets the exact current production commit, every migration change is a new append-only file, the migration list and SHA-256 match the exact candidate contents, the linked Supabase ledger has no remote-only drift, undeclared pending history or out-of-order pending version, and the Netlify ignore gate requests one build. It never applies a migration, never pushes and requests zero Netlify deploys. Its receipt lists only non-PII migration versions and the exact confirmation fingerprint.

## Publish once

After explicit release approval, use the exact `releaseId` printed by the dry run:

```bash
CONFIRM_AEROTRADE_PRODUCTION_RELEASE=<exact-release-id> \
CONFIRM_AEROTRADE_DATABASE_MIGRATIONS=<exact-migration-manifest-sha256> \
npm run promote:production -- --apply
```

The apply mode repeats all structural checks, requires the checked-out `HEAD` to equal `origin/main`, and runs the complete local production verification. It then applies only the declared pending migrations through the linked Supabase project, rereads the remote migration ledger, and refuses to move the application branch unless every repository migration is present and there is no remote-only drift. Only after that proof does it move the remote `production` branch and verify the persisted remote SHA. Netlify then receives one Git production event.

This ordering is intentional: all release migrations must remain backward-compatible with the currently deployed application. If the later Git promotion fails, the additive schema may exist briefly before the application uses it; the reverse state—new application code against an old schema—is forbidden.

## Recovery

If database application or the new deploy fails, do not create repeated speculative operations. Inspect the structured receipt first: `databaseMutationAttempted`, `databaseMutationVerified` and `productionBranchUpdated` distinguish the exact recovery point. A rollback is another explicit, reviewed production operation and must preserve the audit trail; never rewrite `main`, edit applied migrations or delete evidence to simulate success.
