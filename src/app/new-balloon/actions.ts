'use server'

import { createAdminClient } from '@/utils/supabase/server'
import { sendEmail } from '@/utils/resend'
import { redirect } from 'next/navigation'

const adminEmail = process.env.ADMIN_EMAIL?.trim()

const getFormString = (formData: FormData, key: string) => {
  const value = formData.get(key)
  return typeof value === 'string' ? value.trim() : ''
}

const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')

export async function submitNewBalloonQuote(formData: FormData) {
  const request = {
    name: getFormString(formData, 'name'),
    email: getFormString(formData, 'email'),
    phone: getFormString(formData, 'phone'),
    country: getFormString(formData, 'country'),
    manufacturer_preference: getFormString(formData, 'manufacturer_preference'),
    equipment_type: getFormString(formData, 'equipment_type'),
    volume_or_capacity: getFormString(formData, 'volume_or_capacity'),
    intended_use: getFormString(formData, 'intended_use'),
    budget_range: getFormString(formData, 'budget_range'),
    timeline: getFormString(formData, 'timeline'),
    colors_or_branding: getFormString(formData, 'colors_or_branding'),
    notes: getFormString(formData, 'notes'),
    status: 'NEW',
  }

  if (!request.name || !request.email || !request.equipment_type) {
    redirect('/new-balloon?error=' + encodeURIComponent('Please complete name, email and equipment type.'))
  }

  let requestId: string
  try {
    const supabase = await createAdminClient()
    const { data, error } = await supabase
      .from('quote_requests')
      .insert(request)
      .select('id')
      .single()

    if (error || !data?.id) {
      throw new Error(error?.message || 'Quote request readback did not return an id')
    }
    requestId = String(data.id)
  } catch (error) {
    console.error('Quote request storage is not available:', error)
    redirect('/new-balloon?error=' + encodeURIComponent('We could not save your request. Please try again.'))
  }

  const rows = Object.entries(request)
    .filter(([key]) => key !== 'status')
    .map(([key, value]) => `
      <tr>
        <td style="padding: 8px 12px; color: #64748b; text-transform: capitalize;">${escapeHtml(key.replaceAll('_', ' '))}</td>
        <td style="padding: 8px 12px; color: #0f172a; font-weight: 600;">${escapeHtml(String(value || '-'))}</td>
      </tr>
    `)
    .join('')

  const supabase = await createAdminClient()
  const notificationKey = `aerotrade-quote-${requestId}`
  const { data: receipt, error: receiptError } = await supabase
    .from('commercial_notification_receipts')
    .upsert({
      notification_type: 'quote_created_admin',
      entity_type: 'quote_request',
      entity_id: requestId,
      recipient_role: 'admin',
      status: 'pending',
      idempotency_key: notificationKey,
    }, { onConflict: 'idempotency_key' })
    .select('id')
    .single()

  if (receiptError || !receipt?.id) {
    console.error(`Quote request ${requestId} was stored but its notification receipt could not be created`)
    redirect('/new-balloon?success=true')
  }

  const delivery = adminEmail ? await sendEmail(
    adminEmail,
    `New Pasha/Schroeder balloon quote request: ${request.name}`,
    `
      <h2>New AeroTrade balloon quote request</h2>
      <p>A buyer is asking for a fast price indication and first visual concept for a new Pasha or Schroeder balloon.</p>
      <table style="border-collapse: collapse; width: 100%; max-width: 720px;">${rows}</table>
    `,
    { idempotencyKey: notificationKey },
  ) : { success: false, resendId: undefined }

  const accepted = delivery.success && delivery.resendId
  const expectedStatus = accepted ? 'accepted' : 'failed'
  const now = new Date().toISOString()
  const { data: notificationReadback, error: notificationError } = await supabase
    .from('commercial_notification_receipts')
    .update({
      status: expectedStatus,
      provider_message_id: accepted ? delivery.resendId : null,
      error_message: accepted ? null : adminEmail ? 'Provider acceptance was not confirmed.' : 'ADMIN_EMAIL is not configured.',
      attempted_at: now,
      accepted_at: accepted ? now : null,
    })
    .eq('id', receipt.id)
    .select('id,status')
    .single()

  if (notificationError || notificationReadback?.status !== expectedStatus) {
    console.error(`Quote request ${requestId} was stored but its notification result could not be verified`)
  }

  redirect('/new-balloon?success=true')
}
