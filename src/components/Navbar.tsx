import Link from 'next/link'
import { createClient } from '@/utils/supabase/server'
import { signout } from '@/app/login/actions'
import { Plane, Plus } from 'lucide-react'

export default async function Navbar() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let isPremium = false
  let isAdmin = false
  if (user) {
    const { data: profile } = await supabase
      .from('users')
      .select('is_premium, role')
      .eq('id', user.id)
      .single()
    isPremium = profile?.is_premium || false
    isAdmin = profile?.role === 'admin'
  }

  return (
    <nav className="border-b sticky top-0 z-50 bg-background/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex-shrink-0 flex items-center gap-2">
            <Plane className="h-6 w-6 text-primary" />
            <Link href="/" className="font-bold text-xl tracking-tight">
              AeroTrade
            </Link>
          </div>
          
          <div className="hidden lg:flex items-center space-x-6">
            <Link href="/catalog" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Marketplace</Link>
            <Link href="/sell" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Sell Equipment</Link>
            <Link href="/pricing" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Premium</Link>
            <Link href="/new-balloon" className="text-sm font-semibold text-primary hover:text-primary/80 transition-colors">New Balloon Quote</Link>
          </div>

          <div className="flex items-center space-x-2 sm:space-x-4">
            {user ? (
              <>
                {isPremium && (
                  <span className="hidden sm:inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-accent/20 text-accent-foreground border border-accent/30">
                    PREMIUM
                  </span>
                )}
                <Link href="/sell" className="hidden sm:inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/80 transition-colors">
                  <Plus className="h-4 w-4" />
                  List Item
                </Link>
                <Link href="/new-balloon" className="inline-flex items-center whitespace-nowrap bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors">
                  New Quote
                </Link>
                <div className="flex items-center gap-4 border-l pl-4 ml-2">
                  {isAdmin && <Link href="/admin" className="text-sm font-bold text-primary hover:text-primary/80 transition-colors">Admin</Link>}
                  <Link href="/dashboard" className="hidden sm:inline text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Dashboard</Link>
                  <form action={signout}>
                    <button className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                      <span className="hidden sm:inline">Log out</span>
                      <span className="sm:hidden">Out</span>
                    </button>
                  </form>
                </div>
              </>
            ) : (
              <div className="flex items-center space-x-2 sm:space-x-4 border-l pl-2 sm:pl-4 ml-1 sm:ml-2">
                <Link href="/pricing" className="hidden sm:inline text-sm font-medium hover:text-primary transition-colors">
                  Premium
                </Link>
                <Link href="/new-balloon" className="inline-flex items-center whitespace-nowrap bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors">
                  New Quote
                </Link>
                <Link href="/login" className="text-sm font-medium bg-secondary text-secondary-foreground hover:bg-secondary/80 px-2 sm:px-4 py-2 rounded-lg transition-colors">
                  Log In
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  )
}
