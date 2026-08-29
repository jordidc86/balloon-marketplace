export const listingVerificationStatuses = ['UNVERIFIED', 'IN_REVIEW', 'VERIFIED', 'REJECTED']
export const identityReviewBases = ['ACCOUNT_AND_LIVE_CALL', 'BUSINESS_REGISTRY', 'IDENTITY_DOCUMENT_REVIEWED']
export const supportingEvidenceTypes = [
  'REGISTRATION',
  'SERIAL_PLATE',
  'PURCHASE_OR_OWNERSHIP',
  'MAINTENANCE_RECORDS',
  'INSPECTION_RECORD',
  'MANUFACTURER_RECORD',
  'OTHER_SUPPORTING',
]
export const verificationRejectionReasons = [
  'IDENTITY_UNCONFIRMED',
  'INSUFFICIENT_EVIDENCE',
  'LISTING_DATA_INCONSISTENT',
  'EVIDENCE_NOT_CURRENT',
  'OTHER_REVIEW_REQUIRED',
]

export function parseListingVerificationDecision(formData) {
  const action = formData.get('verification_action')
  if (!['verify', 'reject', 'unverify'].includes(action)) throw new Error('Invalid verification action')

  if (action === 'verify') {
    const identity_review_basis = formData.get('identity_review_basis')
    const supporting_evidence_types = Array.from(new Set(formData.getAll('supporting_evidence_types')))
    if (!identityReviewBases.includes(identity_review_basis)) throw new Error('Choose the identity review basis')
    if (supporting_evidence_types.length === 0 || supporting_evidence_types.some((value) => !supportingEvidenceTypes.includes(value))) {
      throw new Error('Choose at least one valid supporting evidence type')
    }
    if (formData.get('review_scope_acknowledged') !== 'yes') {
      throw new Error('Acknowledge the limited scope of the AeroTrade review')
    }
    return { action, identity_review_basis, supporting_evidence_types, decision_reason: null }
  }

  if (action === 'reject') {
    const decision_reason = formData.get('decision_reason')
    if (!verificationRejectionReasons.includes(decision_reason)) throw new Error('Choose a valid review outcome')
    return { action, identity_review_basis: null, supporting_evidence_types: [], decision_reason }
  }

  return { action, identity_review_basis: null, supporting_evidence_types: [], decision_reason: 'OTHER_REVIEW_REQUIRED' }
}
