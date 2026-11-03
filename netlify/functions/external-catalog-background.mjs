import { createClient } from '@supabase/supabase-js'
import { authorizedRefresh, refreshExternalCatalog } from '../../src/utils/global-search/refresh.mjs'

export const config = { background: true }

export default async function externalCatalogBackground(request) {
  if (!authorizedRefresh(request, process.env.CRON_SECRET)) { console.error('External catalogue: unauthorized invocation'); return }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('External catalogue storage configuration missing')
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const results = await refreshExternalCatalog(client)
  console.log(JSON.stringify({ kind: 'external_catalog_refresh', results }))
}
