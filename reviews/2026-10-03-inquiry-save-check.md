# Seller inquiry Save verification - 2026-10-03

## Scope and production evidence

The reported dashboard Save control was tested against the current published
application. The selected inquiry changed from NEGOTIATING to CONTACTED on the
first attempt. Two further saves of CONTACTED succeeded. Reloading after each
save showed both the CONTACTED badge and Contacted selection persisted.

No buyer-response action was invoked. No email, payment, listing publication
or database migration was performed. The initial investigation did not deploy;
the subsequently approved release is documented below.

The reported failure was not reproduced as a storage failure. The published
control has no pending, success or error feedback, making a successful save
appear inactive. This does not rule out earlier intermittent failures.

## Published correction

- Separate client status form shows Saving..., Saved: Contacted, or an error.
- Disable the select and button during submission; reject concurrent submits.
- Refresh the dashboard after a verified successful update.
- Preserve authenticated access and existing RLS; do not use an admin client.
- Require matching inquiry ID and returned database status before success.
- Keep status changes separate from buyer-response email actions.

The changes are isolated in /Users/Jordi/Desktop/balloon-marketplace-inquiry-save,
based on origin/main c8559da. The original dirty working tree is untouched.

## Verification

- Three real saves, each verified after page reload: passed.
- Nine focused status tests: passed, including all five allowed statuses,
  invalid input, missing permission, database error, mismatched readback and
  repeated saves. These use mocks, not production writes.
- Full suite: 256 tests passed.
- audit:local: 245 operational contracts passed.
- ESLint: passed without warnings.
- Production build: passed; existing Edge Runtime deprecation/static-generation
  warnings remain.
- Local browser fixture (mock action, no external integrations): success,
  database-error feedback, slow response with disabled controls, and retry
  recovery passed.
- git diff --check: passed.

Screenshots and the disposable browser fixture are in the ignored
node_modules/.cache/inquiry-save-qa directory. They contain no credentials and
are not release source.

## Approved release

Jordi explicitly approved deployment in the follow-up message "si, confirmo".
Release ID: 2026-10-03-inquiry-save-feedback. The production base is
c8559daff4db5499691bad6ec2c134b08ce3a8fb. This release contains no migrations.
Production verification saved only the existing CONTACTED status on the same
inquiry three times (two desktop, one 390 x 844 mobile viewport). Each showed
Saving... and Saved: Contacted, with the CONTACTED badge and selection still
present after reload. Mobile controls and feedback had no horizontal overflow.
No buyer response or email was sent.

Published runtime commit: de2dc0b7decd9a6b7337ffadf8f2d5956d93b676.
Netlify deployment: 6ac0bb1093bad200086a50c5, ready and published at
2026-10-03T08:22:16.363Z. The protected promotion returned
production_release_verified; five immutable and five canonical endpoint
contracts passed. Live compatibility checked 374 aggregate rows without
modifying the database. The remote migration ledger was unchanged.

The publication receipt is in 2026-10-03-inquiry-save-release.json. Evidence
documentation is a separate non-deploy main commit so the verified runtime
commit remains the exact production release.

## Release boundary

The protected release and authenticated post-deploy saves are complete.
No further runtime changes are pending for this correction. If rollback is
needed, the preceding ready Netlify deployment is 6abe74e905ab8c00096ba666
(commit c8559daff4db5499691bad6ec2c134b08ce3a8fb). Restoring that release
requires approval and restores the old dashboard form/status action without
reverting the saved CONTACTED value. No schema rollback is necessary.

npm ci reported existing dependency advisories (one moderate, six high, one
critical); dependencies were not upgraded as part of this narrow correction.
