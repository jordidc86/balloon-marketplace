import { createAdminClient } from '@/utils/supabase/server'
import { siteUrl } from '@/utils/site'
import { buildMarketplaceInventoryFeed } from '@/utils/marketplace-feed.mjs'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createAdminClient()
  const { data: listings, error } = await supabase
    .from('listings')
    .select('id,title,category,condition,price,currency,location_country,details,status,public_at,created_at,updated_at')
    .in('status', ['ACTIVE_PUBLIC', 'ACTIVE_PREMIUM'])

  if (error) {
    console.error('Marketplace inventory feed failed:', error)
    return new Response('Inventory feed is temporarily unavailable.', {
      status: 503,
      headers: { 'Cache-Control': 'no-store' },
    })
  }

  const feed = buildMarketplaceInventoryFeed({ siteUrl, listings })
  return new Response(feed, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=300',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
