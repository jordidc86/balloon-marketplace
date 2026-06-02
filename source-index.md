# AeroTrade Source Index

Status: Production routing index.
Last updated: 2026-06-02.

## Primary Orientation Files

| File Or Folder | Purpose | Use By Default |
| --- | --- | --- |
| `AGENTS.md` | Agent operating contract and approval boundary | Yes |
| `README.md` | Basic Next.js project notes | Yes |
| `package.json` | Scripts and dependencies | Yes |
| `reviews/latest-summary.md` | Current improvement-loop summary | Yes |

## Product Areas

| Area | Files/Folders | Notes |
| --- | --- | --- |
| Public pages | `src/app/page.tsx`, `src/app/catalog/`, `src/app/pricing/`, `src/app/sell/`, `src/app/contact/` | Customer-facing; changes need approval. |
| Admin | `src/app/admin/`, `src/components/admin/` | Operational risk; check role/access assumptions. |
| Cron endpoints | `src/app/api/cron/newsletter/route.ts`, `src/app/api/cron/social/route.ts`, `src/app/api/cron/instagram/route.ts`, `.github/workflows/newsletter.yml`, `netlify/functions/social-scheduled.mjs` | Live dispatch risk; default to dry-run/proposal. |
| Payments | `src/app/api/webhooks/stripe/`, `src/utils/stripe.ts`, pricing actions | Do not change without exact approval. |
| Email | `src/utils/resend.ts`, premium alerts, newsletter cron | Customer-facing; dispatch requires approval. |
| Database | `supabase/schema.sql`, Supabase utilities | Treat production data as external system. |
| Deployment | `.netlify/netlify.toml` | Read-only unless deployment/config action is approved. |

## Known Checks

| Check | Status |
| --- | --- |
| Contact email placeholder | `Fixed`: contact uses `support@aerotrade.app` via site config. |
| Newsletter schedule | `Active`: GitHub Actions runs `/api/cron/newsletter` on days 1 and 16 at 09:00 UTC. |
| Social cron schedule | `Active`: Netlify scheduled function runs `/api/cron/social` daily at 07:00 UTC. |
| SEO canonical | `Fixed`: `robots.txt`, `sitemap.xml`, and listing JSON-LD use `https://aerotrade.app`. |
| Premium seller/buyer funnel | `Proposed`: needs business review against competitors and listing supply. |
