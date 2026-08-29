'use server'

import { createAdminClient, createClient } from '@/utils/supabase/server'
import { catalogSearchEventKey, normalizeCatalogSearch } from '@/utils/catalog-search.mjs'
import { normalizeCommercialContext } from '@/utils/commercial-attribution.mjs'
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
  }, { onConflict: 'event_key', ignoreDuplicates: true })

  if (error) {
    console.error('Could not record catalog demand:', error)
    return false
  }
  return true
}
