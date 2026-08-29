import type { SupabaseClient } from '@supabase/supabase-js'
import { classifyMetaError } from '@/utils/delivery-safety.mjs'
import {
  buildSocialPublicationKey,
  getNextSocialPublicationAttemptAt,
  getSocialPublicationDecision,
  isSocialPublicationRetrySafe,
} from '@/utils/social-publication.mjs'

type SocialNetwork = 'instagram' | 'facebook'
type SocialPlacement = 'post' | 'story' | 'carousel' | 'reel' | 'video'

type PublicationInput = {
  runDate: string
  contentKind: 'listing' | 'brand'
  contentId: string
  contentVariant: string
  network: SocialNetwork
  placement: SocialPlacement
  destinationUrl: string
}

type Receipt = {
  id: string
  status: 'pending' | 'accepted' | 'failed'
  attempt_count: number
  retryable: boolean
  provider_id: string | null
  next_attempt_at: string | null
}

type PublicationResult = {
  accepted: boolean
  duplicate: boolean
  skipped: boolean
  reason: string | null
  providerId: string | null
}

const receiptSelection = 'id,status,attempt_count,retryable,provider_id,next_attempt_at'

export async function publishSocialPlacement(
  supabase: SupabaseClient,
  input: PublicationInput,
  publish: () => Promise<string>,
): Promise<PublicationResult> {
  const publicationKey = buildSocialPublicationKey(input)
  const { data: initial, error: initialError } = await supabase
    .from('social_publication_receipts')
    .select(receiptSelection)
    .eq('publication_key', publicationKey)
    .maybeSingle()
  if (initialError) throw new Error('Social publication receipt could not be read')

  let receipt = initial as Receipt | null
  if (!receipt) {
    const { data: created, error: createError } = await supabase
      .from('social_publication_receipts')
      .insert({
        publication_key: publicationKey,
        run_date: input.runDate,
        content_kind: input.contentKind,
        content_id: input.contentId,
        content_variant: input.contentVariant,
        network: input.network,
        placement: input.placement,
        destination_url: input.destinationUrl,
        status: 'pending',
        attempt_count: 0,
      })
      .select(receiptSelection)
      .single()

    if (!createError && created?.id) {
      receipt = created as Receipt
    } else {
      const { data: concurrent, error: concurrentError } = await supabase
        .from('social_publication_receipts')
        .select(receiptSelection)
        .eq('publication_key', publicationKey)
        .maybeSingle()
      if (concurrentError || !concurrent?.id) throw new Error('Social publication receipt could not be persisted')
      receipt = concurrent as Receipt
    }
  }

  const now = new Date()
  const decision = getSocialPublicationDecision(receipt, now)
  if (decision === 'duplicate') {
    return { accepted: true, duplicate: true, skipped: false, reason: null, providerId: receipt.provider_id }
  }
  if (decision !== 'publish') {
    return { accepted: false, duplicate: false, skipped: true, reason: decision, providerId: null }
  }

  const previousAttempts = Number(receipt.attempt_count || 0)
  const attemptNumber = previousAttempts + 1
  const claimedAt = now.toISOString()
  const { data: claim, error: claimError } = await supabase
    .from('social_publication_receipts')
    .update({
      status: 'pending',
      attempt_count: attemptNumber,
      retryable: false,
      provider_id: null,
      error_category: null,
      error_detail: null,
      claimed_at: claimedAt,
      next_attempt_at: null,
      accepted_at: null,
      updated_at: claimedAt,
    })
    .eq('id', receipt.id)
    .eq('attempt_count', previousAttempts)
    .in('status', ['pending', 'failed'])
    .select('id')
    .maybeSingle()
  if (claimError) throw new Error('Social publication attempt could not be claimed')
  if (!claim?.id) {
    return { accepted: false, duplicate: false, skipped: true, reason: 'claim_conflict', providerId: null }
  }

  try {
    const providerId = String(await publish() || '').trim()
    if (!providerId) throw new Error('Meta did not return a publication identifier')
    const { data: accepted, error: acceptedError } = await supabase
      .from('social_publication_receipts')
      .update({
        status: 'accepted',
        retryable: false,
        provider_id: providerId,
        error_category: null,
        error_detail: null,
        next_attempt_at: null,
        accepted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', receipt.id)
      .eq('attempt_count', attemptNumber)
      .eq('status', 'pending')
      .select('status,provider_id')
      .single()
    if (acceptedError || accepted?.status !== 'accepted' || accepted.provider_id !== providerId) {
      throw new Error('Meta accepted the publication but its receipt could not be verified; do not retry automatically')
    }
    return { accepted: true, duplicate: false, skipped: false, reason: null, providerId }
  } catch (error) {
    const classified = classifyMetaError(error)
    const retryable = isSocialPublicationRetrySafe(classified.category) && attemptNumber < 2
    const failureAt = new Date()
    const { error: failureError } = await supabase
      .from('social_publication_receipts')
      .update({
        status: 'failed',
        retryable,
        provider_id: null,
        error_category: classified.category,
        error_detail: `Meta ${classified.category} failure; inspect restricted provider logs before any manual retry.`,
        next_attempt_at: retryable ? getNextSocialPublicationAttemptAt(attemptNumber, failureAt) : null,
        accepted_at: null,
        updated_at: failureAt.toISOString(),
      })
      .eq('id', receipt.id)
      .eq('attempt_count', attemptNumber)
      .eq('status', 'pending')
    if (failureError) {
      throw new Error('Social publication result is unverified; do not retry automatically')
    }
    throw error
  }
}
