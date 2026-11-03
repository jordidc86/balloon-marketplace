import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/server'
import { getGlobalSearchSource } from '@/utils/global-search/sources.mjs'
import { visibleExternalListings } from '@/utils/global-search/index.mjs'

// Compatibility endpoint: read the saved index only; visits never trigger crawls.
export async function GET(_request: Request, context: { params: Promise<{ source: string }> }) {
  const { source } = await context.params
  if (!getGlobalSearchSource(source)) return NextResponse.json({ error: 'Unknown source' }, { status: 404 })
  const client = await createAdminClient()
  const { data, error } = await client.from('external_catalog_sources').select('snapshot').eq('source_id', source).maybeSingle()
  if (error) return NextResponse.json({ error: 'Index unavailable' }, { status: 503 })
  return NextResponse.json({ sourceId: source, listings: visibleExternalListings(data ? [data.snapshot] : []) }, {
    headers: { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' },
  })
}
