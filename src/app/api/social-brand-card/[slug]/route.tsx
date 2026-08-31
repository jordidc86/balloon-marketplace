import { ImageResponse } from 'next/og'
import { getBrandSocialSourceImagePath } from '@/utils/social-brand-content'

export const runtime = 'edge'
export const dynamic = 'force-dynamic'

const formats = new Set(['post', 'story', 'carousel'])

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const requestUrl = new URL(request.url)
  const rawFormat = requestUrl.searchParams.get('format') || 'post'
  const format = formats.has(rawFormat) ? rawFormat as 'post' | 'story' | 'carousel' : 'post'
  const slide = Number(requestUrl.searchParams.get('slide') || '1')

  let sourcePath: string
  try {
    sourcePath = getBrandSocialSourceImagePath({ slug, format, slide })
  } catch {
    return new Response('Social asset not found', { status: 404 })
  }

  const story = format === 'story'
  const size = { width: 1080, height: story ? 1920 : 1350 }
  const sourceUrl = new URL(sourcePath, requestUrl.origin).toString()

  return new ImageResponse(
    (
      <div
        style={{
          position: 'relative',
          display: 'flex',
          width: `${size.width}px`,
          height: `${size.height}px`,
          overflow: 'hidden',
          background: '#fffaf3',
          fontFamily: 'Arial, sans-serif',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={sourceUrl} alt="" width={size.width} height={size.height} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
        <div
          style={{
            position: 'absolute',
            left: story ? '94px' : '88px',
            right: story ? '94px' : '88px',
            bottom: story ? '96px' : '62px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '28px',
            padding: story ? '28px 38px' : '23px 34px',
            borderRadius: '22px',
            background: 'rgba(2, 6, 23, 0.96)',
            color: '#ffffff',
            boxShadow: '0 16px 48px rgba(2,6,23,0.28)',
          }}
        >
          <span style={{ display: 'flex', fontSize: story ? '27px' : '24px', fontWeight: 700 }}>Browse current balloon equipment</span>
          <span style={{ display: 'flex', fontSize: story ? '36px' : '32px', fontWeight: 900, color: '#ff7a16' }}>aerotrade.app</span>
        </div>
      </div>
    ),
    {
      ...size,
      headers: {
        'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
      },
    },
  )
}
