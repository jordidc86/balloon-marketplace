import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { LayoutDashboard, Users, Grid } from 'lucide-react'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()

  // Authenticate & Authorize
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') {
    redirect('/dashboard') // If they are a normal user, kick them to their own dashboard
  }

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-muted/40">
      
      {/* Sidebar Navigation */}
      <aside className="w-full md:w-64 bg-card border-r flex flex-col p-6 shrink-0 z-10 md:sticky md:top-16 md:h-[calc(100vh-64px)] overflow-y-auto">
        <div className="mb-8">
          <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Admin Controls</h2>
        </div>
        <nav className="flex-1 space-y-2">
          <Link href="/admin" className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-foreground hover:bg-muted transition-colors">
            <LayoutDashboard className="w-4 h-4 text-primary" /> Overview
          </Link>
          <Link href="/admin/users" className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-foreground hover:bg-muted transition-colors">
            <Users className="w-4 h-4 text-primary" /> Manage Users
          </Link>
          <Link href="/admin/listings" className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-foreground hover:bg-muted transition-colors">
            <Grid className="w-4 h-4 text-primary" /> Review Listings
          </Link>
        </nav>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 p-6 md:p-8 overflow-x-hidden">
        {children}
      </div>
      
    </div>
  )
}
