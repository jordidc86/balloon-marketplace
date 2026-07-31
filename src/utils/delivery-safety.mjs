const getErrorMessage = (error) => {
  if (error instanceof Error) {
    return error.message
  }

  if (error && typeof error === 'object' && 'message' in error) {
    return String(error.message)
  }

  return String(error || 'Unknown provider error')
}

export function createMissingEmailProviderResult(emails) {
  const message = 'RESEND_API_KEY is not configured; no email was sent.'

  return {
    success: false,
    configurationError: true,
    error: new Error(message),
    sentCount: 0,
    failedCount: emails.length,
    skippedCount: 0,
    chunkCount: 0,
    failures: emails.map((email, index) => ({
      chunk: 0,
      index,
      to: email.to,
      message,
    })),
    deliveryResults: emails.map(email => ({
      to: email.to,
      status: 'failed',
      error: message,
    })),
  }
}

export function reconcileEmailProviderDeliveries(emails, acceptedDeliveries = [], providerErrors = []) {
  const failedByIndex = new Map(
    providerErrors.map(error => [Number(error.index), getErrorMessage(error)])
  )
  const deliveryResults = []
  const failures = []
  let acceptedIndex = 0

  for (const [index, email] of emails.entries()) {
    const providerError = failedByIndex.get(index)

    if (providerError) {
      deliveryResults.push({ to: email.to, status: 'failed', error: providerError })
      failures.push({ index, to: email.to, message: providerError })
      continue
    }

    const acceptedDelivery = acceptedDeliveries[acceptedIndex]
    acceptedIndex += 1

    if (!acceptedDelivery?.id) {
      const message = 'Email provider did not return an acceptance identifier.'
      deliveryResults.push({ to: email.to, status: 'failed', error: message })
      failures.push({ index, to: email.to, message })
      continue
    }

    deliveryResults.push({
      to: email.to,
      status: 'sent',
      resendId: String(acceptedDelivery.id),
    })
  }

  const sentCount = deliveryResults.filter(result => result.status === 'sent').length
  const failedCount = deliveryResults.length - sentCount

  return {
    success: failedCount === 0,
    sentCount,
    failedCount,
    failures,
    deliveryResults,
  }
}

export function classifyMetaError(error) {
  const message = getErrorMessage(error)
  const normalized = message.toLowerCase()
  const code = Number(error?.code)
  const subcode = Number(error?.subcode ?? error?.error_subcode)
  const networkCode = String(error?.code || '').toUpperCase()

  if (
    code === 190
    || subcode === 463
    || subcode === 467
    || /token.*(expired|invalid)|session has expired|access token.*expired/.test(normalized)
  ) {
    return {
      category: 'token_expired',
      retryable: false,
      message,
      action: 'Reauthorize Meta and replace the production access token before the next scheduled run.',
    }
  }

  if (
    code === 10
    || code === 200
    || /permission|not authorized|insufficient scope/.test(normalized)
  ) {
    return {
      category: 'permission',
      retryable: false,
      message,
      action: 'Review the Meta app permissions and reconnect the affected account.',
    }
  }

  if (/not configured|missing .*token|missing instagram|missing facebook/.test(normalized)) {
    return {
      category: 'configuration',
      retryable: false,
      message,
      action: 'Restore the missing production Meta account identifiers or access token.',
    }
  }

  if (
    networkCode === 'ETIMEDOUT'
    || networkCode === 'ESOCKETTIMEDOUT'
    || /timed? out|timeout|not ready before timeout|media was not ready/.test(normalized)
  ) {
    return {
      category: 'timeout',
      retryable: true,
      message,
      action: 'Retry the provider status check; do not create a second media container.',
    }
  }

  if (code === 4 || code === 17 || code === 32 || code === 613 || /rate limit|too many requests/.test(normalized)) {
    return {
      category: 'rate_limit',
      retryable: true,
      message,
      action: 'Wait for Meta rate limits to clear, then retry the existing operation.',
    }
  }

  if (
    code === 1
    || code === 2
    || ['ECONNRESET', 'ECONNREFUSED', 'EAI_AGAIN', 'ENETUNREACH'].includes(networkCode)
    || /temporar|network|connection reset|service unavailable|bad gateway/.test(normalized)
  ) {
    return {
      category: 'transient',
      retryable: true,
      message,
      action: 'Retry with bounded backoff and retain the current publication identifier.',
    }
  }

  return {
    category: 'unknown',
    retryable: false,
    message,
    action: 'Inspect the Meta response and logs before retrying publication.',
  }
}

export function shouldTryNextMetaCredential(error) {
  const category = classifyMetaError(error).category
  return ['token_expired', 'permission', 'configuration'].includes(category)
}

export async function withBoundedRetry(operation, options = {}) {
  const attempts = Math.max(1, Number(options.attempts || 3))
  const delayMs = Math.max(0, Number(options.delayMs || 0))
  const shouldRetry = options.shouldRetry || (error => classifyMetaError(error).retryable)

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation(attempt)
    } catch (error) {
      if (attempt >= attempts || !shouldRetry(error)) {
        throw error
      }

      if (delayMs > 0) {
        await new Promise(resolve => setTimeout(resolve, delayMs * attempt))
      }
    }
  }

  throw new Error('Retry operation exhausted unexpectedly')
}

export function assessMetaTokenData(data, now = new Date(), warningDays = 14) {
  if (!data?.is_valid) {
    return {
      configured: true,
      valid: false,
      warning: 'Meta reports that the configured access token is invalid.',
      action: 'Reauthorize Meta and replace the production access token.',
    }
  }

  const dataAccessExpiresAt = Number(data.data_access_expires_at || 0)
  const expiresAt = Number(data.expires_at || 0)
  const effectiveExpiry = [dataAccessExpiresAt, expiresAt]
    .filter(value => value > 0)
    .sort((left, right) => left - right)[0] || null
  const daysRemaining = effectiveExpiry
    ? Math.ceil((effectiveExpiry * 1000 - now.getTime()) / 86_400_000)
    : null

  return {
    configured: true,
    valid: true,
    expiresAt: expiresAt ? new Date(expiresAt * 1000).toISOString() : null,
    dataAccessExpiresAt: dataAccessExpiresAt
      ? new Date(dataAccessExpiresAt * 1000).toISOString()
      : null,
    daysRemaining,
    warning: daysRemaining !== null && daysRemaining <= warningDays
      ? `Meta access requires renewal in ${Math.max(daysRemaining, 0)} day(s).`
      : null,
    action: daysRemaining !== null && daysRemaining <= warningDays
      ? 'Reauthorize Meta before the reported access deadline.'
      : null,
  }
}
