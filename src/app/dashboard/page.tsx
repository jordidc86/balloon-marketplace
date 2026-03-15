import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Plus, CheckCircle, Clock } from 'lucide-react'

export default async function DashboardPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Get user profile for premium status
  const { data: profile } = await supabase
    .from('users')
    .select('is_premium')
    .eq('id', user.id)
    .single()

  // Get user listings
  const { data: listings } = await supabase
    .from('listings')
    .select('*, images(url)')
    .eq('seller_id', user.id)
    .order('created_at', { ascending: false })

  const isPremium = profile?.is_premium || false

  return (
    <div className="min-h-screen bg-secondary/30 py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Header / Welcome */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Pilot Dashboard</h1>
            <p className="text-muted-foreground mt-1">Logged in as {user.email}</p>
          </div>
          <Link href="/sell" className="inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 px-5 py-2.5 rounded-xl font-medium shadow-sm transition-all hover:translate-y-[-1px]">
            <Plus className="h-5 w-5" />
            List Equipment
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Account Status Card */}
          <div className="bg-background p-6 rounded-2xl border shadow-sm h-fit">
            <h2 className="text-lg font-semibold mb-4">Account Status</h2>
            <div className={`p-4 rounded-xl border ${isPremium ? 'bg-accent/10 border-accent/20 text-accent-foreground' : 'bg-muted border-border text-muted-foreground'}`}>
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isPremium ? 'bg-accent text-white' : 'bg-secondary text-secondary-foreground'}`}>
                  {isPremium ? <CheckCircle className="h-5 w-5" /> : <Clock className="h-5 w-5" /> }
                </div>
                <div>
                  <p className="font-bold">{isPremium ? 'Premium Pilot' : 'Standard Member'}</p>
                  <p className="text-xs opacity-80">{isPremium ? '48h early access active' : '48h delay on new listings'}</p>
                </div>
              </div>
              {!isPremium && (
                <Link href="/pricing" className="block mt-4 text-center bg-primary text-primary-foreground text-sm font-medium py-2 rounded-lg hover:bg-primary/90 transition-colors">
                  Upgrade to Premium
                </Link>
              )}
            </div>
          </div>

          {/* Listings List */}
          <div className="lg:col-span-2">
            <div className="bg-background p-6 rounded-2xl border shadow-sm">
              <h2 className="text-lg font-semibold mb-6">Your Listings</h2>
              
              {!listings || listings.length === 0 ? (
                <div className="text-center py-12 border-2 border-dashed rounded-xl">
                  <p className="text-muted-foreground">You haven't posted any equipment yet.</p>
                  <Link href="/sell" className="text-primary font-medium text-sm inline-block mt-2 hover:underline">
                    Create your first listing
                  </Link>
                </div>
              ) : (
                <div className="space-y-4">
                  {listings.map((item) => {
                    const primaryImage = item.images?.[0]?.url || 'https://images.unsplash.com/photo-1506521781263-d8422e8dbf27?q=80&w=600'
                    return (
                      <div key={item.id} className="flex items-center gap-4 p-4 border rounded-xl hover:bg-secondary/20 transition-colors">
                        <div className="w-16 h-16 rounded-lg overflow-hidden relative border bg-muted shrink-0">
                          <img src={primaryImage} alt={item.title} className="object-cover w-full h-full" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-medium text-sm text-foreground truncate">{item.title}</h3>
                          <p className="text-xs text-muted-foreground">{item.currency} {Number(item.price).toLocaleString()}</p>
                          <div className="mt-1">
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${
                              item.status === 'ACTIVE_PREMIUM' || item.status === 'ACTIVE_PUBLIC' 
                                ? 'bg-green-50 text-green-700 border-green-200' 
                                : 'bg-yellow-50 text-yellow-700 border-yellow-200'
                            }`}>
                              {item.status.replace('_', ' ')}
                            </span>
                          </div>
                        </div>
                        <Link href={`/catalog/${item.id}`} className="text-sm font-medium text-primary hover:underline">
                          View
                        </Link>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
