import sharp from 'sharp'
import path from 'node:path'

const escapeMarkup = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[char]))
const cleanText = (value, max = 180) => String(value ?? '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
// Lambda and sandbox environments may have no system Fontconfig configuration.
process.env.FONTCONFIG_FILE ||= path.join(process.cwd(), 'src/app/fonts/fonts.conf')
const fontfile = path.join(process.cwd(), 'src/app/fonts/Geist-Regular.ttf')

// All remote input is decoded as a bounded raster; never render supplied SVG.
export async function renderSocialCardJpeg(imageBuffer, listing, format) {
  if (!['post', 'story'].includes(format)) throw new Error('Invalid social format')
  if (!Buffer.isBuffer(imageBuffer) || imageBuffer.length > 12 * 1024 * 1024) throw new Error('Social image exceeds byte limit')
  const rasterSignature = imageBuffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))
    || imageBuffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    || (imageBuffer.toString('ascii', 0, 4) === 'RIFF' && imageBuffer.toString('ascii', 8, 12) === 'WEBP')
  if (!rasterSignature) throw new Error('Social source must be a single JPEG, PNG or WebP image')
  const image = sharp(imageBuffer, { limitInputPixels: 20_000_000, animated: false })
  const metadata = await image.metadata()
  if (!['jpeg', 'png', 'webp'].includes(metadata.format) || (metadata.pages || 1) !== 1) throw new Error('Social source must be a single JPEG, PNG or WebP image')
  const width = 1080
  const height = format === 'story' ? 1920 : 1080
  const panelTop = format === 'story' ? 1210 : 470
  const panelHeight = format === 'story' ? 570 : 520
  const background = await image.rotate().resize(width, height, { fit: 'cover' }).toBuffer()
  const layers = [{ input: Buffer.from(`<svg width="${width}" height="${height}"><rect width="100%" height="100%" fill="#0f172a" fill-opacity="0.33"/><rect x="116" y="116" width="360" height="108" fill="white" fill-opacity="0.94"/><rect x="144" y="141" width="58" height="58" fill="#020617"/><rect x="116" y="${panelTop}" width="850" height="${panelHeight}" fill="#0f172a" fill-opacity="0.67"/><rect x="166" y="${panelTop + 48}" width="210" height="58" fill="white"/></svg>`) }]
  const text = async (value, left, top, size, colour = '#ffffff', maxWidth = 760, maxHeight = size * 2 + 10) => {
    const { data, info } = await sharp({ text: {
      text: `<span foreground="${colour}">${escapeMarkup(cleanText(value))}</span>`,
      font: `Geist ${size}`, fontfile, width: maxWidth, height: maxHeight,
      rgba: true, wrap: 'word-char',
    } }).png().toBuffer({ resolveWithObject: true })
    layers.push({ input: data, left, top })
    return info.height
  }
  await text('A', 161, 153, 32, '#ffffff', 32, 36)
  await text('AEROTRADE', 222, 139, 32, '#020617', 240, 36)
  await text('Marketplace', 222, 179, 28, '#020617', 240, 32)
  await text('FOR SALE', 198, panelTop + 60, 30, '#020617', 160, 36)
  const titleHeight = await text(listing.title, 166, panelTop + 138, 64, '#ffffff', 750, 140)
  const price = Number(listing.price) <= 0 ? 'Price on request' : `${Number(listing.price).toLocaleString('de-DE')} ${cleanText(listing.currency, 8)}`
  const priceY = panelTop + 138 + titleHeight + 26
  await text(price, 166, priceY, 58, '#ffffff', 750, 68)
  let factY = priceY + 90
  if (listing.details?.hours) { await text(`Hours: ${cleanText(listing.details.hours, 30)}`, 166, factY, 32, '#ffffff', 750, 38); factY += 48 }
  await text(`Condition: ${cleanText(listing.condition || 'Used', 60)}`, 166, factY, 32, '#ffffff', 750, 38)
  await text('aerotrade.app', format === 'story' ? 610 : 710, format === 'story' ? 1810 : 1000, 32, '#ffffff', 300, 38)
  return sharp(background).composite(layers).jpeg({ quality: 90 }).toBuffer()
}
