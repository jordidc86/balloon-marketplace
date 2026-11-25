/** @template {{url: string, is_primary?: boolean | null, created_at?: string | null}} T
 * @param {Array<T> | null | undefined} images
 * @returns {Array<T>}
 */
export function orderListingImages(images) {
  const timestamp = image => Date.parse(image.created_at || '') || 0
  return [...(images || [])].sort((a, b) =>
    Number(Boolean(b.is_primary)) - Number(Boolean(a.is_primary))
    || timestamp(a) - timestamp(b)
    || a.url.localeCompare(b.url, 'en', { numeric: true }),
  )
}
