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

type DeliveryResult = {
  to: string
  status: 'sent' | 'failed'
  resendId?: string
  error?: string
}

type PremiumAlertRun = {
  id: string
  duplicate?: boolean
  status?: string
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const staleRunMs = 4 * 60 * 60 * 1000;

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

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'object' && error && 'message' in error) {
    return String(error.message);
  }

  return String(error);
};

const isUniqueViolation = (error: { code?: string } | null) => error?.code === '23505';

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

async function startPremiumAlertRun(supabase: SupabaseClient, listingId: string): Promise<PremiumAlertRun> {
  const staleCutoff = new Date(Date.now() - staleRunMs).toISOString();
  const { error: staleError } = await supabase
    .from('premium_alert_runs')
    .update({
      status: 'failed',
      completed_at: new Date().toISOString(),
      error_message: 'Run marked failed because it was still running after the stale cutoff.',
      metadata: { staleCutoff },
    })
    .eq('listing_id', listingId)
    .eq('status', 'running')
    .lt('started_at', staleCutoff);

  if (staleError) {
    throw new Error(`Could not clear stale premium alert runs: ${staleError.message}`);
  }

  const { data: run, error } = await supabase
    .from('premium_alert_runs')
    .insert({
      listing_id: listingId,
      status: 'running',
    })
    .select('id')
    .single();

  if (isUniqueViolation(error)) {
    const { data: existingRun } = await supabase
      .from('premium_alert_runs')
      .select('id, status')
      .eq('listing_id', listingId)
      .in('status', ['running', 'sent', 'partial'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return {
      id: existingRun?.id || '',
      status: existingRun?.status,
      duplicate: true,
    };
  }

  if (error || !run) {
    throw new Error(`Could not start premium alert run: ${error?.message || 'No run returned'}`);
  }

  return { id: run.id };
}

async function finishPremiumAlertRun(
  supabase: SupabaseClient,
  runId: string,
  fields: {
    status: 'sent' | 'partial' | 'failed' | 'skipped'
    recipientsCount?: number
    sentCount?: number
    failedCount?: number
    skippedInvalidRecipients?: number
    resendMessageIds?: string[]
    errorMessage?: string
    metadata?: Record<string, unknown>
  }
) {
  const { error } = await supabase
    .from('premium_alert_runs')
    .update({
      status: fields.status,
      completed_at: new Date().toISOString(),
      recipients_count: fields.recipientsCount,
      sent_count: fields.sentCount,
      failed_count: fields.failedCount,
      skipped_invalid_recipients: fields.skippedInvalidRecipients,
      resend_message_ids: fields.resendMessageIds,
      error_message: fields.errorMessage,
      metadata: fields.metadata,
    })
    .eq('id', runId);

  if (error) {
    console.error('Failed to update premium alert run:', error);
  }
}

async function recordPremiumAlertRecipients(
  supabase: SupabaseClient,
  runId: string,
  deliveryResults: DeliveryResult[]
) {
  if (deliveryResults.length === 0) {
    return;
  }

  const { error } = await supabase
    .from('premium_alert_recipients')
    .upsert(deliveryResults.map(result => ({
      run_id: runId,
      email: result.to,
      status: result.status,
      resend_id: result.resendId,
      error_message: result.error,
    })), { onConflict: 'run_id,email' });

  if (error) {
    console.error('Failed to record premium alert recipients:', error);
  }
}

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

  const alertRun = await startPremiumAlertRun(supabase, listingId);
  if (alertRun.duplicate) {
    return {
      success: true,
      duplicate: true,
      skipped: true,
      runId: alertRun.id,
      status: alertRun.status,
      listingId,
    };
  }

  let runCompleted = false;

  try {
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
    const skippedInvalidRecipients = premiumUsers.length - recipients.length;

    if (recipients.length === 0) {
      await finishPremiumAlertRun(supabase, alertRun.id, {
        status: 'skipped',
        recipientsCount: 0,
        sentCount: 0,
        failedCount: 0,
        skippedInvalidRecipients,
        metadata: { reason: 'no_premium_recipients' },
      });
      runCompleted = true;

      return { success: true, sentCount: 0, failedCount: 0, recipients: 0, runId: alertRun.id, listingId };
    }

    const typedListing = listing as PremiumAlertListing;
    const html = generatePremiumAlertHtml(typedListing);
    const result = await sendEmailBatch(recipients.map((to) => ({
      to,
      subject: `AeroTrade Premium Alert: ${typedListing.title} is now available`,
      html,
    })));

    const sentCount = result.sentCount ?? 0;
    const failedCount = result.failedCount ?? Math.max(0, recipients.length - sentCount);
    const deliveryResults = (result.deliveryResults || []) as DeliveryResult[];
    const resendMessageIds = deliveryResults
      .map(delivery => delivery.resendId)
      .filter(Boolean) as string[];

    await recordPremiumAlertRecipients(supabase, alertRun.id, deliveryResults);
    await finishPremiumAlertRun(supabase, alertRun.id, {
      status: result.success
        ? 'sent'
        : sentCount > 0
          ? 'partial'
          : 'failed',
      recipientsCount: recipients.length,
      sentCount,
      failedCount,
      skippedInvalidRecipients,
      resendMessageIds,
      errorMessage: result.success
        ? undefined
        : sentCount > 0
          ? 'Premium alert was only partially accepted by Resend; automatic retry is blocked.'
          : getErrorMessage(result.error || 'Premium alert batch failed'),
      metadata: {
        chunkCount: result.chunkCount,
        failures: result.failures || [],
      },
    });
    runCompleted = true;

    if (!result.success) {
      console.error('Premium listing alert failed:', result);
      throw new Error(sentCount > 0
        ? 'Premium alert partially sent; duplicate retry is blocked.'
        : 'Premium alert failed before any accepted delivery.');
    }

    return {
      ...result,
      recipients: recipients.length,
      skippedInvalidRecipients,
      runId: alertRun.id,
      listingId,
    };
  } catch (error) {
    if (!runCompleted) {
      await finishPremiumAlertRun(supabase, alertRun.id, {
        status: 'failed',
        errorMessage: getErrorMessage(error),
      });
    }

    throw error;
  }
}
