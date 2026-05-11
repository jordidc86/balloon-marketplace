import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

type NewsletterImage = {
  url: string
  is_primary?: boolean
}

type NewsletterListing = {
  id: string
  title: string
  price: number
  currency: string
  location_country: string
  condition: string
  images?: NewsletterImage[]
}

type NewsletterUser = {
  email: string | null
}

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://aerotrade.app';
const fallbackImageUrl = 'https://images.unsplash.com/photo-1543326727-cf6c39e8f84c?q=80&w=600&auto=format&fit=crop';

const escapeHtml = (value: unknown) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const getPrimaryImageUrl = (listing: NewsletterListing) => {
  const primaryImage = listing.images?.find((image) => image.is_primary);
  return primaryImage?.url || listing.images?.[0]?.url || fallbackImageUrl;
};

const formatListingPrice = (listing: NewsletterListing) => {
  if (Number(listing.price) === 0) {
    return 'Price on request';
  }

  return `${Number(listing.price).toLocaleString()} ${listing.currency}`;
};

// Helper to generate the HTML for the email
const generateNewsletterHtml = (listings: NewsletterListing[]) => {
  const listingsHtml = listings.map(listing => {
    const imageUrl = getPrimaryImageUrl(listing);
    const listingUrl = `${siteUrl}/catalog/${listing.id}`;
    
    return `
      <div style="margin-bottom: 32px; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; font-family: sans-serif;">
        <img src="${escapeHtml(imageUrl)}" style="width: 100%; height: 250px; object-fit: cover;" alt="${escapeHtml(listing.title)}" />
        <div style="padding: 24px;">
          <h2 style="margin: 0 0 8px 0; font-size: 20px; color: #0f172a;">${escapeHtml(listing.title)}</h2>
          <p style="margin: 0 0 16px 0; font-size: 24px; font-weight: bold; color: #2563eb;">${escapeHtml(formatListingPrice(listing))}</p>
          <div style="color: #64748b; font-size: 14px; margin-bottom: 16px;">
            <p style="margin: 0 0 4px 0;">Location: ${escapeHtml(listing.location_country)}</p>
            <p style="margin: 0;">Condition: ${escapeHtml(listing.condition)}</p>
          </div>
          <a href="${escapeHtml(listingUrl)}" style="display: inline-block; background-color: #2563eb; color: white; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: bold;">View Listing</a>
        </div>
      </div>
    `;
  }).join('');

  return `
    <html>
      <body style="margin: 0; padding: 40px 20px; background-color: #f8fafc; font-family: sans-serif;">
        <div style="max-width: 600px; margin: 0 auto; background-color: white; padding: 40px; border-radius: 16px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
          <div style="text-align: center; margin-bottom: 40px;">
            <h1 style="margin: 0; color: #0f172a; font-size: 32px;">AEROTRADE</h1>
            <p style="margin: 8px 0 0 0; color: #64748b; font-size: 18px;">Bi-Weekly Balloon Market Update</p>
          </div>
          
          <p style="font-size: 16px; color: #334155; line-height: 1.6; margin-bottom: 32px;">
            Here are the latest hot air balloons and equipment currently available on AeroTrade.
          </p>
          <p style="font-size: 16px; color: #334155; line-height: 1.6; margin-bottom: 32px;">
            These public listings are ready to view now.
          </p>

          ${listingsHtml}

          <div style="text-align: center; margin-top: 48px; padding-top: 32px; border-top: 1px solid #e2e8f0;">
            <p style="color: #94a3b8; font-size: 14px;">
              You received this email because you are a registered user of the AeroTrade Marketplace.
            </p>
            <p style="color: #94a3b8; font-size: 14px; margin-top: 8px;">
              &copy; ${new Date().getFullYear()} AeroTrade. All rights reserved.
            </p>
          </div>
        </div>
      </body>
    </html>
  `;
};

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const dryRun = url.searchParams.get('dryRun') === 'true';
    const testEmail = url.searchParams.get('testEmail');
    const daysParam = url.searchParams.get('days');
    const mixWithLatest = url.searchParams.get('mix') === 'true';

    // 1. Verify Vercel CRON Secret
    const authHeader = request.headers.get('authorization');
    if (
      process.env.NODE_ENV === 'production' && 
      authHeader !== `Bearer ${process.env.CRON_SECRET}`
    ) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    // Initialize Supabase Admin Client (to bypass RLS)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Missing Supabase credentials for Cron');
      return new NextResponse('Server configuration error', { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 2. Make expired Premium-window listings public before building the newsletter.
    const now = new Date().toISOString();
    const days = daysParam ? Number(daysParam) : null;

    const { data: upgradedListings, error: upgradeError } = await supabase
      .from('listings')
      .update({ status: 'ACTIVE_PUBLIC' })
      .eq('status', 'ACTIVE_PREMIUM')
      .lte('public_at', now)
      .select('id, title');

    if (upgradeError) {
      console.error('Error upgrading premium listings before newsletter:', upgradeError);
      return new NextResponse('Error upgrading listings', { status: 500 });
    }

    // 3. Fetch latest public listings. Optionally restrict with ?days=15, ?days=30, etc.

    const baseListingsQuery = () => supabase
      .from('listings')
      .select('*, images(url, is_primary)')
      .eq('status', 'ACTIVE_PUBLIC')
      .lte('public_at', now)
      .order('created_at', { ascending: false });

    let listingsQuery = baseListingsQuery().limit(10); // Keep email size reasonable

    if (days && Number.isFinite(days) && days > 0) {
      const since = new Date();
      since.setDate(since.getDate() - days);
      listingsQuery = listingsQuery.gte('created_at', since.toISOString());
    }

    const { data: primaryListings, error: listingsError } = await listingsQuery;

    if (listingsError) {
      console.error('Error fetching listings:', listingsError);
      return new NextResponse('Error fetching listings', { status: 500 });
    }

    let recentListings = (primaryListings || []) as NewsletterListing[];
    const primaryListingCount = recentListings.length;

    if (mixWithLatest && recentListings.length < 10) {
      const existingIds = new Set(recentListings.map((listing) => listing.id));
      const { data: fallbackListings, error: fallbackError } = await baseListingsQuery().limit(10);

      if (fallbackError) {
        console.error('Error fetching fallback listings:', fallbackError);
        return new NextResponse('Error fetching fallback listings', { status: 500 });
      }

      const fallbackMix = ((fallbackListings || []) as NewsletterListing[])
        .filter((listing) => !existingIds.has(listing.id));

      recentListings = [...recentListings, ...fallbackMix].slice(0, 10);
    }

    if (!recentListings || recentListings.length === 0) {
      return NextResponse.json({ message: 'No public listings. Skip sending email.' });
    }

    // 4. Fetch subscriber emails
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('email');

    if (usersError) {
      console.error('Error fetching users:', usersError);
      return new NextResponse('Error fetching users', { status: 500 });
    }

    if (!users || users.length === 0) {
       return NextResponse.json({ message: 'No users to send email to.' });
    }

    const recipientEmails = testEmail
      ? [testEmail]
      : Array.from(new Set((users as NewsletterUser[]).map(user => user.email).filter(Boolean))) as string[];

    if (dryRun) {
      return NextResponse.json({
        success: true,
        dryRun: true,
        recipients: recipientEmails.length,
        daysFilter: days,
        mixWithLatest,
        primaryListingCount,
        upgradedExpiredPremiumListings: upgradedListings?.length || 0,
        listings: recentListings.map(listing => ({
          id: listing.id,
          title: listing.title,
          imageUrl: getPrimaryImageUrl(listing),
        })),
      });
    }

    // 5. Generate HTML and dispatch
    const htmlBody = generateNewsletterHtml(recentListings);
    
    // Prepare emails for batch sending
    const emailBatch = recipientEmails
      .map(email => ({
        to: email,
        subject: 'New Hot Air Balloons on AeroTrade - Bi-Weekly Update',
        html: htmlBody
      }));

    let sentCount = 0;
    
    if (emailBatch.length > 0) {
      // Import sendEmailBatch from our resend utility
      const { sendEmailBatch } = await import('@/utils/resend');
      
      const result = await sendEmailBatch(emailBatch);
      if (result.success) {
        sentCount = emailBatch.length;
      } else {
        console.error('Failed to send newsletter batch', result.error);
        return new NextResponse('Error sending newsletter batch', { status: 500 });
      }
    }

    return NextResponse.json({ 
      success: true, 
      message: `Newsletter sent to ${sentCount} users detailing ${recentListings.length} listings.` 
    });

  } catch (error) {
    console.error('Newsletter cron error:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
