import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const maxImageBytes = 10 * 1024 * 1024
const defaultAllowedHosts = [
  'images.unsplash.com',
  process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname : '',
].filter(Boolean)

const privateHostPatterns = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^\[?::1\]?$/i,
]

const allowedHosts = new Set(
  (process.env.IMAGE_PROXY_ALLOWED_HOSTS || defaultAllowedHosts.join(','))
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean)
)

const isAllowedImageHost = (hostname: string) => {
  const normalizedHost = hostname.toLowerCase()

  if (privateHostPatterns.some((pattern) => pattern.test(normalizedHost))) {
    return false
  }

  return allowedHosts.has(normalizedHost)
}

export async function GET(request: NextRequest) {
  const imageUrl = request.nextUrl.searchParams.get('url')

  if (!imageUrl) {
    return new NextResponse('Missing image URL', { status: 400 })
  }

  let parsedUrl: URL

  try {
    parsedUrl = new URL(imageUrl)
  } catch {
    return new NextResponse('Invalid image URL', { status: 400 })
  }

  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    return new NextResponse('Unsupported image URL', { status: 400 })
  }

  if (!isAllowedImageHost(parsedUrl.hostname)) {
    return new NextResponse('Image host is not allowed', { status: 403 })
  }

  const imageResponse = await fetch(parsedUrl, {
    cache: 'no-store',
    headers: {
      Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
    },
  })

  if (!imageResponse.ok) {
    return new NextResponse('Unable to fetch image', { status: imageResponse.status })
  }

  const contentType = imageResponse.headers.get('content-type') || ''
  const contentLength = Number(imageResponse.headers.get('content-length') || 0)

  if (!contentType.startsWith('image/')) {
    return new NextResponse('URL is not an image', { status: 415 })
  }

  if (contentLength > maxImageBytes) {
    return new NextResponse('Image is too large', { status: 413 })
  }

  const imageBuffer = await imageResponse.arrayBuffer()

  if (imageBuffer.byteLength > maxImageBytes) {
    return new NextResponse('Image is too large', { status: 413 })
  }

  return new NextResponse(imageBuffer, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      Pragma: 'no-cache',
      Expires: '0',
    },
  })
}
