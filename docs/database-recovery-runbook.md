# AeroTrade Database Recovery Runbook

Status: local recovery gate; no production restore is authorized by this document.

## Purpose

The oldest committed remote migration is a placeholder, so replaying the historical migration directory against an empty database is not a supported recovery method. The supported route reconstructs the shared production `public` schema from a checksummed, schema-only baseline captured after migration `20260829480000`, then applies every later committed migration in order.

The baseline intentionally includes AeroTrade and the shared Voyager objects that coexist in the production `public` schema. It contains no table rows, credentials, database URL, JWT or user data.

## Routine rehearsal

Prerequisite: Docker must be running.

```bash
npm run rehearse:db-recovery
```

The script:

1. validates the recovery manifest, checksum and schema-only safety properties;
2. verifies that the manifest covers every historical migration through the baseline;
3. creates a disposable local Supabase/PostgreSQL target;
4. installs the baseline and every forward migration;
5. reconstructs the complete migration ledger;
6. checks table, function, RLS and current release-candidate invariants;
7. runs schema lint and rejects any new AeroTrade error; and
8. stops and deletes the disposable target.

It removes production connection variables from its child environment and contains no linked, push, deploy or Netlify operation.

The production migration ledger omits historical version `20260731170000`, although its schema effects are present in the captured production schema. The manifest declares that version separately as satisfied by the snapshot. Recovery records it as applied without replaying it, so future migration tooling sees one complete, non-duplicated history.

## What this proves

- A new PostgreSQL target can reproduce the current schema and migration history.
- Forward migrations remain compatible with the captured production shape.
- Core row-level-security and release-candidate database contracts survive reconstruction.
- The rehearsal itself cannot mutate production.

## What this does not prove

- Recovery of production table rows, files, object storage or third-party provider state.
- Point-in-time recovery retention or provider backup availability.
- Permission to restore or overwrite any production environment.
- That the known shared Voyager lint defect belongs to AeroTrade. The gate permits that exact pre-existing issue and rejects any additional lint error.

## Actual incident procedure

An actual restore requires separate explicit approval and a new empty target. Before any write:

1. preserve the failed environment and record the incident time;
2. confirm the provider's latest restorable database backup and object-storage backup;
3. rehearse the exact target schema locally with this gate;
4. restore table data only from the approved provider backup into the isolated target;
5. apply missing committed forward migrations once;
6. validate row counts, constraints, RLS, critical commercial flows and immutable payment evidence;
7. switch traffic only after readback succeeds; and
8. keep the previous environment available for rollback.

Never run the recovery snapshot directly against the existing production database.

## Maintaining the baseline

Do not rewrite migrations already registered in production. Refresh the baseline only after an approved production schema change or when verified schema drift makes the current snapshot inaccurate. Capture schema only, update `manifest.json` with the exact applied history and SHA-256 checksum, run the rehearsal, and review the resulting non-PII receipt before committing it.
