import { createAdminClient } from '@/utils/supabase/server'
import { CircleDollarSign, MessageSquare, Plane, TriangleAlert } from 'lucide-react'
import { updateAdminInquiryStatus, updateQuoteRequestStatus } from '../actions'

export const dynamic = 'force-dynamic'

type Inquiry = {
  id: string
  buyer_name: string
  buyer_email: string
  status: string
  seller_notification_status: string
  created_at: string
  last_activity_at: string
  listings: { title: string } | null
}

type Quote = {
  id: string
  name: string
  email: string
  equipment_type: string
  status: string
  created_at: string
}

type CommercialNotification = {
  id: string
  notification_type: string
  entity_type: string
  status: string
  created_at: string
}

const formatDate = (value: string) => new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Europe/Madrid',
}).format(new Date(value))

const openInquiryStatuses = ['NEW', 'SELLER_NOTIFIED', 'CONTACTED', 'QUALIFIED', 'NEGOTIATING']

export default async function CommercialPage() {
  const supabase = await createAdminClient()
  // This is a force-dynamic server component; the cutoff is intentionally evaluated per request.
  // eslint-disable-next-line react-hooks/purity
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString()
  const [{ data: inquiries, error: inquiriesError }, { data: quotes, error: quotesError }, { data: receipts }, { data: events }, { data: notifications, error: notificationsError }] = await Promise.all([
    supabase.from('marketplace_inquiries').select('id,buyer_name,buyer_email,status,seller_notification_status,created_at,last_activity_at,listings(title)').order('created_at', { ascending: false }).limit(100),
    supabase.from('quote_requests').select('id,name,email,equipment_type,status,created_at').order('created_at', { ascending: false }).limit(100),
    supabase.from('payment_notification_receipts').select('payment_type,livemode,amount_minor,currency,accepted_at').order('accepted_at', { ascending: false }).limit(100),
    supabase.from('listing_events').select('event_type,created_at').gte('created_at', thirtyDaysAgo),
    supabase.from('commercial_notification_receipts').select('id,notification_type,entity_type,status,created_at').order('created_at', { ascending: false }).limit(100),
  ])

  const typedInquiries = (inquiries || []) as unknown as Inquiry[]
  const typedQuotes = (quotes || []) as Quote[]
  const typedNotifications = (notifications || []) as CommercialNotification[]
  const views = (events || []).filter((event) => event.event_type === 'VIEW').length
  const reveals = (events || []).filter((event) => event.event_type === 'CONTACT_REVEAL').length
  const openInquiries = typedInquiries.filter((inquiry) => openInquiryStatuses.includes(inquiry.status)).length
  const won = typedInquiries.filter((inquiry) => inquiry.status === 'WON').length + typedQuotes.filter((quote) => quote.status === 'WON').length
  const failedNotifications = typedInquiries.filter((inquiry) => inquiry.seller_notification_status === 'failed').length
    + typedNotifications.filter((notification) => notification.status === 'failed').length
  const liveReceipts = (receipts || []).filter((receipt) => receipt.livemode)
  const liveGross = liveReceipts.reduce((sum, receipt) => receipt.currency === 'eur' ? sum + Number(receipt.amount_minor || 0) : sum, 0)

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Commercial Pipeline</h1>
        <p className="mt-1 text-muted-foreground">Evidence from interest to opportunity, outcome and verified payment notification.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric title="Views (30d)" value={views} icon={<Plane className="h-5 w-5" />} detail={`${reveals} direct contact reveals`} />
        <Metric title="Open opportunities" value={openInquiries + typedQuotes.filter((quote) => !['WON', 'LOST'].includes(quote.status)).length} icon={<MessageSquare className="h-5 w-5" />} detail={`${typedInquiries.length} marketplace · ${typedQuotes.length} new balloon`} />
        <Metric title="Won outcomes" value={won} icon={<CircleDollarSign className="h-5 w-5" />} detail="Recorded outcomes, not assumed sales" />
        <Metric title="Needs attention" value={failedNotifications} icon={<TriangleAlert className="h-5 w-5" />} detail="Seller emails not accepted" warning={failedNotifications > 0} />
      </div>

      <div className="rounded-2xl border bg-card p-6">
        <h2 className="text-xl font-semibold">Revenue evidence</h2>
        <p className="mt-1 text-sm text-muted-foreground">{liveReceipts.length} live payment notification receipt(s) · {(liveGross / 100).toLocaleString('en-IE', { style: 'currency', currency: 'EUR' })} gross EUR represented. This is not net revenue.</p>
      </div>

      {notificationsError ? <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">Commercial notification evidence unavailable: {notificationsError.message}</p> : null}

      <section className="rounded-2xl border bg-card overflow-hidden">
        <div className="border-b p-6"><h2 className="text-xl font-semibold">Marketplace enquiries</h2></div>
        {inquiriesError ? <p className="p-6 text-destructive">Pipeline unavailable: {inquiriesError.message}</p> : typedInquiries.length === 0 ? <p className="p-6 text-sm text-muted-foreground">No tracked enquiries yet.</p> : (
          <div className="divide-y">
            {typedInquiries.map((inquiry) => (
              <div key={inquiry.id} className="grid gap-4 p-6 lg:grid-cols-[1.3fr_1fr_auto] lg:items-center">
                <div>
                  <p className="font-semibold">{inquiry.buyer_name} · {inquiry.listings?.title || 'Listing'}</p>
                  <a href={`mailto:${inquiry.buyer_email}`} className="text-sm text-primary hover:underline">{inquiry.buyer_email}</a>
                  <p className="mt-1 text-xs text-muted-foreground">{formatDate(inquiry.created_at)}</p>
                </div>
                <div className="text-sm">
                  <span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-bold text-primary">{inquiry.status}</span>
                  {inquiry.seller_notification_status === 'failed' ? <p className="mt-2 text-destructive">Seller email not accepted; lead remains visible.</p> : null}
                </div>
                <form action={updateAdminInquiryStatus.bind(null, inquiry.id)} className="flex gap-2">
                  <select name="status" defaultValue={inquiry.status} className="rounded-lg border bg-background px-3 py-2 text-sm">
                    {['NEW', 'SELLER_NOTIFIED', 'CONTACTED', 'QUALIFIED', 'NEGOTIATING', 'WON', 'LOST', 'SPAM'].map((status) => <option value={status} key={status}>{status}</option>)}
                  </select>
                  <button className="rounded-lg bg-foreground px-3 py-2 text-sm font-semibold text-background">Save</button>
                </form>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border bg-card overflow-hidden">
        <div className="border-b p-6"><h2 className="text-xl font-semibold">New balloon opportunities</h2></div>
        {quotesError ? <p className="p-6 text-destructive">Quote pipeline unavailable: {quotesError.message}</p> : typedQuotes.length === 0 ? <p className="p-6 text-sm text-muted-foreground">No new-balloon requests yet.</p> : (
          <div className="divide-y">
            {typedQuotes.map((quote) => (
              <div key={quote.id} className="grid gap-4 p-6 lg:grid-cols-[1.3fr_1fr_auto] lg:items-center">
                <div><p className="font-semibold">{quote.name} · {quote.equipment_type}</p><a href={`mailto:${quote.email}`} className="text-sm text-primary hover:underline">{quote.email}</a><p className="mt-1 text-xs text-muted-foreground">{formatDate(quote.created_at)}</p></div>
                <span className="text-sm font-bold">{quote.status}</span>
                <form action={updateQuoteRequestStatus.bind(null, quote.id)} className="flex gap-2">
                  <select name="status" defaultValue={quote.status} className="rounded-lg border bg-background px-3 py-2 text-sm">
                    {['NEW', 'CONTACTED', 'SENT_TO_PARTNER', 'QUOTE_SENT', 'WON', 'LOST'].map((status) => <option value={status} key={status}>{status}</option>)}
                  </select>
                  <button className="rounded-lg bg-foreground px-3 py-2 text-sm font-semibold text-background">Save</button>
                </form>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function Metric({ title, value, detail, icon, warning = false }: { title: string; value: number; detail: string; icon: React.ReactNode; warning?: boolean }) {
  return <div className={`rounded-2xl border bg-card p-5 ${warning ? 'border-destructive/30' : ''}`}><div className="flex items-center justify-between"><p className="text-sm font-medium text-muted-foreground">{title}</p><span className={warning ? 'text-destructive' : 'text-primary'}>{icon}</span></div><p className="mt-3 text-3xl font-bold">{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div>
}
