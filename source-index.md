# AeroTrade Source Index

Status: Production routing index.
Last updated: 2026-08-31.

## Primary Orientation Files

| File Or Folder | Purpose | Use By Default |
| --- | --- | --- |
| `AGENTS.md` | Agent operating contract and approval boundary | Yes |
| `README.md` | Operational project notes and safe local checks | Yes |
| `package.json` | Scripts and dependencies | Yes |
| `reviews/latest-summary.md` | Current improvement-loop summary | Yes |
| `reviews/marketplace-audit-2026-08-31-v8.json` | Latest PII-free read-only production counts for supply, demand, opportunities, communications and revenue | Yes, before commercial activation decisions |
| `reviews/aerotrade-category-scorecard-2026-08-31-v8.md` | Evidence-weighted readiness and commercial proof across the twelve objective categories | Yes, when choosing the next material bottleneck |
| `reviews/public-newsletter-production-verification-2026-08-31.json` | Production proof for public double opt-in, privacy, deduplication and zero-send dry runs | Yes, before changing newsletter acquisition or consent |
| `reviews/public-newsletter-attribution-production-verification-2026-08-31.json` | Production proof for bounded source attribution, rollback compatibility and zero synthetic activity | Yes, before changing acquisition measurement |
| `reviews/listing-verification-evidence-handoff-production-verification-2026-08-31.json` | Production proof for the external evidence handoff, exact-state retry and zero document retention | Yes, before changing listing verification operations |
| `reviews/monetization-boundary-audit-2026-08-29.md` | Evidence and exact business choice separating current paid products, fixed services and commission models | Yes, before adding any transaction-fee payment path |
| `reviews/seller-response-recovery-2026-08-29.md` | Bounded internal escalation after a provider-accepted seller reminder remains unresolved | Yes, when reviewing marketplace conversion recovery |
| `reviews/grouped-migration-rehearsal-2026-08-29.md` | Isolated application, lint, permission and behavioral evidence for migrations `20260829490000` through `20260829590000` | Yes, before approving this release |
| `reviews/database-recovery-rehearsal-2026-08-29.md` | Successful empty-target reconstruction evidence for all 60 committed migration versions | Yes, when assessing recovery readiness |
| `reviews/seller-trust-to-distribution-readiness-2026-08-29.md` | Evidence joining owner confirmation to voluntary, attributable seller distribution | Yes, when activating current supply |
| `reviews/netlify-single-release-gate-rehearsal-2026-08-29.md` | Local Git-range proof that the candidate builds once and later evidence-only work is skipped | Yes, before approving the grouped deployment |
| `docs/database-recovery-runbook.md` | Supported empty-target schema reconstruction, validation and production boundaries | Yes, before disaster-recovery work or changing the recovery baseline |
| `scripts/rehearse-database-recovery.mjs` | Disposable local recovery rehearsal from a checksummed schema baseline plus forward migrations | Yes, after database migration changes |
| `docs/production-audit-runbook.md` | Post-deploy verification and rollback gate | Yes, after an approved deploy |
| `docs/grouped-release-social-economics-20260829.md` | Exact migration, one-deploy, verification and non-destructive rollback plan for the current release candidate | Yes, before approving this release |
| `scripts/audit-local.mjs` | Static operational contract checks | Yes, before every release |

## Product Areas

| Area | Files/Folders | Notes |
| --- | --- | --- |
| Public pages | `src/app/page.tsx`, `src/app/catalog/`, `src/app/pricing/`, `src/app/sell/`, `src/app/contact/` | Customer-facing; changes need approval. |
| Admin | `src/app/admin/`, `src/components/admin/` | Operational risk; check role/access assumptions. |
| Cron endpoints | `src/app/api/cron/newsletter/route.ts`, `src/app/api/cron/social/route.ts`, `src/app/api/cron/instagram/route.ts`, `src/app/api/cron/listing-watch/route.ts`, `.github/workflows/newsletter.yml`, `netlify/functions/social-scheduled.mjs` | Live dispatch risk; default to dry-run/proposal. Listing-watch closure preserves the final provider-accepted update before terminal cleanup. Social publication now has a release-candidate per-network/placement receipt ledger; do not treat it as live before migration `20260829490000` and runtime deployment are verified. |
| Payments | `src/app/api/webhooks/stripe/`, `src/utils/stripe.ts`, pricing actions | Do not change without exact approval. |
| Commercial measurement | `src/app/catalog/[id]/ListingViewTracker.tsx`, `src/utils/buyer-funnel.mjs`, `src/utils/catalog-search.mjs`, `src/utils/social-publication.mjs`, `src/utils/commercial-economics.mjs`, catalog actions, new-balloon actions, `scripts/capture-commercial-baseline.mjs`, `scripts/capture-marketplace-audit.mjs` | Comparable post-instrumentation buyer conversion, localized European entry without PII, attributed social acquisition, contact reveals, quote persistence, payment evidence and release-candidate unit economics that keep unknown costs null. |
| Email | `src/utils/resend.ts`, premium alerts, newsletter cron | Customer-facing; dispatch requires approval. |
| Database | `supabase/schema.sql`, `supabase/migrations/`, `supabase/recovery/`, Supabase utilities | Treat production data as external system. The recovery snapshot is schema-only and does not replace production row backups. |
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
| Outbound delivery verification | `In origin/main`: Resend acceptance IDs, partial-run tracking, Meta credential preflight and actionable failure classes are present in the reconciled base; production evidence was not rechecked in this work. |
| Commercial funnel instrumentation | `Release candidate`: anonymous/public contact reveals, fail-closed quote storage and 30-day baseline are locally verified. |
| Payment notification evidence | `Release candidate`: charge-bound idempotency plus private receipt/readback await approved migration, webhook event enablement and deploy. |
| Dependency security | `Release candidate`: Next.js 16.3.3, matching ESLint config and Resend 6.25.0 are pinned; npm audit reports zero known vulnerabilities locally. |
| Commercial unit economics | `Release candidate`: complete direct cost, payment fee and tax evidence extends the existing outcome, preserves negative contribution and creates an immutable snapshot; migration `20260829500000` and production readback are still required. |

## Local Artifacts

| Path | Policy |
| --- | --- |
| `.env*` | Local/runtime environment only; never commit or inspect secret values. |
| `.next/` | Next.js build output; ignored and disposable. |
| `.netlify/` | Netlify local build/deploy output; ignored and disposable. |
| `social-previews/` | Local creative previews; ignored and disposable unless explicitly promoted into `public/social/`. |
| `node_modules/`, `*.tsbuildinfo`, `next-env.d.ts` | Local dependency/type cache output; ignored and disposable. |
