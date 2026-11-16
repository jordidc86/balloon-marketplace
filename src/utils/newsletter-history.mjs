/** Read delivery history without filtering a UUID column by a synthetic dry-run id. */
export function newsletterHistoryQuery(supabase, activeRun) {
  let query = supabase
    .from('newsletter_runs')
    .select('listing_ids')
    .eq('dry_run', false)
    .is('test_email', null)
    .in('status', ['sent', 'partial'])

  // Simulations have no database row to exclude. Persisted live/test runs do.
  if (activeRun.persisted) query = query.neq('id', activeRun.id)

  return query.order('created_at', { ascending: false }).limit(100)
}
