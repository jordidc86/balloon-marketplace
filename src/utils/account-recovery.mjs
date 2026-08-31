export const minimumAccountPasswordLength = 10

export function normalizeAccountRecoveryEmail(value) {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null
  return email
}

export function validateAccountPasswordChange(passwordValue, confirmationValue) {
  const password = typeof passwordValue === 'string' ? passwordValue : ''
  const confirmation = typeof confirmationValue === 'string' ? confirmationValue : ''

  if (password.length < minimumAccountPasswordLength) {
    return { valid: false, error: `Use at least ${minimumAccountPasswordLength} characters.` }
  }
  if (password.length > 128) return { valid: false, error: 'Use no more than 128 characters.' }
  if (password !== confirmation) return { valid: false, error: 'The passwords do not match.' }
  return { valid: true, password }
}
