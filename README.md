# AeroTrade

AeroTrade is a Next.js marketplace for used hot-air-balloon equipment. The app is deployed on Netlify and uses Supabase, Stripe, Resend, GitHub Actions, and Netlify scheduled functions for operational flows.

## Local Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

Do not commit local environment files or generated outputs. The repository intentionally ignores `.env*`, `.next/`, `.netlify/`, `node_modules/`, `social-previews/`, `*.tsbuildinfo`, and `next-env.d.ts`.

## Verification

Use these checks before opening a PR or deploying:

```bash
git status --short
git ls-files .env.local .next .netlify social-previews
npm test
npm run audit:local
npm run lint
npm run build
```

The `git ls-files` command should print nothing for local env/build folders.

The production verification sequence is documented in `docs/production-audit-runbook.md`. It must be executed only after the matching migration and code are deployed with the required approval.

## Deployment

Production is configured through Netlify. The committed deployment source is `netlify.toml`; the local `.netlify/` folder is generated output and must not be treated as source.

Do not deploy, change Netlify settings, or modify production environment variables without explicit approval.

## Supabase

Supabase schema and migrations live under `supabase/`. Do not run production migrations such as `supabase db push` without explicit approval and a rollback plan.

## Newsletter

The bi-weekly newsletter is triggered by `.github/workflows/newsletter.yml` against `/api/cron/newsletter`.

- Scheduled runs send the normal production newsletter.
- Manual runs default to `dry_run=true`.
- Manual live sends (`dry_run=false`) require the GitHub environment `production-newsletter`.
- Live newsletter and Premium alert runs count a recipient as sent only when Resend returns an acceptance ID.
- Missing Resend credentials fail the run explicitly; local mocks are never recorded as delivery.

## Social Publishing

The scheduled social endpoint is `/api/cron/social`. The older `/api/cron/instagram` endpoint remains compatible and runs the same workflow.

It promotes eligible active listings, avoiding sold, archived, draft, pending payment, and flagged listings. Use `/api/cron/social?dryRun=1` to inspect planned posts without changing listing status, sending reminders, or calling Meta. An approved provider preflight can use `/api/cron/social?dryRun=1&providerCheck=1`; it validates Meta credentials without creating or publishing media.

Live social runs classify token, permission, timeout, rate-limit and configuration failures. Provider failures return a non-2xx response so the scheduler cannot report a false success. Meta read-only status checks use bounded retries; publication POST requests are not automatically repeated.

Successful Stripe charges send one idempotent administrative email to `ADMIN_EMAIL`. Idempotency is bound to the Stripe charge, not merely to one delivery of the webhook event. The Stripe event is marked processed only after Resend returns a provider acceptance identifier and a private, non-PII receipt is persisted and read back from `payment_notification_receipts`. Failed delivery or failed persistence remains retryable through Stripe without counting an unverifiable notice as complete.

Commercial measurement records bounded listing views, successful seller-contact reveals (including anonymous public visitors), durably stored new-balloon quote requests and payment-notification coverage. Generate a read-only 30-day snapshot only with explicit production-read approval:

```bash
CONFIRM_READ_ONLY_PRODUCTION=1 npm run baseline:commercial
```

For a broader, PII-free operational audit of supply, listing quality, demand,
opportunities, communications and revenue evidence, run:

```bash
CONFIRM_READ_ONLY_PRODUCTION=1 npm run audit:marketplace
```

The payment totals in that snapshot are gross Stripe charges in minor currency units. They are not net revenue and do not subtract fees, refunds, disputes or tax.

Required runtime variables are configured in the hosting environment, not in this repository:

- `CRON_SECRET`
- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `INSTAGRAM_USER_ID` plus `INSTAGRAM_ACCESS_TOKEN` or `META_ACCESS_TOKEN`
- `FACEBOOK_PAGE_ID` plus `FACEBOOK_PAGE_ACCESS_TOKEN` or `META_ACCESS_TOKEN`
- `ADMIN_EMAIL`

The Stripe endpoint must explicitly subscribe to `charge.succeeded` before payment notices can be considered operational. Enabling that live event and applying database migrations require separate production approval.
