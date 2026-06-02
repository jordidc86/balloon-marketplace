import type { SupabaseClient } from '@supabase/supabase-js';
import { sendEmailBatch } from '@/utils/resend';
import { escapeHtml } from '@/utils/html';
import { siteUrl } from '@/utils/site';

type ListingImage = {
  url: string
  is_primary?: boolean
}

type PremiumAlertListing = {
  id: string
  title: string
  category: string
  price: number
  currency: string
  images?: ListingImage[]
}

type PremiumAlertUser = {
  email: string | null
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const normalizeEmail = (email: string | null) => {
  const normalizedEmail = email?.trim().toLowerCase();
  return normalizedEmail && emailPattern.test(normalizedEmail) ? normalizedEmail : null;
};

const formatPrice = (listing: PremiumAlertListing) =>
  `${Number(listing.price).toLocaleString('en-US')} ${listing.currency}`;

const getPrimaryImageUrl = (listing: PremiumAlertListing) => {
  const primaryImage = listing.images?.find((image) => image.is_primary);
  return primaryImage?.url || listing.images?.[0]?.url || null;
};

const generatePremiumAlertHtml = (listing: PremiumAlertListing) => {
  const imageUrl = getPrimaryImageUrl(listing);
  const listingUrl = `${siteUrl}/catalog/${listing.id}`;

  return `
    <html>
      <body style="margin: 0; padding: 36px 18px; background: #f8fafc; font-family: Arial, sans-serif;">
        <div style="max-width: 620px; margin: 0 auto; background: #ffffff; border-radius: 14px; padding: 36px;">
          <h1 style="margin: 0 0 8px; color: #0f172a; font-size: 30px;">AeroTrade Premium Alert</h1>
          <p style="margin: 0 0 28px; color: #475569; font-size: 16px; line-height: 1.55;">
            A new Premium-exclusive listing is available before it becomes public.
          </p>
          <div style="border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
            ${imageUrl ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(listing.title)}" style="display: block; width: 100%; height: 240px; object-fit: cover;" />` : ''}
            <div style="padding: 22px;">
              <p style="margin: 0 0 8px; color: #2563eb; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em;">Premium exclusive</p>
              <h2 style="margin: 0 0 8px; color: #0f172a; font-size: 22px;">${escapeHtml(listing.title)}</h2>
              <p style="margin: 0 0 6px; color: #475569; font-size: 14px;">Category: ${escapeHtml(listing.category)}</p>
              <p style="margin: 0 0 16px; color: #0f172a; font-size: 20px; font-weight: 700;">${escapeHtml(formatPrice(listing))}</p>
              <a href="${escapeHtml(listingUrl)}" style="display: inline-block; background: #2563eb; color: #fff; text-decoration: none; padding: 12px 18px; border-radius: 6px; font-weight: 700;">View premium listing</a>
            </div>
          </div>
          <p style="margin: 30px 0 0; color: #94a3b8; font-size: 13px; line-height: 1.5;">
            You received this because you are an AeroTrade Premium member.
          </p>
        </div>
      </body>
    </html>
  `;
};

export async function sendPremiumListingAlert(supabase: SupabaseClient, listingId: string) {
  const { data: listing, error: listingError } = await supabase
    .from('listings')
    .select('id, title, category, price, currency, images(url, is_primary)')
    .eq('id', listingId)
    .eq('status', 'ACTIVE_PREMIUM')
    .single();

  if (listingError || !listing) {
    throw new Error(`Premium listing not found for alert: ${listingId}`);
  }

  const { data: premiumUsers, error: usersError } = await supabase
    .from('users')
    .select('email')
    .eq('is_premium', true);

  if (usersError || !premiumUsers) {
    throw new Error('Failed to fetch premium users for listing alert');
  }

  const recipients = Array.from(new Set(
    (premiumUsers as PremiumAlertUser[])
      .map((user) => normalizeEmail(user.email))
      .filter(Boolean)
  )) as string[];

  if (recipients.length === 0) {
    return { success: true, sentCount: 0, failedCount: 0, recipients: 0 };
  }

  const typedListing = listing as PremiumAlertListing;
  const html = generatePremiumAlertHtml(typedListing);
  const result = await sendEmailBatch(recipients.map((to) => ({
    to,
    subject: `AeroTrade Premium Alert: ${typedListing.title} is now available`,
    html,
  })));

  if (!result.success) {
    console.error('Premium listing alert failed:', result);
  }

  return {
    ...result,
    recipients: recipients.length,
    listingId,
  };
}
