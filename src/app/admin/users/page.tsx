import { createAdminClient } from '@/utils/supabase/server'
import { togglePremiumStatus } from '../actions'
import { formatDistanceToNow } from 'date-fns'
import { Star, Shield, ShieldOff } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function AdminUsersPage() {
  const supabase = await createAdminClient()

  const { data: users, error } = await supabase
    .from('users')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    return <div className="p-4 bg-destructive/10 text-destructive rounded-xl">Error loading users.</div>
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Manage Users</h1>
        <p className="text-muted-foreground mt-1">View all registered pilots and manage their premium status.</p>
      </div>

      <div className="bg-card border rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="px-6 py-4 font-semibold">Email</th>
                <th className="px-6 py-4 font-semibold">Joined</th>
                <th className="px-6 py-4 font-semibold">Role</th>
                <th className="px-6 py-4 font-semibold">Premium Status</th>
                <th className="px-6 py-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {users?.map((u) => (
                <tr key={u.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-6 py-4 font-medium">{u.email}</td>
                  <td className="px-6 py-4 text-muted-foreground">
                    {formatDistanceToNow(new Date(u.created_at), { addSuffix: true })}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-md text-xs font-bold uppercase tracking-wider ${u.role === 'admin' ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'}`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {u.is_premium ? (
                      <span className="flex items-center gap-1.5 text-accent font-semibold"><Star className="w-4 h-4" /> Active</span>
                    ) : (
                      <span className="text-muted-foreground">Basic</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <form action={async () => {
                      'use server'
                      await togglePremiumStatus(u.id, u.is_premium)
                    }}>
                      <button 
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                          u.is_premium 
                            ? 'bg-destructive/10 text-destructive hover:bg-destructive/20' 
                            : 'bg-primary text-primary-foreground hover:bg-primary/90'
                        }`}
                      >
                        {u.is_premium ? <ShieldOff className="w-3.5 h-3.5" /> : <Shield className="w-3.5 h-3.5" />}
                        {u.is_premium ? 'Revoke Premium' : 'Grant Premium'}
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
              {users?.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-muted-foreground">No users found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
