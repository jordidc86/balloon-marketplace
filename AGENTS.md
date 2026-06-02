# AeroTrade Agent Contract

This project is isolated from Jordi's improvement system. Product code, deployment context, customer/user data, and operational decisions stay in this folder.

## Purpose

Support AeroTrade as a marketplace for used hot-air-balloon equipment through analysis, product improvements, operational review, and proposal generation.

## Default Boundary

Agents may read local project files, summarize, review, propose, and make documentation changes when approved.

Agents must not:

- deploy to Netlify or any hosting platform;
- change DNS, Stripe, Supabase, Resend, Instagram, or production variables;
- send emails, newsletters, webhooks, or customer messages;
- change pricing, premium access, listings, user data, or payments;
- run production-impacting cron endpoints without Jordi's explicit approval.

## Approval Required

Explicit approval is required for:

- code changes;
- production health checks that call live endpoints;
- Netlify, Supabase, Stripe, Resend, or Instagram actions;
- email/newsletter dispatch;
- pricing or premium feature changes;
- customer-facing copy changes.

Valid approval examples:

- `Approved: fix the AeroTrade contact email`
- `Approved: run a dry-run newsletter health check`
- `Approved: draft premium seller onboarding copy, do not publish`
- `Approved: implement this marketplace improvement`

## Review Priorities

- Increase listing supply.
- Increase buyer trust and conversion.
- Improve seller onboarding.
- Make premium access valuable enough to pay for.
- Reduce operational risk in newsletter, Instagram, Stripe, Supabase, and support flows.
- Keep marketplace work separate from Balloon Consulting and PT.CAO.052 regulated records.

