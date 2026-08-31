export type BrandSocialType = 'brand-post' | 'brand-carousel' | 'brand-story' | 'brand-reel'
export type SocialPublishingType = 'listing' | BrandSocialType

type BrandConcept = {
  slug: string
  title: string
  caption: string
}

export type SocialPublishingSlot = {
  type: SocialPublishingType
  concept?: BrandConcept
}

const assetBasePath = '/social/aerotrade-orange-v1'

const brandConcepts: BrandConcept[] = [
  {
    slug: 'sell-where-look',
    title: 'Sell it where balloon people look',
    caption: [
      'Sell it where balloon people look.',
      '',
      'AeroTrade is a focused marketplace for used balloon equipment: envelopes, baskets, burners, fans and complete systems.',
      '',
      'List your equipment free on AeroTrade.',
      '',
      '#AeroTrade #Ballooning #HotAirBalloon #Aviation #BalloonMarketplace',
    ].join('\n'),
  },
  {
    slug: 'buyers-need-details',
    title: 'Buyers need details, not noise',
    caption: [
      'Buyers need details, not noise.',
      '',
      'Hours, condition, location and equipment context help serious buyers decide faster.',
      '',
      'AeroTrade keeps used balloon listings clear and relevant.',
      '',
      '#AeroTrade #Ballooning #HotAirBalloon #Aviation #UsedEquipment',
    ].join('\n'),
  },
  {
    slug: 'next-pilot-v2',
    title: 'Your balloon has a next pilot',
    caption: [
      'Your balloon has a next pilot.',
      '',
      'Stored equipment still has value. Give it a cleaner, more credible way to be discovered by balloon people.',
      '',
      'Create a free AeroTrade listing.',
      '',
      '#AeroTrade #Ballooning #HotAirBalloon #Aviation #ForSale',
    ].join('\n'),
  },
  {
    slug: 'free-upgrade-later',
    title: 'List free. Upgrade only if it makes sense',
    caption: [
      'List free. Upgrade only if it makes sense.',
      '',
      'Start simple with a free listing. Use premium visibility only when it adds value.',
      '',
      'AeroTrade is built to make selling balloon equipment less heavy.',
      '',
      '#AeroTrade #Ballooning #HotAirBalloon #Aviation #Marketplace',
    ].join('\n'),
  },
]

const socialPublishingCycle: SocialPublishingType[] = [
  'listing',
  'brand-post',
  'listing',
  'brand-carousel',
  'listing',
  'brand-story',
  'listing',
  'brand-carousel',
]

const normalizeSiteUrl = (siteUrl: string) => siteUrl.replace(/\/$/, '')
const brandConceptSlugs = new Set(brandConcepts.map((concept) => concept.slug))

const requireBrandConceptSlug = (slug: string) => {
  const normalized = String(slug || '').trim().toLowerCase()
  if (!brandConceptSlugs.has(normalized)) throw new Error('Unknown AeroTrade social concept')
  return normalized
}

export const getSocialPublishingSlot = (
  dayIndex: number,
  override?: string | null,
): SocialPublishingSlot => {
  const requestedType = override && socialPublishingCycle.includes(override as SocialPublishingType)
    ? override as SocialPublishingType
    : null
  const type = requestedType || socialPublishingCycle[dayIndex % socialPublishingCycle.length]

  if (type === 'listing') {
    return { type }
  }

  const concept = brandConcepts[dayIndex % brandConcepts.length]
  return { type, concept }
}

export const getBrandPostImageUrl = (siteUrl: string, slug: string) => (
  `${normalizeSiteUrl(siteUrl)}/api/social-brand-card/${requireBrandConceptSlug(slug)}?format=post`
)

export const getBrandStoryImageUrl = (siteUrl: string, slug: string) => (
  `${normalizeSiteUrl(siteUrl)}/api/social-brand-card/${requireBrandConceptSlug(slug)}?format=story`
)

export const getBrandCarouselImageUrls = (siteUrl: string, slug: string) => {
  const baseUrl = `${normalizeSiteUrl(siteUrl)}/api/social-brand-card/${requireBrandConceptSlug(slug)}?format=carousel`

  return [
    `${baseUrl}&slide=1`,
    `${baseUrl}&slide=2`,
    `${baseUrl}&slide=3`,
  ]
}

export const getBrandSocialSourceImagePath = ({
  slug,
  format,
  slide = 1,
}: {
  slug: string
  format: 'post' | 'story' | 'carousel'
  slide?: number
}) => {
  const normalizedSlug = requireBrandConceptSlug(slug)
  if (format === 'post') return `${assetBasePath}/post/${normalizedSlug}.jpg`
  if (format === 'story') return `${assetBasePath}/story/${normalizedSlug}.jpg`
  if (format !== 'carousel' || ![1, 2, 3].includes(slide)) throw new Error('Invalid AeroTrade social asset')
  const name = slide === 1 ? '01-hook' : slide === 2 ? '02-context' : '03-action'
  return `${assetBasePath}/carousel/${normalizedSlug}/${name}.jpg`
}

export const getBrandReelVideoUrl = (siteUrl: string, slug: string) => (
  `${normalizeSiteUrl(siteUrl)}${assetBasePath}/reels/${slug}.mp4`
)

export const getBrandReelCoverImageUrl = (siteUrl: string, slug: string) => (
  `${normalizeSiteUrl(siteUrl)}${assetBasePath}/reel-frames/${slug}/01.jpg`
)

export const getBrandSocialLinkUrl = (siteUrl: string) => normalizeSiteUrl(siteUrl)
