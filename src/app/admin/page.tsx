import { createAdminClient } from '@/utils/supabase/server'
import { Users, Tag, AlertCircle, DollarSign, Mail } from 'lucide-react'

export const dynamic = 'force-dynamic'

type NewsletterRun = {
  id: string
  period_key: string
  status: string
  trigger_source: string
  dry_run: boolean
  recipients_count: number
  sent_count: number
  failed_count: number
  listings_count: number
  error_message: string | null
  completed_at: string | null
  created_at: string
}

const formatMadridDate = (value: string | null) => {
  if (!value) return 'Pending'

  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Europe/Madrid',
  }).format(new Date(value))
}

const statusClassName = (status: string) => {
  if (status === 'sent') return 'bg-emerald-500/10 text-emerald-700'
  if (status === 'failed') return 'bg-destructive/10 text-destructive'
  if (status === 'running') return 'bg-blue-500/10 text-blue-700'
  return 'bg-muted text-muted-foreground'
}

export default async function AdminPage() {
  const supabase = await createAdminClient()

  // Fetch KPI data
  const { count: usersCount } = await supabase.from('users').select('*', { count: 'exact', head: true })
  const { count: premiumCount } = await supabase.from('users').select('*', { count: 'exact', head: true }).eq('is_premium', true)
  const { count: stripePremiumCount } = await supabase.from('users').select('*', { count: 'exact', head: true }).eq('is_premium', true).eq('premium_source', 'stripe')
  const { count: activeListings } = await supabase.from('listings').select('*', { count: 'exact', head: true }).in('status', ['ACTIVE_PUBLIC', 'ACTIVE_PREMIUM'])
  const { count: pendingListings } = await supabase.from('listings').select('*', { count: 'exact', head: true }).in('status', ['DRAFT', 'PENDING_PAYMENT'])
  const { data: newsletterRuns, error: newsletterRunsError } = await supabase
    .from('newsletter_runs')
    .select('id, period_key, status, trigger_source, dry_run, recipients_count, sent_count, failed_count, listings_count, error_message, completed_at, created_at')
    .order('created_at', { ascending: false })
    .limit(5)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Admin Overview</h1>
        <p className="text-muted-foreground mt-1">Metrics and health for AeroTrade Marketplace.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Users */}
        <div className="bg-card border rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium text-muted-foreground">Total Users</h3>
            <div className="bg-primary/10 p-2 rounded-lg"><Users className="w-5 h-5 text-primary" /></div>
          </div>
          <p className="text-3xl font-bold">{usersCount || 0}</p>
        </div>

        {/* Premium Users */}
        <div className="bg-card border rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium text-muted-foreground">Premium Pilots</h3>
            <div className="bg-accent/10 p-2 rounded-lg"><DollarSign className="w-5 h-5 text-accent" /></div>
          </div>
          <p className="text-3xl font-bold text-accent">{premiumCount || 0}</p>
          <p className="text-xs text-muted-foreground mt-2">{stripePremiumCount || 0} Stripe-managed · {Math.max(0, (premiumCount || 0) - (stripePremiumCount || 0))} granted or legacy</p>
        </div>

        {/* Active Listings */}
        <div className="bg-card border rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium text-muted-foreground">Active Listings</h3>
            <div className="bg-secondary/20 p-2 rounded-lg"><Tag className="w-5 h-5 text-secondary-foreground" /></div>
          </div>
          <p className="text-3xl font-bold">{activeListings || 0}</p>
          <p className="text-xs text-muted-foreground mt-2">Public & Premium Windows</p>
        </div>

        {/* Draft/Pending Listings */}
        <div className="bg-card border border-destructive/20 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium text-muted-foreground">Drafts / Pending</h3>
            <div className="bg-destructive/10 p-2 rounded-lg"><AlertCircle className="w-5 h-5 text-destructive" /></div>
          </div>
          <p className="text-3xl font-bold text-destructive">{pendingListings || 0}</p>
          <p className="text-xs text-muted-foreground mt-2">Require payment or review</p>
        </div>
      </div>

      <div className="bg-card border rounded-2xl shadow-sm overflow-hidden">
        <div className="p-6 border-b flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-foreground">Newsletter Delivery</h2>
            <p className="text-sm text-muted-foreground mt-1">Latest cron runs and delivery counts.</p>
          </div>
          <div className="bg-primary/10 p-2 rounded-lg"><Mail className="w-5 h-5 text-primary" /></div>
        </div>

        {newsletterRunsError ? (
          <div className="p-6 text-sm text-destructive">
            Newsletter audit is not available: {newsletterRunsError.message}
          </div>
        ) : (
          <div className="divide-y">
            {((newsletterRuns || []) as NewsletterRun[]).length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground">No newsletter runs recorded yet.</div>
            ) : (
              ((newsletterRuns || []) as NewsletterRun[]).map((run) => (
                <div key={run.id} className="p-6 grid gap-4 lg:grid-cols-[1.2fr_1fr_1.4fr] items-start">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-semibold px-2 py-1 rounded-full ${statusClassName(run.status)}`}>
                        {run.status}
                      </span>
                      {run.dry_run ? <span className="text-xs text-muted-foreground">dry run</span> : null}
                    </div>
                    <p className="font-medium mt-3">Period {run.period_key}</p>
                    <p className="text-sm text-muted-foreground">{formatMadridDate(run.completed_at || run.created_at)}</p>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    <p><span className="text-foreground font-medium">{run.sent_count}</span> sent / <span className="text-foreground font-medium">{run.recipients_count}</span> recipients</p>
                    <p><span className="text-foreground font-medium">{run.failed_count}</span> failed</p>
                    <p><span className="text-foreground font-medium">{run.listings_count}</span> listings</p>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    <p>Source: <span className="text-foreground">{run.trigger_source}</span></p>
                    {run.error_message ? <p className="mt-1 text-destructive">{run.error_message}</p> : null}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}
