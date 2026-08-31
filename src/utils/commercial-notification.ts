import type { SupabaseClient } from '@supabase/supabase-js'
import { sendEmail } from '@/utils/resend'
import {
  commercialDeliveryMaxAttempts,
  getCommercialDeliveryDecision,
  getNextCommercialAttemptAt,
} from '@/utils/commercial-delivery.mjs'

type NotificationInput = {
  notificationType: string
  entityType: string
  entityId: string
  recipientRole: 'admin' | 'seller' | 'buyer'
  to: string
  subject: string
  html: string
  idempotencyKey: string
  replyTo?: string
}

export async function sendCommercialReceiptEmail(supabase: SupabaseClient, input: NotificationInput) {
  const { data: initialExisting, error: existingError } = await supabase
    .from('commercial_notification_receipts')
    .select('id,status,provider_message_id,delivery_attempts,next_attempt_at')
    .eq('idempotency_key', input.idempotencyKey)
    .maybeSingle()
  if (existingError) throw new Error('Notification receipt could not be read')
  let existing = initialExisting

  let receiptId = existing?.id
  if (!receiptId) {
    const { data: created, error } = await supabase
      .from('commercial_notification_receipts')
      .insert({
        notification_type: input.notificationType,
        entity_type: input.entityType,
        entity_id: input.entityId,
        recipient_role: input.recipientRole,
        status: 'pending',
        idempotency_key: input.idempotencyKey,
      })
      .select('id,status,provider_message_id,delivery_attempts,next_attempt_at')
      .single()
    if (!error && created?.id) {
      existing = created
      receiptId = created.id
    } else {
      const { data: concurrent, error: concurrentError } = await supabase
        .from('commercial_notification_receipts')
        .select('id,status,provider_message_id,delivery_attempts,next_attempt_at')
        .eq('idempotency_key', input.idempotencyKey)
        .maybeSingle()
      if (concurrentError || !concurrent?.id) throw new Error('Notification receipt could not be persisted')
      existing = concurrent
      receiptId = concurrent.id
    }
  }

  const now = new Date()
  const decision = getCommercialDeliveryDecision(existing, now)
  if (decision === 'duplicate') {
    return { success: true, duplicate: true, skipped: false, reason: null, providerMessageId: existing?.provider_message_id || null }
  }
  if (decision !== 'send') {
    return { success: false, duplicate: false, skipped: true, reason: decision, providerMessageId: null }
  }

  const previousAttempts = Number(existing?.delivery_attempts || 0)
  const attemptNumber = previousAttempts + 1
  const attemptStartedAt = now.toISOString()
  const nextAttemptAt = getNextCommercialAttemptAt(attemptNumber, now)
  const { data: claim, error: claimError } = await supabase
    .from('commercial_notification_receipts')
    .update({
      status: 'pending',
      delivery_attempts: attemptNumber,
      next_attempt_at: nextAttemptAt,
      error_message: null,
      attempted_at: attemptStartedAt,
    })
    .eq('id', receiptId)
    .eq('delivery_attempts', previousAttempts)
    .in('status', ['pending', 'failed'])
    .select('id')
    .maybeSingle()
  if (claimError) throw new Error('Notification delivery attempt could not be claimed')
  if (!claim?.id) {
    const { data: current, error: currentError } = await supabase
      .from('commercial_notification_receipts')
      .select('status,provider_message_id,delivery_attempts,next_attempt_at')
      .eq('id', receiptId)
      .single()
    if (currentError) throw new Error('Notification delivery claim could not be verified')
    const currentDecision = getCommercialDeliveryDecision(current, now)
    if (currentDecision === 'duplicate') {
      return { success: true, duplicate: true, skipped: false, reason: null, providerMessageId: current.provider_message_id }
    }
    return { success: false, duplicate: false, skipped: true, reason: currentDecision === 'send' ? 'claim_conflict' : currentDecision, providerMessageId: null }
  }

  const delivery = await sendEmail(input.to, input.subject, input.html, {
    idempotencyKey: input.idempotencyKey,
    replyTo: input.replyTo,
  })
  const accepted = delivery.success && delivery.resendId
  const { data: readback, error: updateError } = await supabase
    .from('commercial_notification_receipts')
    .update({
      status: accepted ? 'accepted' : 'failed',
      provider_message_id: accepted ? delivery.resendId : null,
      error_message: accepted ? null : 'Provider acceptance was not confirmed.',
      next_attempt_at: accepted || attemptNumber >= commercialDeliveryMaxAttempts ? null : nextAttemptAt,
      accepted_at: accepted ? attemptStartedAt : null,
    })
    .eq('id', receiptId)
    .select('status,provider_message_id')
    .single()
  if (updateError || readback?.status !== (accepted ? 'accepted' : 'failed')) {
    throw new Error('Notification delivery result could not be persisted')
  }

  return {
    success: accepted,
    duplicate: false,
    skipped: false,
    reason: accepted ? null : attemptNumber >= commercialDeliveryMaxAttempts ? 'exhausted' : 'failed',
    providerMessageId: accepted ? readback.provider_message_id : null,
  }
}
