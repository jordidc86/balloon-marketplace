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

  // Public availability, not draft creation or paid plan, defines recency.
  const publishedAt = (listing) => Date.parse(listing.public_at)
  const recentSince = since ? Date.parse(since) : nowDate.getTime() - 15 * 86_400_000
  const eligible = (Array.isArray(listings) ? listings : [])
    .filter((listing) => {
      if (!listing || typeof listing.id !== 'string' || !listing.id) return false
      if (listing.status !== 'ACTIVE_PUBLIC') return false
      if (typeof listing.public_at !== 'string' || !Number.isFinite(publishedAt(listing)) || publishedAt(listing) > nowDate.getTime()) return false
      return !since
        || publishedAt(listing) >= Date.parse(since)
        || (inclusionCounts.get(listing.id) || 0) === 0
        || Boolean(mixWithLatest)
    })
    .sort((left, right) => {
      return publishedAt(right) - publishedAt(left) || left.id.localeCompare(right.id)
    })

  const selected = eligible.slice(0, safeLimit)
  return {
    selected,
    recentCount: selected.filter((listing) => publishedAt(listing) >= recentSince).length,
    neverIncludedCount: selected.filter((listing) => (inclusionCounts.get(listing.id) || 0) === 0).length,
    inclusionCounts,
  }
}

export function getNewsletterCopy(recentCount) {
  return recentCount > 0
    ? {
      subject: 'New arrivals on AeroTrade - Bi-Weekly Update',
      introduction: 'Explore new arrivals and other available balloons and equipment, with the most recently published listings first.',
    }
    : {
      subject: 'Available balloons and equipment on AeroTrade - Bi-Weekly Update',
      introduction: 'Browse balloons and equipment currently available on AeroTrade, with the most recently published listings first.',
    }
}
