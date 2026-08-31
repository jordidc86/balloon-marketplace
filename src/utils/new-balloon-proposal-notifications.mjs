const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;')

const uuidPattern = '[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'

export const newBalloonManufacturerLabel = (manufacturer) => manufacturer === 'pasha' ? 'Pasha' : 'Schroeder'

export const buildNewBalloonProposalBuyerNotification = ({ quote, proposal, responseUrl }) => {
  const manufacturer = newBalloonManufacturerLabel(proposal.manufacturer)
  const amount = `${(Number(proposal.amount_min_minor) / 100).toLocaleString('en-IE', { style: 'currency', currency: proposal.currency })}–${(Number(proposal.amount_max_minor) / 100).toLocaleString('en-IE', { style: 'currency', currency: proposal.currency })}`
  return {
    subject: `AeroTrade indicative ${manufacturer} balloon proposal`,
    html: `<h2>Your indicative new-balloon proposal</h2><p>Hello ${escapeHtml(quote.name)},</p><p>AeroTrade has prepared an initial, non-binding price direction for a factory-new <strong>${manufacturer}</strong> balloon.</p><p><strong>Indicative range:</strong> ${escapeHtml(amount)}</p><p><strong>Configuration:</strong><br>${escapeHtml(proposal.configuration_summary).replaceAll('\n', '<br>')}</p><p><strong>Delivery guidance:</strong> ${escapeHtml(proposal.delivery_guidance)}</p><p><strong>Valid for discussion until:</strong> ${escapeHtml(proposal.valid_until)}</p>${proposal.terms ? `<p><strong>Conditions:</strong><br>${escapeHtml(proposal.terms).replaceAll('\n', '<br>')}</p>` : ''}<p>This is an invitation to discuss configuration and price. It is not a binding factory quotation, reservation, order or sale contract.</p><p><a href="${escapeHtml(responseUrl)}" style="display:inline-block;padding:12px 18px;background:#0f766e;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">Respond securely to this proposal</a></p><p>You can indicate interest, ask a question or decline. You may also reply to this email.</p>`,
  }
}

export const buildNewBalloonProposalResponseAdminNotification = ({ quote, proposal, event, commercialPipelineUrl, responseLabel }) => ({
  subject: `AeroTrade new-balloon proposal response: ${responseLabel}`,
  html: `<h2>${escapeHtml(responseLabel)}</h2><p><strong>Buyer:</strong> ${escapeHtml(quote.name)}</p><p><strong>Manufacturer:</strong> ${escapeHtml(newBalloonManufacturerLabel(proposal.manufacturer))}</p>${event.note ? `<p><strong>Buyer note:</strong><br />${escapeHtml(event.note).replaceAll('\n', '<br />')}</p>` : ''}<p>This is a non-binding response. It does not create an order, reservation, payment or sale contract. <a href="${escapeHtml(commercialPipelineUrl)}">Review the opportunity in the AeroTrade Commercial Pipeline</a>.</p>`,
})

export const parseNewBalloonProposalResponseNotificationEventId = (idempotencyKey) => {
  if (typeof idempotencyKey !== 'string') return null
  const match = idempotencyKey.match(new RegExp(`^new-balloon-proposal-response-admin-(${uuidPattern})$`, 'i'))
  return match ? match[1].toLowerCase() : null
}

export const getNewBalloonProposalDeliveryRecoveryDecision = ({
  receiptStatus,
  hasProviderMessageId,
  proposal,
  quoteStatus,
  exactReceipt,
  latestProposalId,
  now = new Date(),
}) => {
  if (receiptStatus === 'accepted') {
    return proposal && hasProviderMessageId && exactReceipt ? 'reconcile' : 'blocked'
  }
  const expiry = proposal?.valid_until && /^\d{4}-\d{2}-\d{2}$/.test(proposal.valid_until)
    ? new Date(`${proposal.valid_until}T23:59:59.999Z`)
    : null
  if (!proposal || !quoteStatus || !exactReceipt || proposal.delivery_status === 'accepted'
    || !expiry || !Number.isFinite(expiry.getTime()) || expiry <= new Date(now)
    || latestProposalId !== proposal.id
    || !['NEW', 'CONTACTED', 'SENT_TO_PARTNER'].includes(quoteStatus)) {
    return 'superseded'
  }
  return 'send'
}

export const getNewBalloonResponseNotificationRecoveryDecision = ({
  receiptStatus,
  hasProviderMessageId,
  event,
  exactRelationships,
  quoteStatus,
}) => {
  if (receiptStatus === 'accepted') {
    return event && hasProviderMessageId && exactRelationships ? 'reconcile' : 'blocked'
  }
  if (!event || !exactRelationships || event.admin_notification_status === 'accepted' || quoteStatus !== 'BUYER_RESPONDED') {
    return 'superseded'
  }
  return 'send'
}
