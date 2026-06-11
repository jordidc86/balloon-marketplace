import https from 'node:https'

type MetaPostInput = {
  imageUrl: string
  caption: string
  linkUrl?: string
}

type MetaCarouselInput = {
  imageUrls: string[]
  caption: string
}

type MetaReelInput = {
  videoUrl: string
  caption: string
}

type InstagramPublishResult = {
  creationId: string
  mediaId: string
}

type FacebookPublishResult = {
  postId: string
}

type InstagramCarouselPublishResult = InstagramPublishResult & {
  childCreationIds: string[]
}

type InstagramReelPublishResult = InstagramPublishResult

type InstagramStoryPublishResult = {
  creationId: string
  mediaId: string
}

type FacebookStoryPublishResult = {
  photoId: string
  postId: string
}

type FacebookVideoPublishResult = {
  videoId: string
}

type FacebookConfig = {
  pageId: string
  accessToken: string
}

type MetaApiResponse<T> = T & {
  error?: {
    message?: string
    type?: string
    code?: number
    error_subcode?: number
    fbtrace_id?: string
  }
}

type InstagramContainerStatus = {
  status_code?: 'EXPIRED' | 'ERROR' | 'FINISHED' | 'IN_PROGRESS' | 'PUBLISHED'
  status?: string
}

class MetaApiError extends Error {
  code?: number
  subcode?: number

  constructor(message: string, code?: number, subcode?: number) {
    super(message)
    this.name = 'MetaApiError'
    this.code = code
    this.subcode = subcode
  }
}

const graphApiVersion = process.env.META_GRAPH_API_VERSION || 'v24.0'
const graphApiBaseUrl = `https://graph.facebook.com/${graphApiVersion}`
const instagramContainerPollDelayMs = 2500
const instagramContainerPollAttempts = 20

const getUniqueTokenCandidates = (...tokens: Array<string | undefined>) => {
  const seen = new Set<string>()

  return tokens.filter((token): token is string => {
    if (!token || seen.has(token)) {
      return false
    }

    seen.add(token)
    return true
  })
}

const userTokenCandidates = () => getUniqueTokenCandidates(
  process.env.META_USER_ACCESS_TOKEN,
  process.env.META_ACCESS_TOKEN,
)

const instagramTokenCandidates = () => getUniqueTokenCandidates(
  process.env.INSTAGRAM_ACCESS_TOKEN,
  ...userTokenCandidates(),
)

const facebookDirectTokenCandidates = () => getUniqueTokenCandidates(
  process.env.FACEBOOK_PAGE_ACCESS_TOKEN,
  process.env.META_PAGE_ACCESS_TOKEN,
)

const getInstagramConfig = () => {
  const instagramUserId = process.env.INSTAGRAM_USER_ID
  const accessTokens = instagramTokenCandidates()

  if (!instagramUserId || accessTokens.length === 0) {
    return null
  }

  return { instagramUserId, accessTokens }
}

const getFacebookConfigs = async () => {
  const pageId = process.env.FACEBOOK_PAGE_ID
  const configs: FacebookConfig[] = facebookDirectTokenCandidates()
    .map(accessToken => ({ pageId: pageId || '', accessToken }))

  if (!pageId) {
    return []
  }

  for (const userToken of userTokenCandidates()) {
    try {
      const pageToken = await getPageAccessToken(pageId, userToken)

      if (pageToken) {
        configs.push({ pageId, accessToken: pageToken })
      }
    } catch {
      // Invalid user tokens are ignored here so a direct Page token can still work.
    }
  }

  const seen = new Set<string>()

  return configs.filter((config) => {
    if (!config.accessToken || seen.has(config.accessToken)) {
      return false
    }

    seen.add(config.accessToken)
    return true
  })
}

const postToMeta = async <T>(
  path: string,
  body: Record<string, string>
): Promise<T> => {
  const requestBody = new URLSearchParams(body).toString()
  const json = await new Promise<MetaApiResponse<T>>((resolve, reject) => {
    const request = https.request(`${graphApiBaseUrl}/${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(requestBody),
      },
    }, (response) => {
      const chunks: Buffer[] = []
      response.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
      response.on('end', () => {
        const responseBody = Buffer.concat(chunks).toString('utf8')

        try {
          const parsed = JSON.parse(responseBody) as MetaApiResponse<T>

          if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300 || parsed.error) {
            const errorMessage = parsed.error?.message || `Meta API request failed with ${response.statusCode}`
            reject(new MetaApiError(errorMessage, parsed.error?.code, parsed.error?.error_subcode))
            return
          }

          resolve(parsed)
        } catch (error) {
          reject(error)
        }
      })
    })

    request.on('error', reject)
    request.write(requestBody)
    request.end()
  })

  if (json.error) {
    const errorMessage = json.error?.message || 'Meta API request failed'
    throw new Error(errorMessage)
  }

  return json
}

const getFromMeta = async <T>(
  path: string,
  accessToken: string
): Promise<T> => {
  const separator = path.includes('?') ? '&' : '?'
  const url = `${graphApiBaseUrl}/${path}${separator}access_token=${encodeURIComponent(accessToken)}`

  return new Promise<MetaApiResponse<T>>((resolve, reject) => {
    const request = https.request(url, { method: 'GET' }, (response) => {
      const chunks: Buffer[] = []
      response.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
      response.on('end', () => {
        const responseBody = Buffer.concat(chunks).toString('utf8')

        try {
          const parsed = JSON.parse(responseBody) as MetaApiResponse<T>

          if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300 || parsed.error) {
            const errorMessage = parsed.error?.message || `Meta API request failed with ${response.statusCode}`
            reject(new MetaApiError(errorMessage, parsed.error?.code, parsed.error?.error_subcode))
            return
          }

          resolve(parsed)
        } catch (error) {
          reject(error)
        }
      })
    })

    request.on('error', reject)
    request.end()
  })
}

const getPageAccessToken = async (pageId: string, userAccessToken: string) => {
  const response = await getFromMeta<{
    data?: Array<{ id: string; access_token?: string }>
  }>('me/accounts?fields=id,access_token', userAccessToken)

  return response.data?.find(page => page.id === pageId)?.access_token || null
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

const waitForInstagramContainer = async (creationId: string, accessToken: string) => {
  for (let attempt = 1; attempt <= instagramContainerPollAttempts; attempt++) {
    const status = await getFromMeta<InstagramContainerStatus>(
      `${creationId}?fields=status_code,status`,
      accessToken
    )

    if (!status.status_code || status.status_code === 'FINISHED') {
      return
    }

    if (status.status_code === 'ERROR' || status.status_code === 'EXPIRED') {
      throw new Error(status.status || `Instagram media container ${creationId} finished with ${status.status_code}`)
    }

    if (attempt < instagramContainerPollAttempts) {
      await sleep(instagramContainerPollDelayMs)
    }
  }

  throw new Error(`Instagram media container ${creationId} was not ready before timeout`)
}

const publishInstagramContainer = async (
  instagramUserId: string,
  creationId: string,
  accessToken: string
) => {
  await waitForInstagramContainer(creationId, accessToken)

  try {
    return await postToMeta<{ id: string }>(
      `${instagramUserId}/media_publish`,
      {
        creation_id: creationId,
        access_token: accessToken,
      }
    )
  } catch (error) {
    const metaError = error as MetaApiError

    if (metaError.code === 9007 || metaError.subcode === 2207027) {
      throw new Error('Instagram media was not ready; skipped retry to avoid duplicate publication.')
    }

    throw error
  }
}

const withTokenFallback = async <T>(
  accessTokens: string[],
  run: (accessToken: string) => Promise<T>
) => {
  let lastError: unknown

  for (const accessToken of accessTokens) {
    try {
      return await run(accessToken)
    } catch (error) {
      lastError = error
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Meta API request failed')
}

const withFacebookConfigFallback = async <T>(
  run: (config: FacebookConfig) => Promise<T>
) => {
  const configs = await getFacebookConfigs()

  if (configs.length === 0) {
    throw new Error('Missing FACEBOOK_PAGE_ID and FACEBOOK_PAGE_ACCESS_TOKEN, META_PAGE_ACCESS_TOKEN, META_USER_ACCESS_TOKEN, or META_ACCESS_TOKEN')
  }

  let lastError: unknown

  for (const config of configs) {
    try {
      return await run(config)
    } catch (error) {
      lastError = error
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Meta API request failed')
}

export const canPublishToInstagram = () => Boolean(getInstagramConfig())

export const canPublishToFacebook = () => Boolean(
  process.env.FACEBOOK_PAGE_ID
  && (
    facebookDirectTokenCandidates().length > 0
    || userTokenCandidates().length > 0
  )
)

export const publishInstagramImagePost = async ({
  imageUrl,
  caption,
}: MetaPostInput): Promise<InstagramPublishResult> => {
  const config = getInstagramConfig()

  if (!config) {
    throw new Error('Missing INSTAGRAM_USER_ID and INSTAGRAM_ACCESS_TOKEN, META_USER_ACCESS_TOKEN, or META_ACCESS_TOKEN')
  }

  return withTokenFallback(config.accessTokens, async (accessToken) => {
    const container = await postToMeta<{ id: string }>(
      `${config.instagramUserId}/media`,
      {
        image_url: imageUrl,
        caption,
        access_token: accessToken,
      }
    )

    const published = await publishInstagramContainer(
      config.instagramUserId,
      container.id,
      accessToken
    )

    return {
      creationId: container.id,
      mediaId: published.id,
    }
  })
}

export const publishInstagramImageCarousel = async ({
  imageUrls,
  caption,
}: MetaCarouselInput): Promise<InstagramCarouselPublishResult> => {
  const config = getInstagramConfig()

  if (!config) {
    throw new Error('Missing INSTAGRAM_USER_ID and INSTAGRAM_ACCESS_TOKEN, META_USER_ACCESS_TOKEN, or META_ACCESS_TOKEN')
  }

  if (imageUrls.length < 2) {
    throw new Error('Instagram carousel publishing requires at least two images')
  }

  return withTokenFallback(config.accessTokens, async (accessToken) => {
    const childCreationIds: string[] = []

    for (const imageUrl of imageUrls) {
      const child = await postToMeta<{ id: string }>(
        `${config.instagramUserId}/media`,
        {
          image_url: imageUrl,
          is_carousel_item: 'true',
          access_token: accessToken,
        }
      )

      await waitForInstagramContainer(child.id, accessToken)
      childCreationIds.push(child.id)
    }

    const container = await postToMeta<{ id: string }>(
      `${config.instagramUserId}/media`,
      {
        media_type: 'CAROUSEL',
        children: childCreationIds.join(','),
        caption,
        access_token: accessToken,
      }
    )

    const published = await publishInstagramContainer(
      config.instagramUserId,
      container.id,
      accessToken
    )

    return {
      creationId: container.id,
      childCreationIds,
      mediaId: published.id,
    }
  })
}

export const publishInstagramReel = async ({
  videoUrl,
  caption,
}: MetaReelInput): Promise<InstagramReelPublishResult> => {
  const config = getInstagramConfig()

  if (!config) {
    throw new Error('Missing INSTAGRAM_USER_ID and INSTAGRAM_ACCESS_TOKEN, META_USER_ACCESS_TOKEN, or META_ACCESS_TOKEN')
  }

  return withTokenFallback(config.accessTokens, async (accessToken) => {
    const container = await postToMeta<{ id: string }>(
      `${config.instagramUserId}/media`,
      {
        media_type: 'REELS',
        video_url: videoUrl,
        caption,
        share_to_feed: 'true',
        access_token: accessToken,
      }
    )

    const published = await publishInstagramContainer(
      config.instagramUserId,
      container.id,
      accessToken
    )

    return {
      creationId: container.id,
      mediaId: published.id,
    }
  })
}

export const publishFacebookPhotoPost = async ({
  imageUrl,
  caption,
  linkUrl,
}: MetaPostInput): Promise<FacebookPublishResult> => {
  const message = linkUrl ? `${caption}\n\n${linkUrl}` : caption

  return withFacebookConfigFallback(async (config) => {
    const published = await postToMeta<{ id: string; post_id?: string }>(
      `${config.pageId}/photos`,
      {
        url: imageUrl,
        caption: message,
        published: 'true',
        access_token: config.accessToken,
      }
    )

    return {
      postId: published.post_id || published.id,
    }
  })
}

export const publishFacebookVideoPost = async ({
  videoUrl,
  caption,
  linkUrl,
}: MetaReelInput & { linkUrl?: string }): Promise<FacebookVideoPublishResult> => {
  const description = linkUrl ? `${caption}\n\n${linkUrl}` : caption

  return withFacebookConfigFallback(async (config) => {
    const published = await postToMeta<{ id: string }>(
      `${config.pageId}/videos`,
      {
        file_url: videoUrl,
        description,
        published: 'true',
        access_token: config.accessToken,
      }
    )

    return {
      videoId: published.id,
    }
  })
}

export const publishInstagramImageStory = async ({
  imageUrl,
}: Pick<MetaPostInput, 'imageUrl'>): Promise<InstagramStoryPublishResult> => {
  const config = getInstagramConfig()

  if (!config) {
    throw new Error('Missing INSTAGRAM_USER_ID and INSTAGRAM_ACCESS_TOKEN, META_USER_ACCESS_TOKEN, or META_ACCESS_TOKEN')
  }

  return withTokenFallback(config.accessTokens, async (accessToken) => {
    const container = await postToMeta<{ id: string }>(
      `${config.instagramUserId}/media`,
      {
        image_url: imageUrl,
        media_type: 'STORIES',
        access_token: accessToken,
      }
    )

    const published = await publishInstagramContainer(
      config.instagramUserId,
      container.id,
      accessToken
    )

    return {
      creationId: container.id,
      mediaId: published.id,
    }
  })
}

export const publishFacebookPhotoStory = async ({
  imageUrl,
}: Pick<MetaPostInput, 'imageUrl'>): Promise<FacebookStoryPublishResult> => {
  return withFacebookConfigFallback(async (config) => {
    const photo = await postToMeta<{ id: string }>(
      `${config.pageId}/photos`,
      {
        url: imageUrl,
        published: 'false',
        access_token: config.accessToken,
      }
    )

    const story = await postToMeta<{ success?: boolean; post_id?: string; id?: string }>(
      `${config.pageId}/photo_stories`,
      {
        photo_id: photo.id,
        access_token: config.accessToken,
      }
    )

    return {
      photoId: photo.id,
      postId: story.post_id || story.id || photo.id,
    }
  })
}
