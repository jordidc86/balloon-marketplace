# Seller inquiry Save verification - 2026-10-03

## Scope and production evidence

The reported dashboard Save control was tested against the current published
application. The selected inquiry changed from NEGOTIATING to CONTACTED on the
first attempt. Two further saves of CONTACTED succeeded. Reloading after each
save showed both the CONTACTED badge and Contacted selection persisted.

No buyer-response action was invoked. No email, payment, listing publication,
database migration or deployment was performed for this investigation.

The reported failure was not reproduced as a storage failure. The published
control has no pending, success or error feedback, making a successful save
appear inactive. This does not rule out earlier intermittent failures.

## Prepared correction (not deployed)

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
Production verification will save only the existing CONTACTED status on the
same inquiry, confirm success feedback and reload persistence, and send no
buyer response or email. Actual deployment evidence will be recorded separately.

## Release boundary

The feedback correction follows the existing protected release process.
Do not describe it as published until
the new deployment and an authenticated post-deploy save are verified.
No schema change is required. Rollback restores the previous dashboard form
and status action; the saved CONTACTED value is not reverted.

npm ci reported existing dependency advisories (one moderate, six high, one
critical); dependencies were not upgraded as part of this narrow correction.
