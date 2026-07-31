# AeroTrade Production Audit Runbook

Run this only after the matching code and database migration are deployed. Do not paste secrets into logs or command history.

## Release Gate

1. Confirm the deployed commit matches the approved release commit.
2. Confirm `20260711120000_audit_stripe_webhook_events.sql` has been applied before enabling the new webhook code.
3. Confirm `20260731170000_track_partial_email_delivery.sql` has been applied before deploying the delivery hardening code.
4. Run `npm test`, `npm run audit:local`, `npm run lint`, and `npm run build` from a clean checkout.
5. Confirm the working tree is clean and generated folders are not tracked.

## Critical Product Smoke Tests

1. Open the home page, catalog, pricing, sell, login, signup, contact, new-balloon quote, robots and sitemap routes on desktop and mobile widths.
2. Verify a public listing opens its detail page, keeps the main image contained, and reveals seller contact without requiring login.
3. Verify a Premium-exclusive listing hides details and contact from anonymous users but allows a paid Premium user and the seller.
4. Create a test draft with one image, edit its details and images, and confirm one primary image remains.
5. Confirm an oversized image and a listing without images are rejected with a visible error.

## Stripe

1. Use Stripe test mode or an approved low-impact production procedure; never create free Premium access to simulate payment.
2. Complete one Premium subscription checkout and confirm the user changes to `premium_source = stripe` only after a signed paid webhook.
3. Deliver the same Stripe event twice and confirm the second response is marked duplicate and causes no duplicate fulfillment.
4. Complete one Premium listing payment and confirm the listing changes from `PENDING_PAYMENT` to `ACTIVE_PREMIUM` with a 48-hour `public_at`.
5. Confirm admin-granted Premium remains available and Stripe-managed Premium cannot be revoked from the manual grant control.
6. Inspect the webhook event audit table for `processed` or actionable `failed` rows without exposing payloads or credentials.

## Newsletter And Social

1. Execute the newsletter endpoint in `dry_run` and confirm recipient/listing counts, period key and audit run without sending messages.
2. Confirm a live or test email is counted as sent only when its recipient audit row contains a Resend acceptance ID; missing credentials must report zero sent.
3. Confirm a partial Resend response records status `partial`, returns failure and blocks automatic whole-batch retries.
4. Confirm only the GitHub Actions schedule on days 1 and 16 is active for newsletter delivery.
5. Execute `/api/cron/social?dryRun=1&limit=1` with approved authentication and confirm one eligible item is planned without calling Meta.
6. Execute `/api/cron/social?dryRun=1&limit=1&providerCheck=1` with approved authentication and confirm Meta reports valid credentials or an actionable token/permission error without creating media.
7. Confirm the Netlify scheduled function targets `/api/cron/social?limit=1` and its latest scheduled execution has no authentication or configuration error.
8. Confirm provider failures return a non-2xx response and distinguish token expiry from transient timeout or rate limiting.
9. Treat successful social publication as operational health, not as marketplace growth; measure visits, contacts and listings separately.

## Exit Criteria

The release is operational only when every critical test is recorded as pass, accepted emails have provider IDs, Meta credential health is visible, any failed webhook or scheduler run has an owner, and rollback to the previous deploy remains available.
