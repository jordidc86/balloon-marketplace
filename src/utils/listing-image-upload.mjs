import { parseListingImageUrls } from './listing-safety.mjs'

/**
 * Upload cleanup belongs exclusively to the upload phase. Once saveListing is
 * called, the server may have committed the image references even if navigation
 * interrupts the promise or the network response is lost.
 * @template T
 * @param {{
 *   files: Array<T>, existingUrls: Array<string>,
 *   uploadImage: (file: T, index: number) => Promise<{path: string, url: string}>,
 *   removeUploadedImages: (paths: Array<string>) => Promise<void>,
 *   saveListing: (urls: Array<string>) => Promise<unknown>,
 *   onProgress?: (percent: number) => void,
 *   onCleanupError?: (error: unknown) => void,
 * }} options
 */
export async function submitListingImages({ files, existingUrls, uploadImage, removeUploadedImages, saveListing, onProgress, onCleanupError }) {
  const uploaded = []
  try {
    for (let index = 0; index < files.length; index++) {
      const image = await uploadImage(files[index], index)
      uploaded.push(image)
      onProgress?.(Math.round(((index + 1) / files.length) * 100))
    }
  } catch (error) {
    if (uploaded.length) {
      try { await removeUploadedImages(uploaded.map(image => image.path)) }
      catch (cleanupError) { onCleanupError?.(cleanupError) }
    }
    throw error
  }

  const urls = parseListingImageUrls(JSON.stringify([...existingUrls, ...uploaded.map(image => image.url)]))
  // Deliberately outside the rollback scope: redirects are successful control
  // flow, and any other post-handoff failure has an uncertain persistence result.
  return saveListing(urls)
}
