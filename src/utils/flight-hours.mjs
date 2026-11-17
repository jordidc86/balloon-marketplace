/** Format decimal flight hours to the nearest minute, including legacy H:MM input. */
export function formatFlightHours(value) {
  if (value === null || value === undefined || value === '') return null
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const raw = String(value).trim()
  if (!raw) return null
  const clock = /^(\d+):([0-5]\d)$/.exec(raw)
  let totalMinutes
  if (clock) {
    totalMinutes = Number(clock[1]) * 60 + Number(clock[2])
  } else {
    if (!/^\d+(?:[.,]\d+)?$/.test(raw)) return null
    const hours = Number(raw.replace(',', '.'))
    if (!Number.isFinite(hours) || hours > 100_000) return null
    totalMinutes = Math.round(hours * 60)
  }
  if (totalMinutes > 6_000_000) return null
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return minutes ? `${hours} h ${minutes} min` : `${hours} h`
}
