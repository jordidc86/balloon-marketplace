# AeroTrade database recovery rehearsal — 2026-08-29

## Outcome

`PASS` — a completely disposable local PostgreSQL/Supabase target reconstructed the shared production schema from the checksummed schema-only baseline and applied every forward migration through `20260829590000`.

No production database, Netlify project or external provider was accessed or mutated during the rehearsal.

## Verified receipt

```json
{
  "kind": "aerotrade_database_recovery_rehearsal",
  "containsPii": false,
  "productionAccessed": false,
  "productionMutated": false,
  "snapshotSha256": "185e3894973527e9d944e150c0c1005511d48d861e39e9db3606ea07ead02b5d",
  "baselineMigration": "20260829480000",
  "latestMigration": "20260829590000",
  "migrationsVerified": 60,
  "forwardMigrationsApplied": 11,
  "publicTables": 65,
  "publicFunctions": 26,
  "rlsTables": 53,
  "aerotradeLintErrors": 0,
  "knownSharedVoyagerLintErrors": 1
}
```

## Defects found and resolved before acceptance

1. The first safety scan treated `INSERT` statements inside stored function bodies as exported table rows. The gate now rejects actual `pg_dump` data sections, `COPY FROM stdin` row payloads and sequence-state restoration while allowing schema-only routine definitions.
2. Repository migration `20260731170000` is absent from the production migration ledger although its evolved schema effects are present in the production snapshot. The recovery manifest now declares that one version as satisfied by the snapshot, and the disposable ledger records it without replaying the historical SQL.
3. Supabase CLI migration repair requires a matching local file for each repaired version. The rehearsal creates comment-only temporary stubs after loading the snapshot; they cannot execute and disappear with the temporary project.

## Integrity evidence

- All 60 committed migration versions are present exactly once in the reconstructed ledger.
- All 11 release-candidate migrations were executed after the production baseline.
- The social-publication receipt table retained RLS.
- All three listing-availability functions use the named daily uniqueness constraint.
- Schema lint reports zero AeroTrade errors.
- The one permitted lint issue is the previously identified shared Voyager function `public.vb_redeem_open_gift_internal_v1`; the recovery gate rejects any additional issue.
- The temporary Supabase project was stopped and removed after verification.

## Boundaries

This proves schema and migration-history reconstruction. It does not restore production rows, storage objects or third-party state and does not authorize any production restore. Those require an approved provider backup and the separate incident procedure in `docs/database-recovery-runbook.md`.
