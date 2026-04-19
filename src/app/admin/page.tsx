import { createAdminClient } from '@/utils/supabase/server'
import { Users, Tag, AlertCircle, DollarSign } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  const supabase = await createAdminClient()

  // Fetch KPI data
  const { count: usersCount } = await supabase.from('users').select('*', { count: 'exact', head: true })
  const { count: premiumCount } = await supabase.from('users').select('*', { count: 'exact', head: true }).eq('is_premium', true)
  const { count: activeListings } = await supabase.from('listings').select('*', { count: 'exact', head: true }).in('status', ['ACTIVE_PUBLIC', 'ACTIVE_PREMIUM'])
  const { count: pendingListings } = await supabase.from('listings').select('*', { count: 'exact', head: true }).eq('status', 'DRAFT')

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
          <p className="text-xs text-muted-foreground mt-2">Paying actively</p>
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
      
    </div>
  )
}
