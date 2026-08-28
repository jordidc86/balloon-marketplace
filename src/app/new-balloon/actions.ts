'use server'

import { createAdminClient } from '@/utils/supabase/server'
import { sendEmail } from '@/utils/resend'
import { redirect } from 'next/navigation'

const adminEmail = process.env.ADMIN_EMAIL || 'jordi.diaz.casaubon@gmail.com'

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

  const delivery = await sendEmail(
    adminEmail,
    `New Pasha/Schroeder balloon quote request: ${request.name}`,
    `
      <h2>New AeroTrade balloon quote request</h2>
      <p>A buyer is asking for a fast price indication and first visual concept for a new Pasha or Schroeder balloon.</p>
      <table style="border-collapse: collapse; width: 100%; max-width: 720px;">${rows}</table>
    `,
    { idempotencyKey: `aerotrade-quote-${requestId}` },
  )

  if (!delivery.success || !delivery.resendId) {
    console.error(`Quote request ${requestId} was stored but its admin notification was not accepted`)
  }

  redirect('/new-balloon?success=true')
}
