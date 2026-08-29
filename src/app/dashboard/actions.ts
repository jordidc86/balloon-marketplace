'use server'

import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { getApplicationOrigin } from '@/utils/navigation.mjs'
import { siteUrl } from '@/utils/site'
import { isClosedInquiryStatus, normalizeInquiryStatus } from '@/utils/inquiry-safety.mjs'
import { revalidatePath } from 'next/cache'

export async function openBillingPortal() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('users')
    .select('stripe_customer_id, is_premium, premium_source')
    .eq('id', user.id)
    .single()

  if (!profile?.is_premium || profile.premium_source !== 'stripe' || !profile.stripe_customer_id) {
    redirect('/dashboard?billing=unavailable')
  }

  const { stripe } = await import('@/utils/stripe')
  const headersList = await import('next/headers').then((m) => m.headers())
  const origin = getApplicationOrigin(headersList.get('origin'), siteUrl)

  const session = await stripe.billingPortal.sessions.create({
    customer: profile.stripe_customer_id,
    return_url: `${origin}/dashboard`,
  })

  redirect(session.url)
}

export async function updateSellerInquiryStatus(inquiryId: string, formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const requestedStatus = normalizeInquiryStatus(formData.get('status'))
  if (!requestedStatus || !['CONTACTED', 'QUALIFIED', 'NEGOTIATING', 'WON', 'LOST', 'SPAM'].includes(requestedStatus)) {
    throw new Error('Invalid enquiry status')
  }

  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('marketplace_inquiries')
    .update({
      status: requestedStatus,
      last_activity_at: now,
      closed_at: isClosedInquiryStatus(requestedStatus) ? now : null,
    })
    .eq('id', inquiryId)
    .select('id')
    .single()

  if (error || !data?.id) {
    throw new Error('Could not update this enquiry')
  }

  revalidatePath('/dashboard')
}
