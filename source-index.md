# AeroTrade Source Index

Status: Production routing index.
Last updated: 2026-07-31.

## Primary Orientation Files

| File Or Folder | Purpose | Use By Default |
| --- | --- | --- |
| `AGENTS.md` | Agent operating contract and approval boundary | Yes |
| `README.md` | Operational project notes and safe local checks | Yes |
| `package.json` | Scripts and dependencies | Yes |
| `reviews/latest-summary.md` | Current improvement-loop summary | Yes |
| `docs/production-audit-runbook.md` | Post-deploy verification and rollback gate | Yes, after an approved deploy |
| `scripts/audit-local.mjs` | Static operational contract checks | Yes, before every release |

## Product Areas

| Area | Files/Folders | Notes |
| --- | --- | --- |
| Public pages | `src/app/page.tsx`, `src/app/catalog/`, `src/app/pricing/`, `src/app/sell/`, `src/app/contact/` | Customer-facing; changes need approval. |
| Admin | `src/app/admin/`, `src/components/admin/` | Operational risk; check role/access assumptions. |
| Cron endpoints | `src/app/api/cron/newsletter/route.ts`, `src/app/api/cron/social/route.ts`, `src/app/api/cron/instagram/route.ts`, `.github/workflows/newsletter.yml`, `netlify/functions/social-scheduled.mjs` | Live dispatch risk; default to dry-run/proposal. |
| Payments | `src/app/api/webhooks/stripe/`, `src/utils/stripe.ts`, pricing actions | Do not change without exact approval. |
| Email | `src/utils/resend.ts`, premium alerts, newsletter cron | Customer-facing; dispatch requires approval. |
| Database | `supabase/schema.sql`, Supabase utilities | Treat production data as external system. |
| Deployment | `netlify.toml`, `.github/workflows/` | `.netlify/` is local generated output, not source. Read-only unless deployment/config action is approved. |

## Known Checks

| Check | Status |
| --- | --- |
| Contact email placeholder | `Fixed`: contact uses `support@aerotrade.app` via site config. |
| Newsletter schedule | `Active`: GitHub Actions runs `/api/cron/newsletter` on days 1 and 16 at 09:00 UTC. |
| Social cron schedule | `Active`: Netlify scheduled function runs `/api/cron/social` daily at 07:00 UTC. |
| SEO canonical | `Fixed`: `robots.txt`, `sitemap.xml`, and listing JSON-LD use `https://aerotrade.app`. |
| Premium seller/buyer funnel | `Proposed`: needs business review against competitors and listing supply. |
| Critical stabilization | `Deployed`: Supabase migrations, Stripe webhook audit, trusted returns, image requirements, contact visibility and mobile listing layout are live. |
| Outbound delivery verification | `Prepared locally`: Resend acceptance IDs, partial-run tracking, Meta credential preflight and actionable failure classes await migration and deploy. |

## Local Artifacts

| Path | Policy |
| --- | --- |
| `.env*` | Local/runtime environment only; never commit or inspect secret values. |
| `.next/` | Next.js build output; ignored and disposable. |
| `.netlify/` | Netlify local build/deploy output; ignored and disposable. |
| `social-previews/` | Local creative previews; ignored and disposable unless explicitly promoted into `public/social/`. |
| `node_modules/`, `*.tsbuildinfo`, `next-env.d.ts` | Local dependency/type cache output; ignored and disposable. |
