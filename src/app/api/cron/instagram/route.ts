import { NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
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
  publishFacebookVideoPost,
  publishInstagramImageCarousel,
  publishFacebookPhotoPost,
  publishFacebookPhotoStory,
  publishInstagramImagePost,
  publishInstagramImageStory,
  publishInstagramReel,
} from '@/utils/meta-social';
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

const formatCaption = (listing: ListingForInstagram) => {
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
    `View the full listing: ${getListingUrl(listing)}`,
    '',
    '#AeroTrade #HotAirBalloon #Ballooning #Aviation #ForSale',
  ].join('\n')
}

const generateFailureHtml = (failures: { id: string; network: string; error: string }[]) => `
  <h2>AeroTrade social publishing needs attention</h2>
  <p>The daily social automation ran, but Meta rejected one or more publication requests.</p>
  <ul>
    ${failures.map(failure => `
      <li>
        <strong>${failure.network}</strong> for listing <code>${failure.id}</code><br/>
        ${failure.error}
      </li>
    `).join('')}
  </ul>
  <p>Refresh the Meta long-lived token and update the production environment variables before the next scheduled run.</p>
`;

const emailPattern = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const getAdminEmail = () => {
  const configuredEmail = process.env.ADMIN_EMAIL?.trim();

  return configuredEmail && emailPattern.test(configuredEmail)
    ? configuredEmail
    : 'jordi.diaz.casaubon@gmail.com';
};

const getSocialRunDate = (date: Date) => date.toISOString().slice(0, 10);

const tryCreateDailySocialLock = async (
  supabase: SupabaseClient,
  listing: Pick<ListingForInstagram, 'id' | 'title'>,
  runDate: string,
) => {
  const lockPath = `social-locks/${runDate}/${listing.id}.json`;
  const lockBody = Buffer.from(JSON.stringify({
    listingId: listing.id,
    title: listing.title,
    runDate,
    createdAt: new Date().toISOString(),
  }));

  const { error } = await supabase.storage
    .from('listing_images')
    .upload(lockPath, lockBody, {
      contentType: 'application/json',
      upsert: false,
    });

  if (!error) {
    return true;
  }

  const duplicateLock = /already exists|duplicate|resource already exists/i.test(error.message);

  if (duplicateLock) {
    console.log(`Skipping listing ${listing.id}; daily social lock already exists for ${runDate}.`);
    return false;
  }

  throw error;
};

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

    // 4. Publish ready listings or brand interstitials to configured Meta channels.
    const shouldPublishToInstagram = canPublishToInstagram();
    const shouldPublishToFacebook = canPublishToFacebook();
    const adminEmail = getAdminEmail();
    const failures: { id: string; network: string; error: string }[] = [];
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
      const error = err instanceof Error ? err.message : 'Unknown error';
      failures.push({ id, network, error });
      console.error(`Failed to publish ${id} to ${network}:`, err);
    };

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
      const brandCaption = concept.caption;
      const pendingNetworks = socialSlot.type === 'brand-post'
        ? ['Instagram post', 'Facebook post']
        : socialSlot.type === 'brand-carousel'
          ? ['Instagram carousel', 'Facebook post']
          : socialSlot.type === 'brand-story'
            ? ['Instagram story', 'Facebook story']
            : ['Instagram reel', 'Facebook video'];

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
          success: true,
          mode: 'dry-run',
          dryRun,
          socialType: socialSlot.type,
          processed: 0,
          planned,
          failures,
        });
      }

      const lockCreated = await tryCreateDailySocialLock(supabase, brandPublication, runDate);

      if (!lockCreated) {
        skippedLockedCount++;
      } else {
        if (socialSlot.type === 'brand-post') {
          if (shouldPublishToInstagram) {
            try {
              const instagramPost = await publishInstagramImagePost({
                imageUrl: postImageUrl,
                caption: brandCaption,
              });

              instagramCount++;
              console.log(`Published ${brandPublication.id} to Instagram as media ${instagramPost.mediaId}.`);
            } catch (err) {
              recordFailure(brandPublication.id, 'Instagram post', err);
            }
          } else {
            recordFailure(brandPublication.id, 'Instagram post', new Error('Instagram credentials are not configured'));
          }

          if (shouldPublishToFacebook) {
            try {
              const facebookPost = await publishFacebookPhotoPost({
                imageUrl: postImageUrl,
                caption: brandCaption,
                linkUrl,
              });

              facebookCount++;
              console.log(`Published ${brandPublication.id} to Facebook as post ${facebookPost.postId}.`);
            } catch (err) {
              recordFailure(brandPublication.id, 'Facebook post', err);
            }
          } else {
            recordFailure(brandPublication.id, 'Facebook post', new Error('Facebook credentials are not configured'));
          }
        }

        if (socialSlot.type === 'brand-carousel') {
          if (shouldPublishToInstagram) {
            try {
              const instagramCarousel = await publishInstagramImageCarousel({
                imageUrls: carouselImageUrls,
                caption: brandCaption,
              });

              instagramCarouselCount++;
              console.log(`Published ${brandPublication.id} to Instagram as carousel ${instagramCarousel.mediaId}.`);
            } catch (err) {
              recordFailure(brandPublication.id, 'Instagram carousel', err);
            }
          } else {
            recordFailure(brandPublication.id, 'Instagram carousel', new Error('Instagram credentials are not configured'));
          }

          if (shouldPublishToFacebook) {
            try {
              const facebookPost = await publishFacebookPhotoPost({
                imageUrl: carouselImageUrls[0],
                caption: brandCaption,
                linkUrl,
              });

              facebookCount++;
              console.log(`Published ${brandPublication.id} carousel cover to Facebook as post ${facebookPost.postId}.`);
            } catch (err) {
              recordFailure(brandPublication.id, 'Facebook post', err);
            }
          } else {
            recordFailure(brandPublication.id, 'Facebook post', new Error('Facebook credentials are not configured'));
          }
        }

        if (socialSlot.type === 'brand-story') {
          if (shouldPublishToInstagram) {
            try {
              const instagramStory = await publishInstagramImageStory({
                imageUrl: storyImageUrl,
              });

              instagramStoryCount++;
              console.log(`Published ${brandPublication.id} to Instagram story as media ${instagramStory.mediaId}.`);
            } catch (err) {
              recordFailure(brandPublication.id, 'Instagram story', err);
            }
          } else {
            recordFailure(brandPublication.id, 'Instagram story', new Error('Instagram credentials are not configured'));
          }

          if (shouldPublishToFacebook) {
            try {
              const facebookStory = await publishFacebookPhotoStory({
                imageUrl: storyImageUrl,
              });

              facebookStoryCount++;
              console.log(`Published ${brandPublication.id} to Facebook story as post ${facebookStory.postId}.`);
            } catch (err) {
              recordFailure(brandPublication.id, 'Facebook story', err);
            }
          } else {
            recordFailure(brandPublication.id, 'Facebook story', new Error('Facebook credentials are not configured'));
          }
        }

        if (socialSlot.type === 'brand-reel') {
          if (shouldPublishToInstagram) {
            try {
              const instagramReel = await publishInstagramReel({
                videoUrl,
                caption: brandCaption,
              });

              instagramReelCount++;
              console.log(`Published ${brandPublication.id} to Instagram as reel ${instagramReel.mediaId}.`);
            } catch (err) {
              recordFailure(brandPublication.id, 'Instagram reel', err);
            }
          } else {
            recordFailure(brandPublication.id, 'Instagram reel', new Error('Instagram credentials are not configured'));
          }

          if (shouldPublishToFacebook) {
            try {
              const facebookVideo = await publishFacebookVideoPost({
                videoUrl,
                caption: brandCaption,
                linkUrl,
              });

              facebookVideoCount++;
              console.log(`Published ${brandPublication.id} to Facebook as video ${facebookVideo.videoId}.`);
            } catch (err) {
              recordFailure(brandPublication.id, 'Facebook video', err);

              try {
                const fallbackPost = await publishFacebookPhotoPost({
                  imageUrl: reelCoverImageUrl,
                  caption: brandCaption,
                  linkUrl,
                });

                facebookCount++;
                console.log(`Published ${brandPublication.id} reel cover to Facebook as fallback post ${fallbackPost.postId}.`);
              } catch (fallbackErr) {
                recordFailure(brandPublication.id, 'Facebook reel cover fallback', fallbackErr);
              }
            }
          } else {
            recordFailure(brandPublication.id, 'Facebook video', new Error('Facebook credentials are not configured'));
          }
        }
      }

      if (!dryRun && failures.length > 0) {
        try {
          await sendEmail(
            adminEmail,
            'AeroTrade social publishing failed',
            generateFailureHtml(failures)
          );
        } catch (emailError) {
          console.error('Unable to send social publishing failure alert:', emailError);
        }
      }

      return NextResponse.json({
        success: true,
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
        planned,
        failures,
      });
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
      return NextResponse.json({ message: 'No active listings require social publication at this time.' });
    }

    const promotedListingsForIg = (listingsForIg as SocialListing[])
      .filter((listing) => isPromotedListing(listing.details));

    if (promotedListingsForIg.length === 0) {
      return NextResponse.json({ message: 'No promoted listings require social publication at this time.' });
    }

    const startIndex = dayIndex % promotedListingsForIg.length;
    const rotatingListings = Array.from(
      { length: Math.min(batchLimit, promotedListingsForIg.length) },
      (_, offset) => promotedListingsForIg[(startIndex + offset) % promotedListingsForIg.length]
    );

    for (const listing of rotatingListings as SocialListing[]) {
      const plannedImageUrl = getSocialCardUrl(siteUrl, listing.id, 'post');
      const plannedStoryImageUrl = getSocialCardUrl(siteUrl, listing.id, 'story');
      const caption = formatCaption(listing);
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

      const lockCreated = await tryCreateDailySocialLock(supabase, listing, runDate);

      if (!lockCreated) {
        skippedLockedCount++;
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
            const instagramPost = await publishInstagramImagePost({
              imageUrl,
              caption,
            });

            instagramCount++;
            publishedToAnyNetwork = true;
            publishedToInstagram = true;
            console.log(`Published listing ${listing.id} to Instagram as media ${instagramPost.mediaId}.`);
          } catch (err) {
            recordFailure(listing.id, 'Instagram post', err);
          }

          try {
            const instagramStory = await publishInstagramImageStory({
              imageUrl: storyImageUrl,
            });

            instagramStoryCount++;
            publishedToAnyNetwork = true;
            publishedToInstagram = true;
            console.log(`Published listing ${listing.id} to Instagram story as media ${instagramStory.mediaId}.`);
          } catch (err) {
            recordFailure(listing.id, 'Instagram story', err);
          }
        } else {
          recordFailure(listing.id, 'Instagram post + story', new Error('Instagram credentials are not configured'));
        }

        if (shouldPublishToFacebook) {
          try {
            const facebookPost = await publishFacebookPhotoPost({
              imageUrl,
              caption,
              linkUrl: getListingUrl(listing),
            });

            facebookCount++;
            publishedToAnyNetwork = true;
            publishedToFacebook = true;
            console.log(`Published listing ${listing.id} to Facebook as post ${facebookPost.postId}.`);
          } catch (err) {
            recordFailure(listing.id, 'Facebook post', err);
          }

          try {
            const facebookStory = await publishFacebookPhotoStory({
              imageUrl: storyImageUrl,
            });

            facebookStoryCount++;
            publishedToAnyNetwork = true;
            publishedToFacebook = true;
            console.log(`Published listing ${listing.id} to Facebook story as post ${facebookStory.postId}.`);
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
        const error = err instanceof Error ? err.message : 'Unknown error';
        failures.push({ id: listing.id, network: 'image-generation', error });
        console.error(`Failed to process Instagram publication for listing ${listing.id}`, err);
      }
    }

    if (!dryRun && failures.length > 0) {
      try {
        await sendEmail(
          adminEmail,
          'AeroTrade social publishing failed',
          generateFailureHtml(failures)
        );
      } catch (emailError) {
        console.error('Unable to send social publishing failure alert:', emailError);
      }
    }

    return NextResponse.json({ 
      success: true, 
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
      planned,
      failures,
      message: shouldPublishToInstagram || shouldPublishToFacebook
        ? `Published ${instagramCount} Instagram posts, ${instagramStoryCount} Instagram stories, ${facebookCount} Facebook posts, and ${facebookStoryCount} Facebook stories.`
        : 'Meta credentials are missing; sent admin reminders instead.'
    });

  } catch (error) {
    console.error('Instagram cron error:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
