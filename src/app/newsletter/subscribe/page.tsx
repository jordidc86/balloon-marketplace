import type { Metadata } from 'next'
import NewsletterConsentForm from './NewsletterConsentForm'
import PublicNewsletterConsentForm from './PublicNewsletterConsentForm'

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
  searchParams: Promise<{ id?: string; subscription?: string; cycle?: string; expires?: string; token?: string }>
}) {
  const params = await searchParams
  return <main className="mx-auto max-w-xl px-4 py-16">{params.subscription
    ? <PublicNewsletterConsentForm subscription={params.subscription} cycle={params.cycle || ''} expires={params.expires || ''} token={params.token || ''} />
    : <NewsletterConsentForm id={params.id || ''} expires={params.expires || ''} token={params.token || ''} />}</main>
}
