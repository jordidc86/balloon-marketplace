import { createAdminClient } from '@/utils/supabase/server'
import { removeNewsletterConsentInvitationExclusion, sendPremiumPaymentLink, setNewsletterConsentInvitationExclusion, togglePremiumStatus } from '../actions'
import { formatDistanceToNow } from 'date-fns'
import { Mail, Star, Shield, ShieldOff } from 'lucide-react'
import { normalizeNewsletterEmail } from '@/utils/newsletter-consent.mjs'
import { newsletterConsentInvitationBatchKey } from '@/utils/newsletter-consent-invitation.mjs'
import NewsletterConsentBatchForm from './NewsletterConsentBatchForm'

export const dynamic = 'force-dynamic'

export default async function AdminUsersPage() {
  const supabase = await createAdminClient()

  const [{ data: users, error }, { data: exclusions, error: exclusionsError }, { data: invitationReceipts, error: invitationReceiptsError }] = await Promise.all([
    supabase.from('users').select('*').order('created_at', { ascending: false }),
    supabase.from('newsletter_consent_invitation_exclusions').select('user_id,reason,excluded_at'),
    supabase.from('commercial_notification_receipts').select('entity_id,status,accepted_at').eq('notification_type', 'newsletter_consent_invitation').eq('entity_type', 'user'),
  ])

  if (error || exclusionsError || invitationReceiptsError) {
    return <div className="p-4 bg-destructive/10 text-destructive rounded-xl">Error loading users.</div>
  }

  const exclusionByUser = new Map((exclusions || []).map((exclusion) => [exclusion.user_id, exclusion]))
  const acceptedInvitationByUser = new Map((invitationReceipts || [])
    .filter((receipt) => receipt.status === 'accepted')
    .map((receipt) => [receipt.entity_id, receipt]))
  const exactConsentRecipients = (users || []).filter((user) => Boolean(
    user.role !== 'admin'
    && user.newsletter_consent_status === 'NOT_REQUESTED'
    && !user.newsletter_consented_at
    && !user.newsletter_unsubscribed_at
    && normalizeNewsletterEmail(user.email)
    && !exclusionByUser.has(user.id)
    && !acceptedInvitationByUser.has(user.id),
  )).map((user) => ({ id: user.id, email: user.email }))
  const exactConsentBatchKey = newsletterConsentInvitationBatchKey(exactConsentRecipients.map((user) => user.id))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Manage Users</h1>
        <p className="text-muted-foreground mt-1">Manage account access, Premium and exact consent outreach. Registration alone never authorizes marketing.</p>
      </div>

      {exactConsentBatchKey ? <NewsletterConsentBatchForm batchKey={exactConsentBatchKey} recipients={exactConsentRecipients} /> : (
        <div className="rounded-2xl border bg-card p-5 text-sm text-muted-foreground">No account currently needs a one-time newsletter preference invitation.</div>
      )}

      <div className="bg-card border rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="px-6 py-4 font-semibold uppercase tracking-wider text-xs">Name</th>
                <th className="px-6 py-4 font-semibold uppercase tracking-wider text-xs">Email</th>
                <th className="px-6 py-4 font-semibold">Joined</th>
                <th className="px-6 py-4 font-semibold">Role</th>
                <th className="px-6 py-4 font-semibold">Premium Status</th>
                <th className="px-6 py-4 font-semibold">Newsletter outreach</th>
                <th className="px-6 py-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {users?.map((u) => (
                <tr key={u.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-6 py-4">
                    <div className="font-semibold text-foreground">{u.name || '—'}</div>
                    <div className="text-xs text-muted-foreground">{u.phone || 'No phone'}</div>
                  </td>
                  <td className="px-6 py-4 text-muted-foreground">{u.email}</td>
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
                      <div className="space-y-1">
                        <span className="flex items-center gap-1.5 text-accent font-semibold"><Star className="w-4 h-4" /> Active</span>
                        <span className="block text-xs text-muted-foreground">
                          {u.premium_source === 'stripe' ? 'Stripe paid' : u.premium_source === 'admin' ? 'Admin grant' : 'Legacy/manual'}
                        </span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">Basic</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    {u.role === 'admin' ? <span className="text-muted-foreground">Admin excluded</span> : exclusionByUser.has(u.id) ? (
                      <div className="space-y-2">
                        <span className="block text-xs font-semibold text-amber-800">Excluded · {exclusionByUser.get(u.id)?.reason.replaceAll('_', ' ')}</span>
                        <form action={removeNewsletterConsentInvitationExclusion.bind(null, u.id)}>
                          <button className="text-xs font-semibold underline">Restore eligibility</button>
                        </form>
                      </div>
                    ) : acceptedInvitationByUser.has(u.id) ? (
                      <span className="text-xs font-semibold text-emerald-700">Invitation accepted by provider</span>
                    ) : u.newsletter_consent_status === 'ACTIVE' ? (
                      <span className="text-xs font-semibold text-emerald-700">Consented</span>
                    ) : u.newsletter_consent_status === 'UNSUBSCRIBED' ? (
                      <span className="text-xs font-semibold text-muted-foreground">Unsubscribed</span>
                    ) : (
                      <form action={setNewsletterConsentInvitationExclusion.bind(null, u.id)} className="flex items-center gap-2">
                        <select name="reason" required defaultValue="" className="rounded-md border bg-background px-2 py-1 text-xs">
                          <option value="" disabled>Exclude reason</option>
                          <option value="NON_CUSTOMER">Not a customer</option>
                          <option value="TEST_ACCOUNT">Test account</option>
                          <option value="OPERATOR_EXCLUDED">Operator excluded</option>
                        </select>
                        <button className="text-xs font-semibold underline">Exclude</button>
                      </form>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex flex-wrap justify-end gap-2">
                      {!u.is_premium && (
                        <form action={async () => {
                          'use server'
                          await sendPremiumPaymentLink(u.id)
                        }}>
                          <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-accent/10 text-accent hover:bg-accent/20 transition-colors">
                            <Mail className="w-3.5 h-3.5" />
                            Email Stripe Link
                          </button>
                        </form>
                      )}
                      {u.premium_source !== 'stripe' && (
                        <form action={async () => {
                          'use server'
                          await togglePremiumStatus(u.id)
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
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {users?.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-muted-foreground">No users found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
