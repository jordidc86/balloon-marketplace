'use server'

import { createAdminClient, createClient } from '@/utils/supabase/server'
import { catalogSearchEventKey, normalizeCatalogSearch } from '@/utils/catalog-search.mjs'
import { commercialJourneyKey, normalizeCommercialContext } from '@/utils/commercial-attribution.mjs'
import type { BrowserCommercialContext } from '@/utils/browser-attribution'

export async function logCatalogSearch(rawSearch: unknown, rawContext?: BrowserCommercialContext) {
  let search
  try {
    search = normalizeCatalogSearch(
      typeof rawSearch === 'object' && rawSearch !== null ? rawSearch : {},
    )
  } catch {
    return false
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).maybeSingle()
    if (profile?.role === 'admin') return false
  }
  const context = normalizeCommercialContext(rawContext)
  const principal = user?.id || context.visitorId
  if (!principal) return false

  const eventKey = catalogSearchEventKey({ search, principal })
  if (!eventKey) return false
  const supabaseAdmin = await createAdminClient()
  const { error } = await supabaseAdmin.from('catalog_search_events').upsert({
    ...search,
    event_key: eventKey,
    referrer_host: context.referrer_host,
    utm_source: context.utm_source,
    utm_medium: context.utm_medium,
    utm_campaign: context.utm_campaign,
    journey_key: commercialJourneyKey({ principal, secret: process.env.SUPABASE_SERVICE_ROLE_KEY }),
  }, { onConflict: 'event_key', ignoreDuplicates: true })

  if (error) {
    console.error('Could not record catalog demand:', error)
    return false
  }
  return true
}
