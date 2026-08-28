# AeroTrade Latest Summary

Date: 2026-08-28
Status: `Production source reconciled; commercial and payment-evidence release candidate verified locally`

## Current State

AeroTrade is a Next.js marketplace for used hot-air-balloon equipment with Supabase, Stripe, Resend, GitHub Actions newsletter scheduling, and Netlify scheduled social publishing.

## Active Risks

| Risk | Status | Why It Matters |
| --- | --- | --- |
| Contact email placeholder | `Fixed` | Contact now uses the real AeroTrade support email. |
| Newsletter scheduler clarity | `Fixed` | GitHub Actions is the documented bi-weekly newsletter scheduler. |
| Social scheduler clarity | `Fixed` | Netlify runs `/api/cron/social` daily; `/api/cron/instagram` remains compatibility route. |
| SEO canonical | `Fixed` | Public SEO routes use `https://aerotrade.app`, not Netlify aliases. |
| Supply-side cold start | `Observed` | Marketplace value depends on enough quality listings. |
| Stabilization release | `Deployed` | Critical fixes for listing images, contact visibility, Premium conversion and Stripe audit are live. |
| Stripe webhook coverage | `Fixed` | The live endpoint uses the canonical domain and listens for checkout, subscription update/deletion and payment failure events. |
| Legacy listing image state | `Fixed` | All active listings have images, contact data and exactly one primary image. |
| Mobile listing layout | `Fixed` | Listing images are bounded on small screens and anonymous navigation no longer overflows horizontally. |
| Email delivery false positives | `Present in reconciled base` | Missing Resend credentials fail closed; only provider acceptance IDs count as sent and partial delivery has a durable status. Production was not rechecked in this work. |
| Meta failure diagnosis | `Present in reconciled base` | Credential preflight, expiry warnings and actionable token/permission/timeout classifications are implemented. Production was not rechecked in this work. |
| Commercial funnel visibility | `Candidate verified locally` | Views, anonymous/public contact reveals and quote requests now have explicit measurement and fail-closed storage. |
| Payment notice evidence | `Candidate verified locally` | Each successful charge is deduplicated by charge ID and requires Resend acceptance plus a private persisted receipt/readback before completion. |

## Production Evidence

- Netlify serves the release from `main`; deploys completed without build or secret-scan errors.
- Supabase migration history is aligned through `20260711120000`; `stripe_webhook_events` is private.
- A signed no-op Stripe audit event was processed once and recognized as a duplicate on replay.
- Newsletter and social dry-runs returned HTTP 200 without sending email or publishing content.
- GitHub Actions completed a manual newsletter dry-run using its production secret.
- Public catalog navigation, seller contact, new-balloon quote, pricing, SEO and mobile listing layout were checked in production.

## Reconciliation Evidence

- Candidate branch started from `origin/main` at `35fb5d0`; the pre-existing dirty workspace was not modified.
- Existing commercial instrumentation and successful-payment notification commits were integrated into the clean branch.
- Local checks pass: 22 automated tests, 22 operational contracts, ESLint, a full Next.js production build and an npm audit with zero known vulnerabilities.
- No production read, migration, webhook change, email, payment, price change, publication or deploy was executed.

## Current Business Improvement Focus

1. Increase supply of verified listings.
2. Make premium access concrete for buyers and sellers.
3. Add trust signals around inspection/documentation.
4. Verify newsletter and Instagram promotion loops.

## Pending Approved Release

- Apply `20260828120000_payment_notification_receipts.sql` before deploying the matching code.
- Confirm the live Stripe webhook subscribes to `charge.succeeded` and required runtime variables exist, without exposing values.
- Deploy the reviewed candidate only with separate approval.
- Run the approved Stripe test-mode and read-only commercial verification in `docs/production-audit-runbook.md`.
- Preserve the additive receipt table if code rollback is required; do not delete audit evidence.

## Residual Observation

No claim is made that the candidate is live. The next real Stripe payment must not be used as the first test; migration, webhook configuration, deploy and a test-mode verification must happen in that order with separate approval.
