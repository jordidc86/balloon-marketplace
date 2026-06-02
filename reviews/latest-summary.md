# AeroTrade Latest Summary

Date: 2026-06-02
Status: `Production updated`

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

## Current Business Improvement Focus

1. Increase supply of verified listings.
2. Make premium access concrete for buyers and sellers.
3. Add trust signals around inspection/documentation.
4. Verify newsletter and Instagram promotion loops.

## Suggested Next Approval

`Approved: run AeroTrade competitor and funnel review`
