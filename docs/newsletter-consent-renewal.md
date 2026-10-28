# Newsletter consent renewal

The mobile navigation exposes the primary marketplace destinations below the desktop breakpoint. Direct visits to `/newsletter/subscribe` show the signup form; incomplete or expired links show a recovery explanation. Complete links retain the explicit confirmation step.

Renewal invitations use a campaign-bound signature and a separate durable receipt key. Legacy account invitations remain valid within their original lifetime. Renewals neither replace historical receipts nor activate preferences automatically.

`scripts/renew-newsletter-consent.ts` is an operator-only, one-off utility, with no workflow or scheduler. Bundle it for Node with the repository TypeScript aliases resolved before running it. Its `--plan <private-file>` mode reads current users, public subscriptions and durable exclusions and creates an exact recipient plan with a SHA-256 fingerprint. The file contains personal information and must remain outside the repository.

Only explicitly authorized campaigns may use `--apply <private-file>`. Apply requires `CONFIRM_AEROTRADE_CONSENT_BATCH` to match the plan fingerprint and `EXPECTED_DEPLOY_COMMIT` to match Netlify's published production commit. Supply existing provider credentials through the process environment; never commit them. The current approved campaign is `2026-10-28`.

Recipients must be non-admin accounts with no recorded consent or unsubscribe. Public active/opted-out subscriptions, durable invitation exclusions, duplicate addresses and reserved domains are excluded. Eligibility is read again before each delivery. Sending reuses the existing commercial-notification claim, receipt and provider-idempotency machinery. If acceptance is uncertain the process stops; inspect private result evidence before retrying. No automatic retry or future campaign is scheduled.

The English message describes newsletter preference changes and asks for explicit confirmation. It does not claim an unverified delivery error. Opening the link does not subscribe the recipient. Confirmation checks the campaign signature, accepted provider receipt and current account state before activation.
