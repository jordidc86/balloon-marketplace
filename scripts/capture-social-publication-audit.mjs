#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

if (process.env.CONFIRM_READ_ONLY_META !== '1') {
  throw new Error('Set CONFIRM_READ_ONLY_META=1 only for a read-only production Meta audit.')
}

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!supabaseUrl || !serviceKey) throw new Error('Missing Supabase production configuration.')

const outputPath = path.resolve(process.cwd(), process.argv[2] || 'reviews/social-publication-audit.json')
const graphVersion = process.env.META_GRAPH_API_VERSION || 'v24.0'
const graphBaseUrl = `https://graph.facebook.com/${graphVersion}`
const capturedAt = new Date()
const rollingDays = 30
const since = new Date(capturedAt.getTime() - rollingDays * 86_400_000).toISOString()
const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })

const unique = (values) => [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))]
const countBy = (items, key) => items.reduce((counts, item) => {
  const value = String(key(item) || 'unknown')
  counts[value] = (counts[value] || 0) + 1
  return counts
}, {})

const metaTokens = unique([
  process.env.INSTAGRAM_ACCESS_TOKEN,
  process.env.META_USER_ACCESS_TOKEN,
  process.env.META_ACCESS_TOKEN,
])
const directPageTokens = unique([
  process.env.FACEBOOK_PAGE_ACCESS_TOKEN,
  process.env.META_PAGE_ACCESS_TOKEN,
])

const graphGet = async (resource, token, fields) => {
  const url = new URL(`${graphBaseUrl}/${resource}`)
  if (fields) url.searchParams.set('fields', fields)
  url.searchParams.set('access_token', token)
  const response = await fetch(url, { method: 'GET', cache: 'no-store' })
  const body = await response.json().catch(() => ({}))
  if (!response.ok || body?.error) {
    const error = new Error('Meta read failed')
    error.code = Number(body?.error?.code || response.status || 0)
    error.subcode = Number(body?.error?.error_subcode || 0)
    throw error
  }
  return body
}

const graphGetWithFallback = async (resource, tokens, fields) => {
  let lastError = null
  for (const token of tokens) {
    try {
      return await graphGet(resource, token, fields)
    } catch (error) {
      lastError = error
    }
  }
  throw lastError || new Error('No Meta read credential is configured')
}

const metaFailureCategory = (error) => {
  if (error?.code === 190) return 'token_invalid_or_expired'
  if ([10, 200, 299].includes(error?.code)) return 'permission_denied'
  if (error?.code === 100) return 'object_unavailable_or_expired'
  if (metaTokens.length === 0 && directPageTokens.length === 0) return 'not_configured'
  return 'provider_read_failed'
}

const { data: receipts, error: receiptError } = await supabase
  .from('social_publication_receipts')
  .select('network,placement,content_kind,destination_url,status,provider_id,accepted_at,created_at')
  .gte('created_at', since)
  .order('created_at', { ascending: true })
if (receiptError) throw new Error(`Social receipt audit failed: ${receiptError.message}`)

const acceptedReceipts = (receipts || []).filter((receipt) => receipt.status === 'accepted' && receipt.provider_id)
const pageTokens = [...directPageTokens]
const instagramAccountIds = unique([process.env.INSTAGRAM_USER_ID])
let pageDiscovery = { attempted: false, succeeded: false, pages: 0, instagramAccounts: 0, failure: null }

if (metaTokens.length > 0) {
  pageDiscovery.attempted = true
  try {
    const accounts = await graphGetWithFallback(
      'me/accounts',
      metaTokens,
      'id,access_token,instagram_business_account{id}',
    )
    for (const page of accounts.data || []) {
      if (page.access_token) pageTokens.push(page.access_token)
      if (page.instagram_business_account?.id) instagramAccountIds.push(page.instagram_business_account.id)
    }
    pageDiscovery = {
      attempted: true,
      succeeded: true,
      pages: (accounts.data || []).length,
      instagramAccounts: unique(instagramAccountIds).length,
      failure: null,
    }
  } catch (error) {
    pageDiscovery.failure = metaFailureCategory(error)
  }
}

const profileWebsiteEvidence = []
for (const accountId of unique(instagramAccountIds)) {
  try {
    const profile = await graphGetWithFallback(accountId, metaTokens, 'website')
    const website = String(profile.website || '').trim()
    profileWebsiteEvidence.push({
      readable: true,
      websiteConfigured: Boolean(website),
      websitePointsToAeroTrade: /(^|\.)aerotrade\.app(?:\/|$)/i.test(website.replace(/^https?:\/\//i, '')),
      failure: null,
    })
  } catch (error) {
    profileWebsiteEvidence.push({ readable: false, websiteConfigured: null, websitePointsToAeroTrade: null, failure: metaFailureCategory(error) })
  }
}

const providerChecks = []
for (const receipt of acceptedReceipts) {
  const ageHours = receipt.accepted_at
    ? (capturedAt.getTime() - new Date(receipt.accepted_at).getTime()) / 3_600_000
    : null
  const expectedExpiredStory = receipt.placement === 'story' && Number.isFinite(ageHours) && ageHours > 24
  const tokens = receipt.network === 'facebook' ? unique(pageTokens) : metaTokens
  const fields = receipt.network === 'facebook'
    ? 'permalink_url,created_time,message,is_published,status_type'
    : 'media_type,media_product_type,permalink,timestamp,caption'

  try {
    const publication = await graphGetWithFallback(receipt.provider_id, tokens, fields)
    const providerText = String(publication.caption || publication.message || '')
    const exactDestinationPresent = providerText.includes(String(receipt.destination_url || ''))
    providerChecks.push({
      network: receipt.network,
      placement: receipt.placement,
      contentKind: receipt.content_kind,
      readable: true,
      expectedExpiredStory: false,
      providerPermalinkPresent: Boolean(publication.permalink || publication.permalink_url),
      providerTextPresent: Boolean(providerText),
      providerTextMentionsAeroTrade: /aerotrade\.app/i.test(providerText),
      exactDestinationPresent,
      providerReportsPublished: publication.is_published !== false,
      failure: null,
    })
  } catch (error) {
    providerChecks.push({
      network: receipt.network,
      placement: receipt.placement,
      contentKind: receipt.content_kind,
      readable: false,
      expectedExpiredStory,
      providerPermalinkPresent: false,
      providerTextPresent: false,
      providerTextMentionsAeroTrade: false,
      exactDestinationPresent: false,
      providerReportsPublished: null,
      failure: expectedExpiredStory ? 'story_expired_expected' : metaFailureCategory(error),
    })
  }
}

const attributionTables = [
  ['listing_events', 'utm_source,created_at'],
  ['catalog_search_events', 'utm_source,created_at'],
  ['marketplace_inquiries', 'utm_source,created_at'],
  ['wanted_requests', 'utm_source,created_at'],
  ['quote_requests', 'utm_source,created_at'],
  ['newsletter_public_subscriptions', 'utm_source,requested_at'],
]
const attributedActivity = []
for (const [table, selection] of attributionTables) {
  const dateColumn = selection.split(',')[1]
  const { data, error } = await supabase
    .from(table)
    .select(selection)
    .in('utm_source', ['instagram', 'facebook'])
    .gte(dateColumn, since)
  if (error) {
    attributedActivity.push({ table, available: false, total: null, byNetwork: {}, failure: 'schema_or_read_unavailable' })
  } else {
    attributedActivity.push({ table, available: true, total: (data || []).length, byNetwork: countBy(data || [], (row) => row.utm_source), failure: null })
  }
}

const clickTransportCandidates = acceptedReceipts.filter((receipt) => receipt.network === 'facebook' && ['post', 'video'].includes(receipt.placement))
const textOnlyDestinationPlacements = acceptedReceipts.filter((receipt) => receipt.network === 'instagram' && ['post', 'carousel', 'reel'].includes(receipt.placement))
const imageOnlyStoryPlacements = acceptedReceipts.filter((receipt) => receipt.placement === 'story')
const attributedActions = attributedActivity.reduce((total, row) => total + (row.total || 0), 0)

const report = {
  version: 1,
  projectId: 'aerotrade',
  readOnly: true,
  containsPii: false,
  capturedAt: capturedAt.toISOString(),
  period: { rollingDays, since },
  receiptEvidence: {
    total: (receipts || []).length,
    byStatus: countBy(receipts || [], (receipt) => receipt.status),
    accepted: acceptedReceipts.length,
    acceptedByNetwork: countBy(acceptedReceipts, (receipt) => receipt.network),
    acceptedByPlacement: countBy(acceptedReceipts, (receipt) => receipt.placement),
    acceptedByContentKind: countBy(acceptedReceipts, (receipt) => receipt.content_kind),
  },
  providerEvidence: {
    pageDiscovery,
    readable: providerChecks.filter((check) => check.readable).length,
    unreadable: providerChecks.filter((check) => !check.readable).length,
    expectedExpiredStories: providerChecks.filter((check) => check.expectedExpiredStory).length,
    providerPermalinks: providerChecks.filter((check) => check.providerPermalinkPresent).length,
    providerTextMentionsAeroTrade: providerChecks.filter((check) => check.providerTextMentionsAeroTrade).length,
    exactAttributedDestinationPresent: providerChecks.filter((check) => check.exactDestinationPresent).length,
    checksByFailure: countBy(providerChecks.filter((check) => check.failure), (check) => check.failure),
    checksByNetworkAndPlacement: countBy(providerChecks, (check) => `${check.network}_${check.placement}`),
  },
  deliveryPathEvidence: {
    facebookPostOrVideoWithProviderLinkCandidate: clickTransportCandidates.length,
    instagramPostCarouselOrReelWithDestinationOnlyInCaptionInput: textOnlyDestinationPlacements.length,
    imageOnlyStoriesWithoutDestinationTransportInPublisher: imageOnlyStoryPlacements.length,
    instagramProfileChecks: profileWebsiteEvidence.length,
    instagramProfilesPointingToAeroTrade: profileWebsiteEvidence.filter((profile) => profile.websitePointsToAeroTrade).length,
    instagramProfileChecksByFailure: countBy(profileWebsiteEvidence.filter((profile) => profile.failure), (profile) => profile.failure),
  },
  attributedActivity: {
    totalActions: attributedActions,
    byDataset: Object.fromEntries(attributedActivity.map((row) => [row.table, { available: row.available, total: row.total, byNetwork: row.byNetwork }])),
  },
  conclusion: attributedActions > 0
    ? 'At least one attributable AeroTrade action followed accepted social publication evidence.'
    : 'Meta acceptance is proven, but no attributable AeroTrade action was observed. Story receipts are image-only awareness placements; they do not transport the stored destination URL.',
  caveat: 'Provider acceptance proves that Meta returned an identifier, not reach, impressions or clicks. Expired stories may no longer be readable after their display window. No provider identifier, token, caption, account name or personal data is stored in this report.',
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true })
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`)
console.log(`Read-only social publication audit written to ${outputPath}`)
