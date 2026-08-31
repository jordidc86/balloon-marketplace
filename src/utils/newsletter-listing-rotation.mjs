export function selectNewsletterListings({
  listings,
  priorRuns,
  days,
  mixWithLatest,
  now = new Date(),
  limit = 10,
}) {
  const safeLimit = Number.isSafeInteger(limit) && limit > 0 ? Math.min(limit, 50) : 10
  const inclusionCounts = new Map()
  for (const run of Array.isArray(priorRuns) ? priorRuns : []) {
    const uniqueIds = new Set(Array.isArray(run?.listing_ids) ? run.listing_ids : [])
    for (const listingId of uniqueIds) {
      if (typeof listingId === 'string' && listingId) {
        inclusionCounts.set(listingId, (inclusionCounts.get(listingId) || 0) + 1)
      }
    }
  }

  const nowDate = now instanceof Date ? now : new Date(now)
  if (Number.isNaN(nowDate.getTime())) throw new Error('Newsletter rotation requires a valid time.')
  const safeDays = Number(days)
  const since = Number.isFinite(safeDays) && safeDays > 0
    ? new Date(nowDate.getTime() - safeDays * 86_400_000).toISOString()
    : null

  const eligible = (Array.isArray(listings) ? listings : [])
    .filter((listing) => {
      if (!listing || typeof listing.id !== 'string' || !listing.id) return false
      if (typeof listing.created_at !== 'string' || Number.isNaN(new Date(listing.created_at).getTime())) return false
      return !since
        || listing.created_at >= since
        || (inclusionCounts.get(listing.id) || 0) === 0
        || Boolean(mixWithLatest)
    })
    .sort((left, right) => {
      const countDifference = (inclusionCounts.get(left.id) || 0) - (inclusionCounts.get(right.id) || 0)
      return countDifference || right.created_at.localeCompare(left.created_at)
    })

  const selected = eligible.slice(0, safeLimit)
  return {
    selected,
    recentCount: selected.filter((listing) => !since || listing.created_at >= since).length,
    neverIncludedCount: selected.filter((listing) => (inclusionCounts.get(listing.id) || 0) === 0).length,
    inclusionCounts,
  }
}

