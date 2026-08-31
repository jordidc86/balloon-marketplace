import type { Metadata } from 'next'
import Link from 'next/link'
import { CheckCircle2, Clock3, ShieldCheck, TriangleAlert } from 'lucide-react'
import { createAdminClient } from '@/utils/supabase/server'
import { getListingAvailabilityState } from '@/utils/listing-availability.mjs'
import { sellerAvailabilityDigestIdempotencyKey, sellerAvailabilityDigestInventoryKey } from '@/utils/seller-availability-digest.mjs'
import { verifySellerAvailabilityCapability } from '@/utils/seller-availability-capability.mjs'
import { siteUrl } from '@/utils/site'
import SellerAvailabilityConfirmationForm from './SellerAvailabilityConfirmationForm'

export const metadata: Metadata = {
  title: 'Confirm listing availability | AeroTrade',
  robots: { index: false, follow: false, noarchive: true, nosnippet: true },
  referrer: 'no-referrer',
}
export const dynamic = 'force-dynamic'
export const revalidate = 0

type ActiveListing = { id: string; title: string; status: string }
type Confirmation = { id: string; listing_id: string; confirmed_at: string }

const formatDate = (value: string) => new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'medium',
  timeZone: 'Europe/Madrid',
}).format(new Date(value))

export default async function SellerAvailabilityPage({ searchParams }: { searchParams: Promise<{ seller?: string; digest?: string; token?: string }> }) {
  const params = await searchParams
  const sellerId = params.seller || ''
  const digestKey = params.digest || ''
  const token = params.token || ''
  const admin = await createAdminClient()
  const [{ data: seller }, { data: receipt }] = await Promise.all([
    admin.from('users').select('id,email').eq('id', sellerId).maybeSingle(),
    admin
      .from('commercial_notification_receipts')
      .select('id,status,provider_message_id,accepted_at')
      .eq('notification_type', 'seller_availability_digest')
      .eq('entity_type', 'user')
      .eq('entity_id', sellerId)
      .eq('idempotency_key', digestKey)
      .maybeSingle(),
  ])
  const baseAuthorized = Boolean(seller?.id && seller.email && receipt?.status === 'accepted' && receipt.provider_message_id
    && verifySellerAvailabilityCapability({
      sellerId: seller.id,
      sellerEmail: seller.email,
      digestKey,
      secret: process.env.SUPABASE_SERVICE_ROLE_KEY,
      token,
    }))

  if (!baseAuthorized || !seller) {
    return <Unavailable />
  }

  const { data: listingRows, error: listingsError } = await admin
    .from('listings')
    .select('id,title,status')
    .eq('seller_id', seller.id)
    .in('status', ['ACTIVE_PUBLIC', 'ACTIVE_PREMIUM'])
    .order('id')
  const activeListings = (listingRows || []) as ActiveListing[]
  const listingIds = activeListings.map((listing) => listing.id)
  const { data: confirmationRows, error: confirmationsError } = listingIds.length > 0
    ? await admin
      .from('listing_availability_confirmations')
      .select('id,listing_id,confirmed_at')
      .in('listing_id', listingIds)
      .order('confirmed_at', { ascending: false })
    : { data: [], error: null }
  if (listingsError || confirmationsError) return <Unavailable />

  const latestByListing = new Map<string, Confirmation>()
  for (const confirmation of (confirmationRows || []) as Confirmation[]) {
    if (!latestByListing.has(confirmation.listing_id)) latestByListing.set(confirmation.listing_id, confirmation)
  }
  const dueListings = activeListings.filter((listing) => !getListingAvailabilityState(latestByListing.get(listing.id)?.confirmed_at).publiclyFresh)

  if (dueListings.length === 0) {
    return <main className="mx-auto max-w-xl px-4 py-16"><div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-emerald-950"><div className="flex items-start gap-3"><CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0" /><div><h1 className="text-2xl font-bold">Availability already current</h1><p className="mt-3 text-sm">All your active AeroTrade listings already have a recent owner confirmation. No further action is required.</p><Link href="/dashboard" className="mt-5 inline-flex rounded-lg border border-emerald-300 px-4 py-2 text-sm font-semibold">Open dashboard</Link></div></div></div></main>
  }

  const currentDigestKey = sellerAvailabilityDigestIdempotencyKey(seller.id, dueListings.map((listing) => ({
    listingId: listing.id,
    confirmationId: latestByListing.get(listing.id)?.id || null,
  })))
  if (sellerAvailabilityDigestInventoryKey(digestKey) !== currentDigestKey) {
    return <main className="mx-auto max-w-xl px-4 py-16"><div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-950"><div className="flex items-start gap-3"><TriangleAlert className="mt-0.5 h-6 w-6 shrink-0" /><div><h1 className="text-2xl font-bold">Your inventory has changed</h1><p className="mt-3 text-sm">This email no longer represents the current set of listings requiring confirmation. Nothing has been changed. Sign in to review the latest inventory safely.</p><Link href="/dashboard" className="mt-5 inline-flex rounded-lg border border-amber-300 px-4 py-2 text-sm font-semibold">Open dashboard</Link></div></div></div></main>
  }

  return (
    <main className="mx-auto max-w-2xl space-y-5 px-4 py-12 sm:py-16">
      <section className="rounded-2xl border bg-card p-6">
        <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-6 w-6 shrink-0 text-primary" /><div><p className="text-xs font-bold uppercase tracking-wide text-primary">Private seller review</p><h1 className="mt-1 text-2xl font-bold">Confirm your active AeroTrade inventory</h1><p className="mt-3 text-sm text-muted-foreground">Opening this page has not confirmed anything. Review every advert below, then use the explicit confirmation control.</p></div></div>
        <ul className="mt-6 divide-y rounded-xl border">
          {dueListings.map((listing) => {
            const latest = latestByListing.get(listing.id)
            return <li key={listing.id} className="p-4"><p className="font-semibold">{listing.title}</p><p className="mt-1 text-xs text-muted-foreground">{latest ? `Last owner confirmation: ${formatDate(latest.confirmed_at)}` : 'Never confirmed by the owner'}</p></li>
          })}
        </ul>
      </section>
      <SellerAvailabilityConfirmationForm
        sellerId={seller.id}
        digestKey={digestKey}
        token={token}
        baseUrl={siteUrl}
        listings={dueListings.map((listing) => ({ id: listing.id, title: listing.title }))}
      />
      <section className="flex items-start gap-3 rounded-xl border bg-muted/30 p-4"><Clock3 className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><p className="text-sm text-muted-foreground">Confirmation creates one dated evidence record per listed advert. It does not change price, publication, ownership, payment or claim that AeroTrade inspected the equipment. If an advert is no longer available, do not confirm it; sign in and close or edit it instead.</p></section>
    </main>
  )
}

function Unavailable() {
  return <main className="mx-auto max-w-xl px-4 py-16"><div className="rounded-2xl border bg-card p-6"><h1 className="text-2xl font-bold">Availability link unavailable</h1><p className="mt-3 text-sm text-muted-foreground">This private link is invalid, expired or was not accepted by the email provider. Nothing has been changed. Use your latest AeroTrade email or sign in to the dashboard.</p><Link href="/dashboard" className="mt-5 inline-flex rounded-lg border px-4 py-2 text-sm font-semibold">Open dashboard</Link></div></main>
}
