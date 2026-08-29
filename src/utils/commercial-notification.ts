import type { SupabaseClient } from '@supabase/supabase-js'
import { sendEmail } from '@/utils/resend'

type NotificationInput = {
  notificationType: string
  entityType: string
  entityId: string
  recipientRole: 'admin' | 'seller' | 'buyer'
  to: string
  subject: string
  html: string
  idempotencyKey: string
}

export async function sendCommercialReceiptEmail(supabase: SupabaseClient, input: NotificationInput) {
  const { data: existing, error: existingError } = await supabase
    .from('commercial_notification_receipts')
    .select('id,status,provider_message_id')
    .eq('idempotency_key', input.idempotencyKey)
    .maybeSingle()
  if (existingError) throw new Error('Notification receipt could not be read')
  if (existing?.status === 'accepted' && existing.provider_message_id) {
    return { success: true, duplicate: true, providerMessageId: existing.provider_message_id }
  }

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
      .select('id')
      .single()
    if (error || !created?.id) throw new Error('Notification receipt could not be persisted')
    receiptId = created.id
  }

  const delivery = await sendEmail(input.to, input.subject, input.html, { idempotencyKey: input.idempotencyKey })
  const accepted = delivery.success && delivery.resendId
  const now = new Date().toISOString()
  const { data: readback, error: updateError } = await supabase
    .from('commercial_notification_receipts')
    .update({
      status: accepted ? 'accepted' : 'failed',
      provider_message_id: accepted ? delivery.resendId : null,
      error_message: accepted ? null : 'Provider acceptance was not confirmed.',
      attempted_at: now,
      accepted_at: accepted ? now : null,
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
    providerMessageId: accepted ? readback.provider_message_id : null,
  }
}
