import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const maxImageBytes = 10 * 1024 * 1024

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
