This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## AeroTrade Social Publishing

The scheduled social endpoint is available at `/api/cron/social`. The older
`/api/cron/instagram` endpoint remains compatible and runs the same workflow.

It promotes listings that are active, past their premium window, and not marked
as sold, archived, draft, pending payment, or flagged. By default each run picks
one listing for the daily rotating queue, prioritizing listings with no recent
social promotion. Each selected listing is published as an Instagram feed post,
Instagram story, Facebook Page post, and Facebook Page story. Use `?limit=2`
through `?limit=5` to process a larger batch.

Use `/api/cron/social?dryRun=1` to inspect the planned posts without changing
listing status, sending reminders, or calling Meta.

Required runtime variables:

- `CRON_SECRET`: bearer token required in production.
- `NEXT_PUBLIC_SITE_URL`: public AeroTrade URL used in captions.
- `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`: admin data access.
- `INSTAGRAM_USER_ID` plus `INSTAGRAM_ACCESS_TOKEN` or `META_ACCESS_TOKEN`: Instagram publishing.
- `FACEBOOK_PAGE_ID` plus `FACEBOOK_PAGE_ACCESS_TOKEN` or `META_ACCESS_TOKEN`: Facebook Page publishing.
- `ADMIN_EMAIL`: receives reminders when a network is not configured.

Apply the Supabase migration before enabling Facebook publishing:

```bash
supabase db push
```
