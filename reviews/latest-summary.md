# AeroTrade Latest Summary

Date: 2026-07-31
Status: `Production stabilized; outbound delivery hardening prepared locally`

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
| Email delivery false positives | `Prepared locally` | Missing Resend credentials now fail closed; only provider acceptance IDs count as sent and partial delivery has a durable status. |
| Meta failure diagnosis | `Prepared locally` | Credential preflight, expiry warnings and actionable token/permission/timeout classifications await deployment. |

## Production Evidence

- Netlify serves the release from `main`; deploys completed without build or secret-scan errors.
- Supabase migration history is aligned through `20260711120000`; `stripe_webhook_events` is private.
- A signed no-op Stripe audit event was processed once and recognized as a duplicate on replay.
- Newsletter and social dry-runs returned HTTP 200 without sending email or publishing content.
- GitHub Actions completed a manual newsletter dry-run using its production secret.
- Public catalog navigation, seller contact, new-balloon quote, pricing, SEO and mobile listing layout were checked in production.

## Current Business Improvement Focus

1. Increase supply of verified listings.
2. Make premium access concrete for buyers and sellers.
3. Add trust signals around inspection/documentation.
4. Verify newsletter and Instagram promotion loops.

## Pending Release

- Apply `20260731170000_track_partial_email_delivery.sql` before deploying the matching code.
- Deploy the outbound hardening only after local test, audit, lint and build are clean.
- Run authenticated newsletter and social dry-runs; use `providerCheck=1` to validate Meta without publishing.
- Confirm the next scheduled newsletter/social execution with Resend acceptance IDs and provider-aware status.

## Residual Observation

Confirm the next real Stripe payment. The outbound hardening is not production evidence until its migration, deploy and authenticated dry-runs are completed.
