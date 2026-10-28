import type { Metadata } from 'next'
import NewsletterConsentForm from './NewsletterConsentForm'
import PublicNewsletterConsentForm from './PublicNewsletterConsentForm'
import PublicNewsletterSignup from '@/components/PublicNewsletterSignup'
import { newsletterConfirmationLinkKind } from '@/utils/newsletter-confirmation-link.mjs'

export const metadata: Metadata = {
  title: 'Choose marketplace updates | AeroTrade',
  robots: { index: false, follow: false, noarchive: true, nosnippet: true },
  referrer: 'no-referrer',
}
export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function NewsletterSubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; subscription?: string; cycle?: string; expires?: string; token?: string; campaign?: string }>
}) {
  const params = await searchParams
  const kind = newsletterConfirmationLinkKind(params)
  return <main className="mx-auto max-w-xl px-4 py-16">{kind === 'public'
    ? <PublicNewsletterConsentForm subscription={params.subscription || ''} cycle={params.cycle || ''} expires={params.expires || ''} token={params.token || ''} />
    : kind === 'account'
      ? <NewsletterConsentForm id={params.id || ''} expires={params.expires || ''} token={params.token || ''} campaign={params.campaign || ''} />
      : <>
        <h1 className="mb-4 text-2xl font-bold">Subscribe to AeroTrade updates</h1>
        {kind === 'invalid' ? <p className="mb-6 rounded-lg border bg-secondary p-4 text-sm">This confirmation link is incomplete or has expired. Request a new confirmation below. Your subscription has not been changed.</p> : null}
        <PublicNewsletterSignup sourceContext="unknown" />
      </>}</main>
}
