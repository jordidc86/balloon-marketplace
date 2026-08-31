import { ImageResponse } from 'next/og'
import { createClient } from '@supabase/supabase-js'
import {
  fetchListingForSocialCard,
  formatSocialCardPrice,
  getPrimaryImageUrl,
  getSocialCardFacts,
  socialCardSize,
  socialStorySize,
} from '@/utils/social-card'

export const runtime = 'edge'
export const dynamic = 'force-dynamic'

const fallbackImageUrl = 'https://images.unsplash.com/photo-1543326727-cf6c39e8f84c?q=80&w=1600&auto=format&fit=crop'

const trimTitle = (title: string) => (
  title.replace(/\s+/g, ' ').trim().length > 46
    ? `${title.replace(/\s+/g, ' ').trim().slice(0, 43).trim()}...`
    : title.replace(/\s+/g, ' ').trim()
)

const getOptimizedCardImageUrl = (imageUrl: string, width: number, height: number) => {
  try {
    const parsedUrl = new URL(imageUrl)

    if (parsedUrl.pathname.includes('/storage/v1/object/public/')) {
      parsedUrl.pathname = parsedUrl.pathname.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/')
      parsedUrl.searchParams.set('width', String(width))
      parsedUrl.searchParams.set('height', String(height))
      parsedUrl.searchParams.set('resize', 'cover')
      parsedUrl.searchParams.set('quality', '82')
      return parsedUrl.toString()
    }
  } catch {
    return imageUrl
  }

  return imageUrl
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const requestUrl = new URL(request.url)
  const format = requestUrl.searchParams.get('format') === 'story' ? 'story' : 'post'
  const size = format === 'story' ? socialStorySize : socialCardSize
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response('Missing Supabase configuration', { status: 500 })
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey)
  const listing = await fetchListingForSocialCard(supabase, id)
  const imageUrl = getOptimizedCardImageUrl(getPrimaryImageUrl(listing) || fallbackImageUrl, size.width, size.height)
  const facts = getSocialCardFacts(listing)

  return new ImageResponse(
    (
      <div
        style={{
          position: 'relative',
          display: 'flex',
          width: `${size.width}px`,
          height: `${size.height}px`,
          overflow: 'hidden',
          backgroundColor: '#111827',
          fontFamily: 'Inter, Arial, sans-serif',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt=""
          width={1080}
          height={size.height}
          style={{
            position: 'absolute',
            inset: 0,
            width: `${size.width}px`,
            height: `${size.height}px`,
            objectFit: 'cover',
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.48)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: '48px',
            border: '2px solid rgba(255,255,255,0.24)',
            borderRadius: '44px',
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: '114px',
            left: '116px',
            display: 'flex',
            alignItems: 'center',
            gap: '20px',
            padding: '22px 32px',
            borderRadius: '18px',
            background: 'rgba(255,255,255,0.94)',
            boxShadow: '0 24px 60px rgba(0,0,0,0.28)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '54px',
              height: '54px',
              borderRadius: '999px',
              background: '#020617',
              color: '#fff',
              fontSize: '31px',
              fontWeight: 800,
            }}
          >
            A
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ color: '#020617', fontSize: '31px', fontWeight: 900, letterSpacing: '0' }}>
              AEROTRADE
            </div>
            <div style={{ color: '#475569', fontSize: '20px', fontWeight: 700 }}>
              Balloon Marketplace
            </div>
          </div>
        </div>
        <div
          style={{
            position: 'absolute',
            left: '116px',
            right: '116px',
            bottom: format === 'story' ? '230px' : '92px',
            display: 'flex',
            flexDirection: 'column',
            padding: '46px 50px',
            borderRadius: '30px',
            border: '1px solid rgba(255,255,255,0.28)',
            background: 'rgba(15,23,42,0.58)',
            boxShadow: '0 30px 80px rgba(0,0,0,0.32)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignSelf: 'flex-start',
              padding: '13px 30px',
              borderRadius: '999px',
              background: '#fff',
              color: '#0f172a',
              fontSize: '25px',
              fontWeight: 900,
              letterSpacing: '4px',
              textTransform: 'uppercase',
              marginBottom: '38px',
            }}
          >
            For Sale
          </div>
          <div
            style={{
              color: '#fff',
              fontSize: format === 'story' ? '70px' : '62px',
              lineHeight: 1.04,
              fontWeight: 950,
              marginBottom: '34px',
              letterSpacing: '0',
              textShadow: '0 8px 24px rgba(0,0,0,0.22)',
              maxHeight: format === 'story' ? '146px' : '130px',
              overflow: 'hidden',
            }}
          >
            {trimTitle(listing.title)}
          </div>
          <div
            style={{
              color: '#fff',
              fontSize: format === 'story' ? '64px' : '58px',
              lineHeight: 1,
              fontWeight: 950,
              marginBottom: '48px',
              letterSpacing: '0',
              textShadow: '0 8px 24px rgba(0,0,0,0.22)',
            }}
          >
            {formatSocialCardPrice(listing)}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '22px', color: '#fff', fontSize: '31px', fontWeight: 700 }}>
            {facts.hours ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '34px', height: '34px', borderRadius: '999px', background: 'rgba(255,255,255,0.20)' }}>
                  <span style={{ fontSize: '22px' }}>o</span>
                </div>
                <span>{facts.hours}</span>
              </div>
            ) : null}
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
              <div style={{ display: 'flex', width: '34px', height: '34px', borderRadius: '999px', background: 'rgba(255,255,255,0.20)' }} />
              <span>Condition: {facts.condition}</span>
            </div>
          </div>
        </div>
        <div
          style={{
            position: 'absolute',
            right: '118px',
            bottom: format === 'story' ? '135px' : '55px',
            color: '#fff',
            fontSize: '39px',
            fontWeight: 850,
            letterSpacing: '0',
            textShadow: '0 6px 20px rgba(0,0,0,0.42)',
          }}
        >
          aerotrade.app
        </div>
      </div>
    ),
    size
  )
}
