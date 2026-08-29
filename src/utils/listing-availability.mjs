export const listingAvailabilityFreshDays = 90

export function getListingAvailabilityState(confirmedAt, now = new Date()) {
  if (!confirmedAt) return { status: 'never', ageDays: null, publiclyFresh: false }

  const confirmedMs = new Date(confirmedAt).getTime()
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime()
  if (!Number.isFinite(confirmedMs) || !Number.isFinite(nowMs) || confirmedMs > nowMs + 60_000) {
    return { status: 'invalid', ageDays: null, publiclyFresh: false }
  }

  const ageDays = Math.floor((nowMs - confirmedMs) / 86_400_000)
  if (ageDays <= listingAvailabilityFreshDays) {
    return { status: 'fresh', ageDays, publiclyFresh: true }
  }

  return { status: 'stale', ageDays, publiclyFresh: false }
}

