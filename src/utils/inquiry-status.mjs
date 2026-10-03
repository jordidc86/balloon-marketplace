import { isClosedInquiryStatus, normalizeInquiryStatus } from './inquiry-safety.mjs'

export async function storeSellerInquiryStatus(supabase, inquiryId, status, now = new Date().toISOString()) {
  const requestedStatus = normalizeInquiryStatus(status)
  if (!requestedStatus || !['CONTACTED', 'QUALIFIED', 'NEGOTIATING', 'LOST', 'SPAM'].includes(requestedStatus)) {
    throw new Error('Invalid enquiry status')
  }

  const { data, error } = await supabase
    .from('marketplace_inquiries')
    .update({
      status: requestedStatus,
      last_activity_at: now,
      closed_at: isClosedInquiryStatus(requestedStatus) ? now : null,
    })
    .eq('id', inquiryId)
    .select('id,status')
    .single()

  if (error || data?.id !== inquiryId || data?.status !== requestedStatus) {
    throw new Error('Could not verify the saved enquiry status')
  }
  return { status: data.status }
}
