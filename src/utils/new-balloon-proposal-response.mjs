const responseTypes = new Set(['INTERESTED', 'QUESTION', 'DECLINED'])

const value = (formData, key, max) => {
  const raw = formData.get(key)
  return typeof raw === 'string' ? raw.trim().replace(/\r\n/g, '\n').slice(0, max) : ''
}

export function parseNewBalloonProposalResponse(formData) {
  const response_type = value(formData, 'response_type', 20).toUpperCase()
  const note = value(formData, 'response_note', 1000)
  if (!responseTypes.has(response_type)) throw new Error('Choose how you want to continue with this proposal')
  if (response_type === 'QUESTION' && note.length < 5) throw new Error('Write the question you want AeroTrade to answer')
  return { response_type, note: note || null }
}

export function newBalloonProposalResponseLabel(responseType) {
  if (responseType === 'INTERESTED') return 'Interested in continuing'
  if (responseType === 'QUESTION') return 'Has a question'
  if (responseType === 'DECLINED') return 'Not interested in this proposal'
  return 'Unknown response'
}
