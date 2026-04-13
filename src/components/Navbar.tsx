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
  if (user) {
    const { data: profile } = await supabase
      .from('users')
      .select('is_premium')
      .eq('id', user.id)
      .single()
    isPremium = profile?.is_premium || false
  }

  return (
    <nav className="border-b sticky top-0 z-50 bg-background/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex-shrink-0 flex items-center gap-2">
            <Plane className="h-6 w-6 text-primary" />
            <Link href="/" className="font-bold text-xl tracking-tight">
              AeroTrade
            </Link>
          </div>
          
          <div className="hidden md:flex items-center space-x-6">
            <Link href="/catalog?category=complete" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Complete Balloons</Link>
            <Link href="/catalog?category=envelopes" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Envelopes</Link>
            <Link href="/catalog?category=baskets" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Baskets</Link>
            <Link href="/catalog?category=burners" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Burners</Link>
          </div>

          <div className="flex items-center space-x-4">
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
                <div className="flex items-center gap-4 border-l pl-4 ml-2">
                  <Link href="/dashboard" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Dashboard</Link>
                  <form action={signout}>
                    <button className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                      Log out
                    </button>
                  </form>
                </div>
              </>
            ) : (
              <div className="flex items-center space-x-4 border-l pl-4 ml-2">
                <Link href="/pricing" className="text-sm font-medium hover:text-primary transition-colors">
                  Premium
                </Link>
                <Link href="/login" className="text-sm font-medium bg-secondary text-secondary-foreground hover:bg-secondary/80 px-4 py-2 rounded-lg transition-colors">
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
