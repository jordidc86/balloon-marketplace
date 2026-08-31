# AeroTrade production release

## Invariant

Netlify publishes AeroTrade only from the remote `production` branch. Development and evidence are consolidated on `main`; pushing `main` must not create a production deploy. Manual non-Git production deploys are disabled in Netlify.

Every production release must therefore be one reviewed fast-forward movement from `production` to an exact commit already present on `main`. A release is allowed to request exactly one Netlify production deploy.

## Prepare a release

1. Consolidate all intended runtime changes on `main` and run the normal tests.
2. Update `release/netlify-production.json` in the same consolidated commit:
   - give it a new dated `releaseId`;
   - set `productionBaseCommit` to the current full SHA of `origin/production`;
   - keep `expectedProductionDeploys` at `1`;
   - keep `requiresExplicitApproval` at `true`.
3. Push the consolidated commit to `main`.

`main` is deliberately not Netlify's production branch, so this staging push does not publish or consume a production-deploy charge.

## Rehearse without publishing

Run:

```bash
npm run promote:production
```

The dry run fetches both remote branches and refuses the release unless the worktree is clean, the candidate is a fast-forward descendant, the marker targets the exact current production commit, and the Netlify ignore gate requests one build. It never pushes and requests zero Netlify deploys.

## Publish once

After explicit release approval, use the exact `releaseId` printed by the dry run:

```bash
CONFIRM_AEROTRADE_PRODUCTION_RELEASE=<exact-release-id> npm run promote:production -- --apply
```

The apply mode repeats all structural checks, runs the complete local production verification, moves only the remote `production` branch, and verifies the persisted remote SHA. Netlify then receives one Git production event.

## Recovery

If the new deploy fails, do not create repeated speculative deploys. Inspect the failed deploy first. A rollback is another explicit, reviewed production operation and must preserve the audit trail; never rewrite `main` or delete evidence to simulate success.
