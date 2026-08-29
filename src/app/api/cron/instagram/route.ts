import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Jimp, JimpMime, loadFont, measureTextHeight } from 'jimp';
import https from 'node:https';
import {
  SANS_32_BLACK,
  SANS_32_WHITE,
  SANS_64_WHITE,
} from 'jimp/fonts';
import type { BmFont } from '@jimp/plugin-print';
import { sendEmail } from '@/utils/resend';
import {
  canPublishToFacebook,
  canPublishToInstagram,
  getMetaCredentialHealth,
  publishFacebookVideoPost,
  publishInstagramImageCarousel,
  publishFacebookPhotoPost,
  publishFacebookPhotoStory,
  publishInstagramImagePost,
  publishInstagramImageStory,
  publishInstagramReel,
} from '@/utils/meta-social';
import { classifyMetaError } from '@/utils/delivery-safety.mjs';
import { getAttributedSocialUrl } from '@/utils/social-publication.mjs';
import { publishSocialPlacement } from '@/utils/social-publication-receipt';
import { escapeHtml } from '@/utils/html';
import { siteUrl } from '@/utils/site';
import { getSocialCardUrl } from '@/utils/social-card';
import { isPromotedListing } from '@/utils/listing-plans';
import {
  getBrandCarouselImageUrls,
  getBrandPostImageUrl,
  getBrandReelCoverImageUrl,
  getBrandReelVideoUrl,
  getBrandSocialLinkUrl,
  getBrandStoryImageUrl,
  getSocialPublishingSlot,
} from '@/utils/social-brand-content';

type ListingForInstagram = {
  id: string
  title: string
  category: string
  description?: string | null
  price: number
  currency: string
  condition: string
  location_country: string
  details?: {
    hours?: string | number
    manufacturer?: string
    year?: string | number
    model?: string
    listing_plan?: string | null
  } | null
  images?: { url: string; is_primary?: boolean }[]
}

type SocialListing = ListingForInstagram & {
  instagram_posted?: boolean
  facebook_posted?: boolean
  social_last_posted_at?: string | null
}

type SocialFailure = {
  id: string
  network: string
  error: string
  category: string
  retryable: boolean
  action: string
}

type SocialWarning = {
  category: string
  warning: string
  action: string
}

type JimpImage = Awaited<ReturnType<typeof Jimp.read>>

const getListingUrl = (listing: ListingForInstagram) => `${siteUrl}/catalog/${listing.id}`

const httpsRequestBuffer = async (
  url: string,
  options: https.RequestOptions,
  body?: Buffer
) => new Promise<Buffer>((resolve, reject) => {
  const request = https.request(url, options, (response) => {
    const chunks: Buffer[] = []
    response.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
    response.on('end', () => {
      const responseBuffer = Buffer.concat(chunks)

      if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
        reject(new Error(`HTTPS request failed with ${response.statusCode}: ${responseBuffer.toString('utf8').slice(0, 300)}`))
        return
      }

      resolve(responseBuffer)
    })
  })

  request.on('error', reject)

  if (body) {
    request.write(body)
  }

  request.end()
})

const getPrimaryImageUrl = (listing: ListingForInstagram) => {
  const primaryImage = listing.images?.find((image) => image.is_primary)
  return primaryImage?.url || listing.images?.[0]?.url || 'https://images.unsplash.com/photo-1543326727-cf6c39e8f84c?q=80&w=1600&auto=format&fit=crop'
}

const getOptimizedSourceImageUrl = (imageUrl: string, width: number, height: number) => {
  try {
    const parsedUrl = new URL(imageUrl)

    if (parsedUrl.pathname.includes('/storage/v1/object/public/')) {
      parsedUrl.pathname = parsedUrl.pathname.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/')
      parsedUrl.searchParams.set('width', String(width))
      parsedUrl.searchParams.set('height', String(height))
      parsedUrl.searchParams.set('resize', 'cover')
      parsedUrl.searchParams.set('quality', '82')
      return parsedUrl.toString()
    }
  } catch {
    return imageUrl
  }

  return imageUrl
}

const loadImageFromUrl = async (
  imageUrl: string,
) => {
  const imageBuffer = await httpsRequestBuffer(imageUrl, { method: 'GET' })

  return Jimp.read(imageBuffer)
}

const drawText = (
  image: JimpImage,
  font: BmFont,
  x: number,
  y: number,
  text: string,
  maxWidth?: number
) => {
  image.print({
    font,
    x,
    y,
    text,
    maxWidth,
  })
}

const fitTextToLines = (
  font: BmFont,
  text: string,
  maxWidth: number,
  maxLines: number,
) => {
  const cleanText = text.replace(/\s+/g, ' ').trim();
  const maxHeight = font.common.lineHeight * maxLines;

  if (measureTextHeight(font, cleanText, maxWidth) <= maxHeight) {
    return cleanText;
  }

  const words = cleanText.split(' ');
  let candidate = '';

  for (const word of words) {
    const nextCandidate = candidate ? `${candidate} ${word}` : word;
    const nextText = `${nextCandidate}...`;

    if (measureTextHeight(font, nextText, maxWidth) > maxHeight) {
      break;
    }

    candidate = nextCandidate;
  }

  if (candidate) {
    return `${candidate}...`;
  }

  let characterCandidate = '';

  for (const character of cleanText) {
    const nextText = `${characterCandidate}${character}...`;

    if (measureTextHeight(font, nextText, maxWidth) > maxHeight) {
      break;
    }

    characterCandidate += character;
  }

  return `${characterCandidate.trim()}...`;
};

const createSocialCardJpegBuffer = async (listing: ListingForInstagram, format: 'post' | 'story') => {
  const width = 1080
  const height = format === 'story' ? 1920 : 1080
  const background = await loadImageFromUrl(
    getOptimizedSourceImageUrl(getPrimaryImageUrl(listing), width, height),
  )
  background.cover({ w: width, h: height })

  const wash = new Jimp({ width, height, color: 0x0f172a55 })
  background.composite(wash, 0, 0)

  const [fontWhite32, fontWhite64, fontBlack32] = await Promise.all([
    loadFont(SANS_32_WHITE),
    loadFont(SANS_64_WHITE),
    loadFont(SANS_32_BLACK),
  ])

  const badge = new Jimp({ width: 360, height: 108, color: 0xfffffff0 })
  background.composite(badge, 116, 116)
  const icon = new Jimp({ width: 58, height: 58, color: 0x020617ff })
  background.composite(icon, 144, 141)
  drawText(background, fontWhite32, 164, 154, 'A')
  drawText(background, fontBlack32, 222, 139, 'AEROTRADE')
  drawText(background, fontBlack32, 222, 179, 'Marketplace')

  const panelTop = format === 'story' ? 1210 : 470
  const panelHeight = format === 'story' ? 570 : 520
  const panel = new Jimp({ width: 850, height: panelHeight, color: 0x0f172aaa })
  background.composite(panel, 116, panelTop)

  const pill = new Jimp({ width: 210, height: 58, color: 0xffffffff })
  background.composite(pill, 166, panelTop + 48)
  drawText(background, fontBlack32, 198, panelTop + 60, 'FOR SALE')

  const maxTextWidth = 760
  const title = fitTextToLines(fontWhite64, listing.title, maxTextWidth, 2)
  const price = Number(listing.price) <= 0
    ? 'Price on request'
    : `${Number(listing.price).toLocaleString('de-DE')} ${listing.currency}`
  const condition = listing.condition || 'Used'
  const hours = listing.details?.hours ? String(listing.details.hours) : null
  const titleY = panelTop + 138
  const titleHeight = measureTextHeight(fontWhite64, title, maxTextWidth)
  const priceY = titleY + titleHeight + 26
  const factsStartY = priceY + 90

  drawText(background, fontWhite64, 166, titleY, title, maxTextWidth)
  drawText(background, fontWhite64, 166, priceY, price, maxTextWidth)

  let factY = factsStartY
  if (hours) {
    drawText(background, fontWhite32, 166, factY, `Hours: ${hours}`)
    factY += 48
  }
  drawText(background, fontWhite32, 166, factY, `Condition: ${condition}`)

  drawText(background, fontWhite32, format === 'story' ? 610 : 710, format === 'story' ? 1810 : 1000, '@balloonconsulting')

  return background.getBuffer(JimpMime.jpeg, { quality: 90 })
}

const getPublicJpegSocialImageUrl = async (
  listing: Pick<ListingForInstagram, 'id'>,
  format: 'post' | 'story'
) => {
  const jpegBuffer = await createSocialCardJpegBuffer(listing as ListingForInstagram, format);
  const storagePath = `social-cards/${format}/${listing.id}-${Date.now()}.jpg`;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing Supabase upload configuration')
  }

  const uploadUrl = `${supabaseUrl.replace(/\/$/, '')}/storage/v1/object/listing_images/${storagePath}`

  await httpsRequestBuffer(uploadUrl, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      'content-type': 'image/jpeg',
      'content-length': jpegBuffer.byteLength,
      'x-upsert': 'true',
    },
  }, jpegBuffer)

  return `${supabaseUrl.replace(/\/$/, '')}/storage/v1/object/public/listing_images/${storagePath}`;
}

const formatCaption = (listing: ListingForInstagram, destinationUrl = getListingUrl(listing)) => {
  const details = listing.details || {}
  const facts = [
    `${listing.price.toLocaleString()} ${listing.currency}`,
    listing.location_country,
    listing.condition,
    details.hours ? `${details.hours} hours` : null,
    details.manufacturer,
    details.year ? `Year ${details.year}` : null,
  ].filter(Boolean)

  const description = listing.description
    ? `\n\n${listing.description.substring(0, 450)}${listing.description.length > 450 ? '...' : ''}`
    : ''

  return [
    `${listing.title}`,
    '',
    facts.join(' | '),
    description,
    '',
    `View the full listing: ${destinationUrl}`,
    '',
    '#AeroTrade #HotAirBalloon #Ballooning #Aviation #ForSale',
  ].join('\n')
}

const generateFailureHtml = (failures: SocialFailure[]) => `
  <h2>AeroTrade social publishing needs attention</h2>
  <p>The daily social automation ran, but one or more provider operations failed.</p>
  <ul>
    ${failures.map(failure => `
      <li>
        <strong>${escapeHtml(failure.network)}</strong> for item <code>${escapeHtml(failure.id)}</code><br/>
        Category: ${escapeHtml(failure.category)}<br/>
        ${escapeHtml(failure.error)}<br/>
        Action: ${escapeHtml(failure.action)}
      </li>
    `).join('')}
  </ul>
`;

const generateWarningHtml = (warnings: SocialWarning[]) => `
  <h2>AeroTrade Meta access needs attention</h2>
  <p>Social publishing is still available, but the credential preflight reported:</p>
  <ul>
    ${warnings.map(warning => `
      <li>
        <strong>${escapeHtml(warning.category)}</strong><br/>
        ${escapeHtml(warning.warning)}<br/>
        Action: ${escapeHtml(warning.action)}
      </li>
    `).join('')}
  </ul>
`;

const emailPattern = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const getAdminEmail = () => {
  const configuredEmail = process.env.ADMIN_EMAIL?.trim();

  return configuredEmail && emailPattern.test(configuredEmail)
    ? configuredEmail
    : 'jordi.diaz.casaubon@gmail.com';
};

const getSocialRunDate = (date: Date) => date.toISOString().slice(0, 10);

export async function GET(request: Request) {
  try {
    // 1. Verify Vercel/Netlify CRON Secret
    const requestUrl = new URL(request.url);
    const dryRun = requestUrl.searchParams.get('dryRun') === '1' || requestUrl.searchParams.get('dryRun') === 'true';
    const authHeader = request.headers.get('authorization');
    if (process.env.NODE_ENV === 'production' && !process.env.CRON_SECRET) {
      console.error('CRON_SECRET is missing; Instagram cron cannot authenticate requests.');
      return new NextResponse('Server configuration error', { status: 500 });
    }

    if (
      process.env.NODE_ENV === 'production' && 
      authHeader !== `Bearer ${process.env.CRON_SECRET}`
    ) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Missing Supabase credentials for Cron');
      return new NextResponse('Server configuration error', { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 2. Find listings that are past their 48h premium window OR are active public but haven't been posted to IG
    const now = new Date().toISOString();
    
    let upgradedListingCount = 0;

    if (!dryRun) {
      const { data: upgradedListings, error: upgradeError } = await supabase
        .from('listings')
        .update({ status: 'ACTIVE_PUBLIC' })
        .eq('status', 'ACTIVE_PREMIUM')
        .lte('public_at', now)
        .select('id');

      if (upgradeError) {
        console.error('Error upgrading premium listings to public:', upgradeError);
      } else if (upgradedListings && upgradedListings.length > 0) {
        upgradedListingCount = upgradedListings.length;
        console.log(`Upgraded ${upgradedListingCount} premium listings to public.`);
      }
    }

    const requestedLimit = Number(requestUrl.searchParams.get('limit') || '1');
    const batchLimit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(Math.floor(requestedLimit), 1), 5)
      : 1;

    const { error: facebookColumnError } = await supabase
      .from('listings')
      .select('facebook_posted')
      .limit(1);
    const hasFacebookPostedColumn = !facebookColumnError;

    if (facebookColumnError && facebookColumnError.code !== '42703') {
      console.warn('Unable to inspect facebook_posted column:', facebookColumnError);
    }

    const { error: socialLastPostedAtColumnError } = await supabase
      .from('listings')
      .select('social_last_posted_at')
      .limit(1);
    const hasSocialLastPostedAtColumn = !socialLastPostedAtColumnError;

    if (socialLastPostedAtColumnError && socialLastPostedAtColumnError.code !== '42703') {
      console.warn('Unable to inspect social_last_posted_at column:', socialLastPostedAtColumnError);
    }

    const dayIndex = Math.floor(Date.UTC(
      new Date(now).getUTCFullYear(),
      new Date(now).getUTCMonth(),
      new Date(now).getUTCDate()
    ) / 86_400_000);
    const runDate = getSocialRunDate(new Date(now));
    const socialSlot = getSocialPublishingSlot(dayIndex, requestUrl.searchParams.get('socialType'));

    let instagramCount = 0;
    let instagramStoryCount = 0;
    let instagramCarouselCount = 0;
    let instagramReelCount = 0;
    let facebookCount = 0;
    let facebookStoryCount = 0;
    let facebookVideoCount = 0;
    let skippedLockedCount = 0;
    let duplicatePublicationCount = 0;

    // 4. Publish ready listings or brand interstitials to configured Meta channels.
    const instagramConfigured = canPublishToInstagram();
    const facebookConfigured = canPublishToFacebook();
    const adminEmail = getAdminEmail();
    const failures: SocialFailure[] = [];
    const warnings: SocialWarning[] = [];
    const planned: {
      id: string
      title: string
      type?: string
      networks: string[]
      imageUrl?: string
      storyImageUrl?: string
      carouselImageUrls?: string[]
      videoUrl?: string
    }[] = [];

    const recordFailure = (id: string, network: string, err: unknown) => {
      const classified = classifyMetaError(err);
      failures.push({
        id,
        network,
        error: classified.message,
        category: classified.category,
        retryable: classified.retryable,
        action: classified.action,
      });
      console.error(`Failed to publish ${id} to ${network}:`, err);
    };

    const recordAlertEmailFailure = (id: string, err: unknown) => {
      const error = err instanceof Error ? err.message : 'Unknown email delivery error';
      failures.push({
        id,
        network: 'Operational alert email',
        error,
        category: 'email_delivery',
        retryable: false,
        action: 'Restore RESEND_API_KEY and verify that Resend returns an acceptance identifier.',
      });
      console.error(`Failed to send the operational alert for ${id}:`, err);
    };

    const publishTracked = async (
      input: {
        contentKind: 'listing' | 'brand'
        contentId: string
        contentVariant: string
        network: 'instagram' | 'facebook'
        placement: 'post' | 'story' | 'carousel' | 'reel' | 'video'
        destinationUrl: string
      },
      operation: () => Promise<string>,
    ) => {
      const result = await publishSocialPlacement(supabase, { runDate, ...input }, operation);
      if (result.duplicate) duplicatePublicationCount++;
      if (result.skipped) {
        throw new Error(`Social publication receipt blocked the provider call (${result.reason || 'unknown'}); reconcile the existing receipt instead of creating a duplicate.`);
      }
      return result;
    };

    const providerCheckRequested = requestUrl.searchParams.get('providerCheck') === '1'
      || requestUrl.searchParams.get('providerCheck') === 'true';
    const shouldCheckProvider = !dryRun || providerCheckRequested;
    const metaCredentialHealth = shouldCheckProvider
      ? await getMetaCredentialHealth()
      : null;

    if (metaCredentialHealth?.valid === false) {
      failures.push({
        id: 'meta-credentials',
        network: 'Meta credential preflight',
        error: metaCredentialHealth.warning || 'Meta credentials are invalid.',
        category: metaCredentialHealth.category || (metaCredentialHealth.configured ? 'token_expired' : 'configuration'),
        retryable: Boolean(metaCredentialHealth.retryable),
        action: metaCredentialHealth.action || 'Restore valid Meta production credentials.',
      });
    } else if (metaCredentialHealth?.warning) {
      warnings.push({
        category: metaCredentialHealth.category || 'token_expiring',
        warning: metaCredentialHealth.warning,
        action: metaCredentialHealth.action || 'Review Meta credentials before the next scheduled run.',
      });
    }

    const shouldPublishToInstagram = instagramConfigured && metaCredentialHealth?.valid !== false;
    const shouldPublishToFacebook = facebookConfigured && metaCredentialHealth?.valid !== false;

    if (socialSlot.type !== 'listing' && socialSlot.concept) {
      const concept = socialSlot.concept;
      const brandPublication = {
        id: `brand-${socialSlot.type}-${concept.slug}`,
        title: concept.title,
      };
      const postImageUrl = getBrandPostImageUrl(siteUrl, concept.slug);
      const storyImageUrl = getBrandStoryImageUrl(siteUrl, concept.slug);
      const carouselImageUrls = getBrandCarouselImageUrls(siteUrl, concept.slug);
      const videoUrl = getBrandReelVideoUrl(siteUrl, concept.slug);
      const reelCoverImageUrl = getBrandReelCoverImageUrl(siteUrl, concept.slug);
      const linkUrl = getBrandSocialLinkUrl(siteUrl);
      const brandDestination = (network: 'instagram' | 'facebook', placement: 'post' | 'story' | 'carousel' | 'reel' | 'video') => getAttributedSocialUrl(linkUrl, {
        network,
        placement,
        contentKind: 'brand',
      });
      const brandCaption = (network: 'instagram' | 'facebook', placement: 'post' | 'carousel' | 'reel' | 'video') => [
        concept.caption,
        '',
        `Explore AeroTrade: ${brandDestination(network, placement)}`,
      ].join('\n');
      const pendingNetworks = socialSlot.type === 'brand-post'
        ? ['Instagram post', 'Instagram story', 'Facebook post', 'Facebook story']
        : socialSlot.type === 'brand-carousel'
          ? ['Instagram carousel', 'Instagram story', 'Facebook post', 'Facebook story']
          : socialSlot.type === 'brand-story'
            ? ['Instagram story', 'Facebook story']
            : ['Instagram reel', 'Instagram story', 'Facebook video', 'Facebook story'];

      if (dryRun) {
        planned.push({
          ...brandPublication,
          type: socialSlot.type,
          networks: pendingNetworks,
          imageUrl: postImageUrl,
          storyImageUrl,
          carouselImageUrls,
          videoUrl,
        });

        return NextResponse.json({
          success: failures.length === 0,
          mode: 'dry-run',
          dryRun,
          socialType: socialSlot.type,
          processed: 0,
          planned,
          failures,
          warnings,
          providerHealth: metaCredentialHealth,
        }, { status: failures.length > 0 ? 502 : 200 });
      }

      const publishBrandStories = async () => {
          if (shouldPublishToInstagram) {
            try {
              const result = await publishTracked({
                contentKind: 'brand', contentId: concept.slug, contentVariant: socialSlot.type,
                network: 'instagram', placement: 'story', destinationUrl: brandDestination('instagram', 'story'),
              }, async () => (await publishInstagramImageStory({ imageUrl: storyImageUrl })).mediaId);
              if (result.accepted && !result.duplicate) instagramStoryCount++;
              if (result.skipped) skippedLockedCount++;
              if (result.accepted) console.log(`Published or verified ${brandPublication.id} on Instagram story as ${result.providerId}.`);
            } catch (err) {
              recordFailure(brandPublication.id, 'Instagram story', err);
            }
          } else {
            recordFailure(brandPublication.id, 'Instagram story', new Error('Instagram credentials are not configured'));
          }

          if (shouldPublishToFacebook) {
            try {
              const result = await publishTracked({
                contentKind: 'brand', contentId: concept.slug, contentVariant: socialSlot.type,
                network: 'facebook', placement: 'story', destinationUrl: brandDestination('facebook', 'story'),
              }, async () => (await publishFacebookPhotoStory({ imageUrl: storyImageUrl })).postId);
              if (result.accepted && !result.duplicate) facebookStoryCount++;
              if (result.skipped) skippedLockedCount++;
              if (result.accepted) console.log(`Published or verified ${brandPublication.id} on Facebook story as ${result.providerId}.`);
            } catch (err) {
              recordFailure(brandPublication.id, 'Facebook story', err);
            }
          } else {
            recordFailure(brandPublication.id, 'Facebook story', new Error('Facebook credentials are not configured'));
          }
      };

      if (socialSlot.type === 'brand-post') {
          if (shouldPublishToInstagram) {
            try {
              const result = await publishTracked({
                contentKind: 'brand', contentId: concept.slug, contentVariant: socialSlot.type,
                network: 'instagram', placement: 'post', destinationUrl: brandDestination('instagram', 'post'),
              }, async () => (await publishInstagramImagePost({
                imageUrl: postImageUrl,
                caption: brandCaption('instagram', 'post'),
              })).mediaId);
              if (result.accepted && !result.duplicate) instagramCount++;
              if (result.skipped) skippedLockedCount++;
              if (result.accepted) console.log(`Published or verified ${brandPublication.id} on Instagram as ${result.providerId}.`);
            } catch (err) {
              recordFailure(brandPublication.id, 'Instagram post', err);
            }
          } else {
            recordFailure(brandPublication.id, 'Instagram post', new Error('Instagram credentials are not configured'));
          }

          if (shouldPublishToFacebook) {
            try {
              const destinationUrl = brandDestination('facebook', 'post');
              const result = await publishTracked({
                contentKind: 'brand', contentId: concept.slug, contentVariant: socialSlot.type,
                network: 'facebook', placement: 'post', destinationUrl,
              }, async () => (await publishFacebookPhotoPost({
                imageUrl: postImageUrl,
                caption: brandCaption('facebook', 'post'),
                linkUrl: destinationUrl,
              })).postId);
              if (result.accepted && !result.duplicate) facebookCount++;
              if (result.skipped) skippedLockedCount++;
              if (result.accepted) console.log(`Published or verified ${brandPublication.id} on Facebook as ${result.providerId}.`);
            } catch (err) {
              recordFailure(brandPublication.id, 'Facebook post', err);
            }
          } else {
            recordFailure(brandPublication.id, 'Facebook post', new Error('Facebook credentials are not configured'));
          }

          await publishBrandStories();
        }

      if (socialSlot.type === 'brand-carousel') {
          if (shouldPublishToInstagram) {
            try {
              const result = await publishTracked({
                contentKind: 'brand', contentId: concept.slug, contentVariant: socialSlot.type,
                network: 'instagram', placement: 'carousel', destinationUrl: brandDestination('instagram', 'carousel'),
              }, async () => (await publishInstagramImageCarousel({
                imageUrls: carouselImageUrls,
                caption: brandCaption('instagram', 'carousel'),
              })).mediaId);
              if (result.accepted && !result.duplicate) instagramCarouselCount++;
              if (result.skipped) skippedLockedCount++;
              if (result.accepted) console.log(`Published or verified ${brandPublication.id} on Instagram carousel as ${result.providerId}.`);
            } catch (err) {
              recordFailure(brandPublication.id, 'Instagram carousel', err);
            }
          } else {
            recordFailure(brandPublication.id, 'Instagram carousel', new Error('Instagram credentials are not configured'));
          }

          if (shouldPublishToFacebook) {
            try {
              const destinationUrl = brandDestination('facebook', 'post');
              const result = await publishTracked({
                contentKind: 'brand', contentId: concept.slug, contentVariant: socialSlot.type,
                network: 'facebook', placement: 'post', destinationUrl,
              }, async () => (await publishFacebookPhotoPost({
                imageUrl: carouselImageUrls[0],
                caption: brandCaption('facebook', 'post'),
                linkUrl: destinationUrl,
              })).postId);
              if (result.accepted && !result.duplicate) facebookCount++;
              if (result.skipped) skippedLockedCount++;
              if (result.accepted) console.log(`Published or verified ${brandPublication.id} carousel cover on Facebook as ${result.providerId}.`);
            } catch (err) {
              recordFailure(brandPublication.id, 'Facebook post', err);
            }
          } else {
            recordFailure(brandPublication.id, 'Facebook post', new Error('Facebook credentials are not configured'));
          }

          await publishBrandStories();
        }

      if (socialSlot.type === 'brand-story') {
          await publishBrandStories();
        }

      if (socialSlot.type === 'brand-reel') {
          if (shouldPublishToInstagram) {
            try {
              const result = await publishTracked({
                contentKind: 'brand', contentId: concept.slug, contentVariant: socialSlot.type,
                network: 'instagram', placement: 'reel', destinationUrl: brandDestination('instagram', 'reel'),
              }, async () => (await publishInstagramReel({
                videoUrl,
                caption: brandCaption('instagram', 'reel'),
              })).mediaId);
              if (result.accepted && !result.duplicate) instagramReelCount++;
              if (result.skipped) skippedLockedCount++;
              if (result.accepted) console.log(`Published or verified ${brandPublication.id} on Instagram reel as ${result.providerId}.`);
            } catch (err) {
              recordFailure(brandPublication.id, 'Instagram reel', err);
            }
          } else {
            recordFailure(brandPublication.id, 'Instagram reel', new Error('Instagram credentials are not configured'));
          }

          if (shouldPublishToFacebook) {
            try {
              const destinationUrl = brandDestination('facebook', 'video');
              const result = await publishTracked({
                contentKind: 'brand', contentId: concept.slug, contentVariant: socialSlot.type,
                network: 'facebook', placement: 'video', destinationUrl,
              }, async () => (await publishFacebookVideoPost({
                videoUrl,
                caption: brandCaption('facebook', 'video'),
                linkUrl: destinationUrl,
              })).videoId);
              if (result.accepted && !result.duplicate) facebookVideoCount++;
              if (result.skipped) skippedLockedCount++;
              if (result.accepted) console.log(`Published or verified ${brandPublication.id} on Facebook video as ${result.providerId}.`);
            } catch (err) {
              recordFailure(brandPublication.id, 'Facebook video', err);

              try {
                const destinationUrl = brandDestination('facebook', 'post');
                const result = await publishTracked({
                  contentKind: 'brand', contentId: concept.slug, contentVariant: `${socialSlot.type}-fallback`,
                  network: 'facebook', placement: 'post', destinationUrl,
                }, async () => (await publishFacebookPhotoPost({
                  imageUrl: reelCoverImageUrl,
                  caption: brandCaption('facebook', 'post'),
                  linkUrl: destinationUrl,
                })).postId);
                if (result.accepted && !result.duplicate) facebookCount++;
                if (result.skipped) skippedLockedCount++;
                if (result.accepted) console.log(`Published or verified ${brandPublication.id} reel cover fallback on Facebook as ${result.providerId}.`);
              } catch (fallbackErr) {
                recordFailure(brandPublication.id, 'Facebook reel cover fallback', fallbackErr);
              }
            }
          } else {
            recordFailure(brandPublication.id, 'Facebook video', new Error('Facebook credentials are not configured'));
          }

          await publishBrandStories();
      }

      if (!dryRun && failures.length > 0) {
        try {
          const alertResult = await sendEmail(
            adminEmail,
            'AeroTrade social publishing failed',
            generateFailureHtml(failures)
          );
          if (!alertResult.success) {
            recordAlertEmailFailure(brandPublication.id, alertResult.error);
          }
        } catch (emailError) {
          console.error('Unable to send social publishing failure alert:', emailError);
          recordAlertEmailFailure(brandPublication.id, emailError);
        }
      } else if (!dryRun && warnings.length > 0) {
        try {
          const alertResult = await sendEmail(
            adminEmail,
            'AeroTrade Meta access expires soon',
            generateWarningHtml(warnings)
          );
          if (!alertResult.success) {
            recordAlertEmailFailure(brandPublication.id, alertResult.error);
          }
        } catch (emailError) {
          console.error('Unable to send Meta credential warning:', emailError);
          recordAlertEmailFailure(brandPublication.id, emailError);
        }
      }

      return NextResponse.json({
        success: failures.length === 0,
        mode: shouldPublishToInstagram || shouldPublishToFacebook ? 'api' : 'email-reminder',
        dryRun,
        socialType: socialSlot.type,
        processed: instagramCount + instagramStoryCount + instagramCarouselCount + instagramReelCount + facebookCount + facebookStoryCount + facebookVideoCount,
        instagramPublished: instagramCount,
        instagramStoriesPublished: instagramStoryCount,
        instagramCarouselsPublished: instagramCarouselCount,
        instagramReelsPublished: instagramReelCount,
        facebookPublished: facebookCount,
        facebookStoriesPublished: facebookStoryCount,
        facebookVideosPublished: facebookVideoCount,
        upgradedExpiredPremiumListings: upgradedListingCount,
        facebookTrackingColumn: hasFacebookPostedColumn,
        socialRotationColumn: hasSocialLastPostedAtColumn,
        skippedLocked: skippedLockedCount,
        duplicatePlacements: duplicatePublicationCount,
        planned,
        failures,
        warnings,
        providerHealth: metaCredentialHealth,
      }, { status: failures.length > 0 ? 502 : 200 });
    }

    // 3. Find public, unsold listings ready for rotating daily social publication.
    const { data: listingsForIg, error: igError } = await supabase
      .from('listings')
      .select('*, images(url, is_primary), users(email, name)')
      .in('status', ['ACTIVE_PUBLIC', 'ACTIVE_PREMIUM'])
      .lte('public_at', now)
      .order('public_at', { ascending: true })
      .limit(100);

    if (igError) {
      console.error('Error fetching listings for Instagram:', igError);
      return new NextResponse('Error fetching listings', { status: 500 });
    }

    if (!listingsForIg || listingsForIg.length === 0) {
      return NextResponse.json({
        success: failures.length === 0,
        message: 'No active listings require social publication at this time.',
        failures,
        warnings,
        providerHealth: metaCredentialHealth,
      }, { status: failures.length > 0 ? 502 : 200 });
    }

    const promotedListingsForIg = (listingsForIg as SocialListing[])
      .filter((listing) => isPromotedListing(listing.details));

    if (promotedListingsForIg.length === 0) {
      return NextResponse.json({
        success: failures.length === 0,
        message: 'No promoted listings require social publication at this time.',
        failures,
        warnings,
        providerHealth: metaCredentialHealth,
      }, { status: failures.length > 0 ? 502 : 200 });
    }

    const startIndex = dayIndex % promotedListingsForIg.length;
    const rotatingListings = Array.from(
      { length: Math.min(batchLimit, promotedListingsForIg.length) },
      (_, offset) => promotedListingsForIg[(startIndex + offset) % promotedListingsForIg.length]
    );

    for (const listing of rotatingListings as SocialListing[]) {
      const plannedImageUrl = getSocialCardUrl(siteUrl, listing.id, 'post');
      const plannedStoryImageUrl = getSocialCardUrl(siteUrl, listing.id, 'story');
      const listingDestination = (network: 'instagram' | 'facebook', placement: 'post' | 'story') => getAttributedSocialUrl(getListingUrl(listing), {
        network,
        placement,
        contentKind: 'listing',
      });
      const pendingNetworks = [
        'Instagram post',
        'Instagram story',
        'Facebook post',
        'Facebook story',
      ];

      if (dryRun) {
        planned.push({
          id: listing.id,
          title: listing.title,
          networks: pendingNetworks,
          imageUrl: plannedImageUrl,
          storyImageUrl: plannedStoryImageUrl,
        });
        continue;
      }

      try {
        const imageUrl = await getPublicJpegSocialImageUrl(listing, 'post');
        const storyImageUrl = await getPublicJpegSocialImageUrl(listing, 'story');
        let publishedToAnyNetwork = false;
        let publishedToInstagram = false;
        let publishedToFacebook = false;

        if (shouldPublishToInstagram) {
          try {
            const destinationUrl = listingDestination('instagram', 'post');
            const result = await publishTracked({
              contentKind: 'listing', contentId: listing.id, contentVariant: 'listing',
              network: 'instagram', placement: 'post', destinationUrl,
            }, async () => (await publishInstagramImagePost({
              imageUrl,
              caption: formatCaption(listing, destinationUrl),
            })).mediaId);
            if (result.accepted && !result.duplicate) instagramCount++;
            if (result.skipped) skippedLockedCount++;
            publishedToAnyNetwork ||= result.accepted;
            publishedToInstagram ||= result.accepted;
            if (result.accepted) console.log(`Published or verified listing ${listing.id} on Instagram as ${result.providerId}.`);
          } catch (err) {
            recordFailure(listing.id, 'Instagram post', err);
          }

          try {
            const result = await publishTracked({
              contentKind: 'listing', contentId: listing.id, contentVariant: 'listing',
              network: 'instagram', placement: 'story', destinationUrl: listingDestination('instagram', 'story'),
            }, async () => (await publishInstagramImageStory({ imageUrl: storyImageUrl })).mediaId);
            if (result.accepted && !result.duplicate) instagramStoryCount++;
            if (result.skipped) skippedLockedCount++;
            publishedToAnyNetwork ||= result.accepted;
            publishedToInstagram ||= result.accepted;
            if (result.accepted) console.log(`Published or verified listing ${listing.id} on Instagram story as ${result.providerId}.`);
          } catch (err) {
            recordFailure(listing.id, 'Instagram story', err);
          }
        } else {
          recordFailure(listing.id, 'Instagram post + story', new Error('Instagram credentials are not configured'));
        }

        if (shouldPublishToFacebook) {
          try {
            const destinationUrl = listingDestination('facebook', 'post');
            const result = await publishTracked({
              contentKind: 'listing', contentId: listing.id, contentVariant: 'listing',
              network: 'facebook', placement: 'post', destinationUrl,
            }, async () => (await publishFacebookPhotoPost({
              imageUrl,
              caption: formatCaption(listing, destinationUrl),
              linkUrl: destinationUrl,
            })).postId);
            if (result.accepted && !result.duplicate) facebookCount++;
            if (result.skipped) skippedLockedCount++;
            publishedToAnyNetwork ||= result.accepted;
            publishedToFacebook ||= result.accepted;
            if (result.accepted) console.log(`Published or verified listing ${listing.id} on Facebook as ${result.providerId}.`);
          } catch (err) {
            recordFailure(listing.id, 'Facebook post', err);
          }

          try {
            const result = await publishTracked({
              contentKind: 'listing', contentId: listing.id, contentVariant: 'listing',
              network: 'facebook', placement: 'story', destinationUrl: listingDestination('facebook', 'story'),
            }, async () => (await publishFacebookPhotoStory({ imageUrl: storyImageUrl })).postId);
            if (result.accepted && !result.duplicate) facebookStoryCount++;
            if (result.skipped) skippedLockedCount++;
            publishedToAnyNetwork ||= result.accepted;
            publishedToFacebook ||= result.accepted;
            if (result.accepted) console.log(`Published or verified listing ${listing.id} on Facebook story as ${result.providerId}.`);
          } catch (err) {
            recordFailure(listing.id, 'Facebook story', err);
          }
        } else {
          recordFailure(listing.id, 'Facebook post + story', new Error('Facebook credentials are not configured'));
        }

        if (publishedToAnyNetwork) {
          const updatePayload: {
            instagram_posted?: boolean
            facebook_posted?: boolean
            social_last_posted_at?: string
          } = {};

          if (publishedToInstagram) {
            updatePayload.instagram_posted = true;
          }

          if (hasFacebookPostedColumn && publishedToFacebook) {
            updatePayload.facebook_posted = true;
          }

          if (hasSocialLastPostedAtColumn) {
            updatePayload.social_last_posted_at = now;
          }

          await supabase
            .from('listings')
            .update(updatePayload)
            .eq('id', listing.id);
        }
      } catch (err) {
        recordFailure(listing.id, 'image-generation', err);
        console.error(`Failed to process Instagram publication for listing ${listing.id}`, err);
      }
    }

    if (!dryRun && failures.length > 0) {
      try {
        const alertResult = await sendEmail(
          adminEmail,
          'AeroTrade social publishing failed',
          generateFailureHtml(failures)
        );
        if (!alertResult.success) {
          recordAlertEmailFailure('social-run', alertResult.error);
        }
      } catch (emailError) {
        console.error('Unable to send social publishing failure alert:', emailError);
        recordAlertEmailFailure('social-run', emailError);
      }
    } else if (!dryRun && warnings.length > 0) {
      try {
        const alertResult = await sendEmail(
          adminEmail,
          'AeroTrade Meta access expires soon',
          generateWarningHtml(warnings)
        );
        if (!alertResult.success) {
          recordAlertEmailFailure('social-run', alertResult.error);
        }
      } catch (emailError) {
        console.error('Unable to send Meta credential warning:', emailError);
        recordAlertEmailFailure('social-run', emailError);
      }
    }

    return NextResponse.json({ 
      success: failures.length === 0,
      mode: shouldPublishToInstagram || shouldPublishToFacebook ? 'api' : 'email-reminder',
      dryRun,
      batchLimit,
      processed: instagramCount + instagramStoryCount + facebookCount + facebookStoryCount,
      instagramPublished: instagramCount,
      instagramStoriesPublished: instagramStoryCount,
      facebookPublished: facebookCount,
      facebookStoriesPublished: facebookStoryCount,
      upgradedExpiredPremiumListings: upgradedListingCount,
      facebookTrackingColumn: hasFacebookPostedColumn,
      socialRotationColumn: hasSocialLastPostedAtColumn,
      skippedLocked: skippedLockedCount,
      duplicatePlacements: duplicatePublicationCount,
      planned,
      failures,
      warnings,
      providerHealth: metaCredentialHealth,
      message: shouldPublishToInstagram || shouldPublishToFacebook
        ? `Published ${instagramCount} Instagram posts, ${instagramStoryCount} Instagram stories, ${facebookCount} Facebook posts, and ${facebookStoryCount} Facebook stories.`
        : 'Meta credentials are missing; sent admin reminders instead.'
    }, { status: failures.length > 0 ? 502 : 200 });

  } catch (error) {
    console.error('Instagram cron error:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
