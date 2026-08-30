# AeroTrade grouped release: social evidence, economics and conversion recovery

Status: explicitly authorized by Jordi on 2026-08-30; production is unchanged until the gates below pass.

## Purpose

Ship thirteen material, additive capabilities in one Netlify production deploy:

1. Per-content, network and placement social-publication receipts with provider-ID acceptance, bounded retry and attributable links.
2. Complete, evidence-backed unit economics on the existing commercial outcome, with unknown costs kept null and every measurement snapshotted immutably.
3. A private, capability-bound response loop for accepted indicative new-balloon proposals, with one immutable buyer response, database readback and an auditable internal notification.
4. A one-time, bounded recovery path for a genuine buyer-initiated annual Buyer Early Access checkout that expired without verified payment.
5. Explicit, owner-controlled consent for the existing bi-weekly newsletter, with no legacy opt-in inference, a signed POST-only stop control and a consent recheck before selective recovery.
6. One authenticated seller action that confirms every currently active owned listing while preserving independent, immutable availability evidence per advert.
7. One manual, transactional availability digest per seller, grouping every currently due advert into a single provider-audited request with a stable cycle key and a 30-day anti-churn boundary.
8. A private 14-day seller capability that turns that accepted digest into an explicit, scanner-safe review and confirmation step without requiring a remembered password, while binding the action to the exact current inventory-evidence cycle.
9. Four high-intent European buyer entries in English, German, French and Spanish that display only current public inventory and route demand into the existing catalogue, wanted-request and new-balloon quotation funnels while preserving external acquisition attribution.
10. Privacy-minimized measurement of those four localized entries inside the existing catalogue-demand ledger, separating genuine landing visits, listing openings and downstream high-intent journeys from ordinary catalogue searches and zero-result demand.
11. One internal recovery escalation for a marketplace enquiry that remains untouched 48 hours after provider acceptance of its single seller reminder, surfaced in Control Tower without re-contacting the buyer or repeating the seller reminder.
12. A direct bridge from successful owner availability confirmation to voluntary, attributable seller sharing of those same confirmed adverts, reusing the existing share links and sending nothing automatically.
13. One non-promotional consent invitation for each existing non-admin account whose newsletter preference remains `NOT_REQUESTED`. Provider acceptance is recorded once, opening the private 30-day link performs no write, and only an explicit POST changes that account to `ACTIVE` with readback. Existing `ACTIVE` and `UNSUBSCRIBED` preferences are excluded.

The release also activates a deployment-cost guard: future production builds require an explicit change to `release/netlify-production.json`. Ordinary runtime commits may be staged on `main` but cannot independently consume a production-deploy charge.

The release does not change prices, publish a post, send a message by itself, create a commercial outcome, order, reservation, payment or assign inferred revenue or costs. A proposal email and a seller availability digest are still sent only when an authenticated administrator explicitly presses their respective buttons. Buyer Early Access recovery remains dry-run only during release verification; sending any real recovery email or seller digest requires separate approval after the eligible aggregate count is known.

## Exact source

- Production base: `9880e56df0b1f47089c0ea176d57a613c25847a5`.
- Runtime release candidate: `b0fe505`.
- Material runtime commits: `2ba08b5`, `a569817`, `827cf84`, `ac3af21`, `2aba405`, `fb7bfa2`, `4f8373d`, `d810f3b`, `6a2d763`, `c34b940`, `e3577f3`, `8abde69`, `255f37e`, `c0589ea`, `5cddd94`, `611c9df` and `dfc5427`.
- Required migrations, in order:
  1. `20260829490000_social_publication_receipts.sql`
  2. `20260829500000_commercial_unit_economics.sql`
  3. `20260829510000_new_balloon_proposal_responses.sql`
  4. `20260829520000_buyer_early_access_checkout_recovery.sql`
  5. `20260829530000_newsletter_consent.sql`
  6. `20260829540000_bulk_listing_availability_confirmation.sql`
  7. `20260829550000_seller_availability_digest.sql`
  8. `20260829560000_seller_availability_email_capability.sql`
  9. `20260829570000_catalog_demand_entry_context.sql`
  10. `20260829580000_inquiry_seller_escalation.sql`
  11. `20260829590000_fix_listing_availability_conflict.sql`
  12. `20260829600000_newsletter_consent_invitation.sql`
- Explicit production release marker: `release/netlify-production.json` with release ID `2026-08-29-grouped-commercial-release`.

## Authorization gate

Do not apply any production migration, merge/push to `main`, trigger a deploy or call a production dry run until Jordi explicitly approves this grouped release. Jordi gave complete authorization in the controlling thread on 2026-08-30 after reviewing the release, dry runs and the separate one-time consent invitation.

Exact approval wording:

> Apruebo aplicar las migraciones 20260829490000, 20260829500000, 20260829510000, 20260829520000, 20260829530000, 20260829540000, 20260829550000, 20260829560000, 20260829570000, 20260829580000 y 20260829590000, publicar las cuatro entradas europeas de captación, su medición privada, la escalación interna de consultas sin respuesta y el paso voluntario de confirmación a distribución incluidos en el candidato dfc54277364ea2482c71fad67c0271dc98220591, realizar un único despliegue agrupado de Aerotrade —máximo estimado 15 créditos de Netlify— y ejecutar la verificación de producción, el dry run social sin publicar nada, el dry run de recuperación Buyer Early Access sin enviar emails ni crear cobros, el dry run de newsletter sin enviar emails y el dry run de oportunidades sin enviar emails. No autorizo enviar solicitudes de disponibilidad a vendedores durante esta liberación.

## Pre-release gate

1. Confirm the feature branch and `origin/main` still resolve to the exact commits above or recalculate this plan.
2. Confirm the worktree is clean and no secret or generated directory is tracked.
3. Run `npm test`, `npm run audit:local`, `npm run lint`, `npx tsc --noEmit`, `git diff --check` and `npm run build`.
4. Confirm the expected result remains 162/162 tests and 173/173 operational contracts.
5. Capture read-only counts of existing commercial outcomes and current Supabase migration versions without including personal data.
6. Confirm GitHub Actions workflow `Send Bi-Weekly Newsletter Cron` remains `disabled_manually`; it was paused before the 1 September schedule so the old runtime cannot send another registration-based marketing batch.

## Database order and readback

Apply all eleven additive migrations before deploying the runtime. Immediately verify, without inserting synthetic rows:

- `social_publication_receipts` exists, has RLS enabled and exposes no anonymous/authenticated write privilege.
- `commercial_unit_economics_events` exists, has RLS enabled and exposes no anonymous/authenticated write privilege.
- `commercial_outcomes` has all three nullable cost fields, the generated contribution field and economics evidence metadata.
- `record_commercial_unit_economics` exists with authenticated execute permission and no public/anonymous execute permission.
- `new_balloon_proposal_response_events` exists, has RLS enabled, is empty before real buyer use and exposes no anonymous/authenticated privilege.
- `record_new_balloon_proposal_response` is executable only by `service_role`; it cannot close a quote or create an outcome, order, reservation or payment.
- A stored response changes only the open quote state to `BUYER_RESPONDED`; one 24-hour operational reminder is deduplicated by its durable receipt and any later commercial closure remains administrator-only.
- `due_buyer_early_access_checkout_recoveries` is executable only by `service_role` and returns only the latest expired checkout for a non-Premium account when the source is `signup`, `pricing` or `dashboard` and it is at least 24 hours old.
- Accepted or exhausted Buyer Early Access recovery receipts suppress any repeat. The recovery query and dry run create no Stripe session, charge, payment or email.
- Existing accounts have newsletter state `NOT_REQUESTED`; migration never marks a legacy account as consented.
- `set_own_newsletter_consent` is executable only by an authenticated profile owner, and the signed unsubscribe action changes only the newsletter preference.
- A live newsletter selects only profiles with complete `ACTIVE` consent evidence, embeds one signed stop link per recipient and rechecks current consent before any manual recovery.
- `confirm_all_listing_availability` is executable only by an authenticated seller, returns only that seller's currently active listings and creates the same current-day immutable evidence as the individual action. Verifying the function must not call it or invent confirmation rows.
- The existing `commercial_notification_receipts` closed vocabulary accepts `seller_availability_digest` for a `user` entity. No parallel message ledger is created.
- A seller digest groups only due active adverts, has a stable order-independent key tied to each listing's latest genuine confirmation ID, permits safe retry of the same cycle and blocks changed digests for 30 days. Migration and release verification must send no digest.
- `confirm_listing_availability_from_seller_digest` is executable only by `service_role`, requires a provider-accepted digest no older than 15 days and writes only the exact bounded active listing IDs after the public action verifies a seller/email/digest/expiry HMAC capability.
- Migration `20260829590000` must replace all three availability RPCs with qualified identifiers and the named daily unique constraint. The linked schema lint must contain no AeroTrade error; the separate pre-existing `public.vb_redeem_open_gift_internal_v1` result-type error belongs to Voyager and is not modified by this release.
- Opening `/seller/availability` performs no write. The route is private/no-store/no-referrer/noindex, inventory drift invalidates the link, the seller must check an explicit declaration and submit a POST, and every returned per-listing confirmation must pass database readback.
- `catalog_search_events.entry_context` exists with the closed values `catalog_search`, `buyer_landing_en`, `buyer_landing_de`, `buyer_landing_fr` and `buyer_landing_es`; existing rows read back as `catalog_search` and the indexed field contains no URL, query, raw visitor identifier or personal data.
- The private notification vocabulary accepts `inquiry_seller_escalation` without removing any prior notification type. It creates no row by migration, and runtime eligibility requires an open `NEW`/`SELLER_NOTIFIED` enquiry plus an `accepted` seller-reminder receipt at least 48 hours old.
- Existing commercial-outcome row counts are unchanged and pre-existing rows have null economics fields.
- No social receipt, economics event, proposal response, post, message, charge or other economic action was created by migration verification.
- `newsletter_consent_invitation` is accepted by the closed private delivery vocabulary. The migration creates no receipt, email or consent, and does not change any existing preference.

Abort before runtime deployment if any readback differs.

## One runtime deployment

After database readback succeeds:

1. Fast-forward or merge the exact release candidate to `main` once.
2. Confirm the release marker is part of the resulting `main` commit and Netlify starts exactly one production build.
3. Do not create evidence-only follow-up commits while that build is running.
4. Confirm the deployed commit, route health and protected-admin redirects.
5. Confirm Control Tower loads the new social and economics queries without a database error.
6. Confirm the private proposal route returns a safe unavailable state without a valid signed capability and never exposes buyer contact data.
7. Confirm the seller availability route returns a safe unavailable state without a valid signed capability, exposes no seller email, has private/no-store/no-referrer/noindex response headers and performs no write on GET.
8. Confirm the opportunity-follow-up dry run reports only the aggregate `dueBuyerEarlyAccessCheckoutRecoveries`; do not set `commit=1` during release verification.
9. Confirm the deployed build gate skips a subsequent non-release commit and that the skip is not a successful production deploy. Do not create a production commit solely for this test; verify it on the next genuine documentation-only change.
10. Confirm all four European buyer entries return HTTP 200, expose reciprocal canonical/hreflang metadata, show only publicly released inventory and remain present in the sitemap and IndexNow public URL set.
11. Confirm a genuine non-admin landing visit can be recorded at most once per route/day and that Control Tower separates localized entry, later listing opening and high-intent journey from ordinary search gaps. Do not generate synthetic production visits merely to satisfy this check.
12. Run the opportunity endpoint without `commit=1`; confirm it reports `dueSellerEnquiryEscalations` but sends no seller, buyer or administrator email. A due escalation must appear in Control Tower as attention, and a progressed enquiry must not remain eligible.
13. Confirm the seller availability page exposes no share action before database-confirmed success, then offers only the exact confirmed public listings through canonical `seller_share` links. Opening the page or confirming availability must not send or publish a share automatically.

## Safe post-deploy checks

1. Run the social endpoint in `dryRun=1` first. It must plan at most the requested item and create no Meta media.
2. A provider credential check may be run only when separately covered by the release approval; it must not publish.
3. Do not run a live social publication merely to create evidence.
4. Do not create a synthetic outcome or invent costs. The first economics entry must be tied to a genuine existing outcome and operator-held evidence.
5. Run the PII-free read-only marketplace audit and confirm missing economics are counted separately from zero and negative contribution is preserved.
6. Do not create a synthetic proposal response. The first response event must come from a genuine buyer using a proposal link that was generated after this release.
7. Run Buyer Early Access recovery without `commit=1`. It may expose only the due count. Sending real recovery emails requires a separate explicit approval after that count is reviewed.
8. Run the newsletter endpoint in dry-run mode. Immediately after migration the eligible real-recipient count must be zero because no legacy account is inferred as consented; do not supply a test email or run a live send.
9. Re-enable the bi-weekly workflow only after the preference UI, signed unsubscribe route and zero-recipient dry run all pass production readback. Re-enabling the scheduler does not authorize a manual live send or infer consent for any existing account.
10. Run the separate consent-invitation endpoint without `commit=1`. It must return only aggregate counts, exclude administrators and decided preferences, create no receipt and send no email. After the private route and POST-only activation pass production readback, the separately authorized live invitation may run once with the exact confirmation gate. Read back accepted/failed aggregate receipts before enabling the newsletter scheduler.

## Rollback plan

The safe rollback is runtime-first and non-destructive:

1. Roll Netlify back to production base `9880e56df0b1f47089c0ea176d57a613c25847a5` or its known-good deploy `6a92ffe4dbebcf0008be7dd7`.
2. Leave all eleven additive private tables/functions, constraint extensions and nullable columns in Supabase. The previous runtime does not query them, so retaining them preserves audit evidence and avoids destructive rollback.
3. Pause the scheduled social function only if the reverted runtime or credential state cannot be proven safe; do not repeat any pending or ambiguous provider operation.
4. Keep the newsletter workflow disabled if runtime is rolled back below the consent-safe release.
5. Do not drop tables, columns, functions or events during incident response. Any later schema removal requires a separate migration, backup and explicit approval.

## Netlify credit gate

- Expected charge for this release: exactly one successful production deploy, currently 15 credits under Netlify's credit-based plan.
- Intermediate work must use local tests/builds and the isolated feature branch. Do not create Netlify deploy previews or branch builds merely for validation.
- Never increment `release/netlify-production.json` for documentation, evidence or an isolated incremental change.
- If more than one production deploy is created, stop the release and investigate before any further push.

The production auditor is release-version aware: the currently deployed schema remains fully auditable while these eleven candidate migrations are pending. Candidate-only datasets are reported as `not_deployed`; authentication, permission and network failures still fail the audit closed.

## Score gate

This release alone does not authorize a commercial-proof score increase. Social acquisition needs a genuine provider-accepted placement and attributable visit; unit economics needs a genuine commercial outcome with complete evidence; proposal conversion needs a genuine buyer response; checkout recovery needs a genuine accepted reminder followed by a verified annual payment; newsletter acquisition needs an explicit consent followed by an attributable visit or conversion; availability needs a genuine owner action, and seller-digest delivery needs explicit outreach approval plus provider evidence. Until then, all twelve remain implemented release candidates rather than commercially proven capabilities. The multilingual pages and their measurement are an acquisition hypothesis until genuine visits and a downstream action are observed; seller-response escalation needs a genuine stalled enquiry before it proves recovery value, and seller distribution needs a genuine shared-link visit before it proves acquisition value.
