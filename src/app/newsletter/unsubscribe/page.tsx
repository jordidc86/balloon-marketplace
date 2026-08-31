import type { Metadata } from 'next'
import NewsletterUnsubscribeForm from './NewsletterUnsubscribeForm'
import PublicNewsletterUnsubscribeForm from './PublicNewsletterUnsubscribeForm'

export const metadata: Metadata = {
  title: 'Stop marketplace updates | AeroTrade',
  robots: { index: false, follow: false },
}

export default async function NewsletterUnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; subscription?: string; token?: string }>
}) {
  const params = await searchParams
  return <main className="mx-auto max-w-xl px-4 py-16">{params.subscription
    ? <PublicNewsletterUnsubscribeForm subscription={params.subscription} token={params.token || ''} />
    : <NewsletterUnsubscribeForm id={params.id || ''} token={params.token || ''} />}</main>
}
