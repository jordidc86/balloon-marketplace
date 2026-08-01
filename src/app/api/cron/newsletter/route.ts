import { NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { escapeHtml } from '@/utils/html';
import { duplicateNewsletterRunResult } from '@/utils/newsletter-safety.mjs';
import { siteUrl } from '@/utils/site';
import { isPromotedListing } from '@/utils/listing-plans';

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
  details?: {
    listing_plan?: string | null
  } | null
  images?: NewsletterImage[]
}

type NewsletterUser = {
  email: string | null
}

type NewsletterRunStatus = 'running' | 'sent' | 'partial' | 'failed' | 'skipped'

type DeliveryResult = {
  to: string
  status: 'sent' | 'failed'
  resendId?: string
  error?: string
}

type StartedNewsletterRun = {
  id: string
  periodKey: string
  auditUnavailable?: boolean
}

const fallbackImageUrl = 'https://images.unsplash.com/photo-1543326727-cf6c39e8f84c?q=80&w=600&auto=format&fit=crop';
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const staleRunMs = 4 * 60 * 60 * 1000;

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

const parseDaysFilter = (value: string | null) => {
  if (!value) {
    return null;
  }

  const days = Number(value);
  return Number.isFinite(days) && days > 0 ? days : null;
};

const normalizeEmail = (email: string | null) => {
  const normalizedEmail = email?.trim().toLowerCase();
  return normalizedEmail && emailPattern.test(normalizedEmail) ? normalizedEmail : null;
};

const getPromotedNewsletterListings = (listings: NewsletterListing[]) =>
  listings.filter((listing) => isPromotedListing(listing.details));

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'object' && error && 'message' in error) {
    return String(error.message);
  }

  return String(error);
};

const getTriggerSource = (value: string | null) => {
  if (value === 'schedule' || value === 'workflow_dispatch' || value === 'manual' || value === 'test') {
    return value;
  }

  return 'unknown';
};

const getNewsletterPeriodKey = (now: Date, override: string | null) => {
  if (override && /^[0-9]{4}-[0-9]{2}-(01|16)$/.test(override)) {
    return override;
  }

  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const anchorDay = now.getUTCDate() <= 15 ? '01' : '16';
  return `${year}-${month}-${anchorDay}`;
};

const isUniqueViolation = (error: { code?: string } | null) => error?.code === '23505';
const isMissingAuditTable = (error: { code?: string; message?: string } | null) =>
  error?.code === 'PGRST205' || error?.code === '42P01' || Boolean(error?.message?.includes('newsletter_runs'));

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

async function startNewsletterRun(
  supabase: SupabaseClient,
  params: {
    periodKey: string
    triggerSource: string
    dryRun: boolean
    testEmail: string | null
    days: number | null
    mixWithLatest: boolean
  }
): Promise<{ run?: StartedNewsletterRun; duplicateResponse?: NextResponse }> {
  const runPeriodKey = params.dryRun || params.testEmail
    ? `${params.periodKey}:${params.dryRun ? 'dry-run' : 'test'}:${Date.now()}`
    : params.periodKey;

  if (!params.dryRun && !params.testEmail) {
    const staleCutoff = new Date(Date.now() - staleRunMs).toISOString();
    const { error: staleError } = await supabase
      .from('newsletter_runs')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        error_message: 'Run marked failed because it was still running after the stale cutoff.',
        metadata: { staleCutoff },
      })
      .eq('period_key', params.periodKey)
      .eq('dry_run', false)
      .is('test_email', null)
      .eq('status', 'running')
      .lt('started_at', staleCutoff);

    if (staleError) {
      throw new Error(`Could not clear stale newsletter runs: ${staleError.message}`);
    }
  }

  const { data: run, error } = await supabase
    .from('newsletter_runs')
    .insert({
      period_key: runPeriodKey,
      trigger_source: params.triggerSource,
      status: 'running',
      dry_run: params.dryRun,
      test_email: params.testEmail,
      days_filter: params.days,
      mix_with_latest: params.mixWithLatest,
    })
    .select('id, period_key')
    .single();

  if (isUniqueViolation(error)) {
    const { data: existingRun } = await supabase
      .from('newsletter_runs')
      .select('id, status, started_at, completed_at, sent_count, failed_count')
      .eq('period_key', params.periodKey)
      .eq('dry_run', false)
      .is('test_email', null)
      .in('status', ['running', 'sent', 'partial'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const duplicateResult = duplicateNewsletterRunResult(existingRun, params.periodKey);
    return {
      duplicateResponse: NextResponse.json(duplicateResult, { status: duplicateResult.success ? 200 : 409 }),
    };
  }

  if (isMissingAuditTable(error)) {
    if (params.dryRun) {
      return {
        run: {
          id: '',
          periodKey: runPeriodKey,
          auditUnavailable: true,
        },
      };
    }

    throw new Error('Newsletter audit tables are missing; refusing to send without durable tracking.');
  }

  if (error || !run) {
    throw new Error(`Could not start newsletter run: ${error?.message || 'No run returned'}`);
  }

  return {
    run: {
      id: run.id,
      periodKey: run.period_key,
    },
  };
}

async function finishNewsletterRun(
  supabase: SupabaseClient,
  runId: string,
  fields: {
    status: NewsletterRunStatus
    recipientsCount?: number
    sentCount?: number
    failedCount?: number
    skippedInvalidRecipients?: number
    listingsCount?: number
    primaryListingCount?: number
    upgradedExpiredPremiumListings?: number
    wouldUpgradeExpiredPremiumListings?: number
    listingIds?: string[]
    resendMessageIds?: string[]
    errorMessage?: string
    metadata?: Record<string, unknown>
  }
) {
  if (!runId) {
    return;
  }

  const { error } = await supabase
    .from('newsletter_runs')
    .update({
      status: fields.status,
      completed_at: new Date().toISOString(),
      recipients_count: fields.recipientsCount,
      sent_count: fields.sentCount,
      failed_count: fields.failedCount,
      skipped_invalid_recipients: fields.skippedInvalidRecipients,
      listings_count: fields.listingsCount,
      primary_listing_count: fields.primaryListingCount,
      upgraded_expired_premium_listings: fields.upgradedExpiredPremiumListings,
      would_upgrade_expired_premium_listings: fields.wouldUpgradeExpiredPremiumListings,
      listing_ids: fields.listingIds,
      resend_message_ids: fields.resendMessageIds,
      error_message: fields.errorMessage,
      metadata: fields.metadata,
    })
    .eq('id', runId);

  if (error) {
    console.error('Failed to update newsletter run:', error);
  }
}

async function recordNewsletterRecipients(
  supabase: SupabaseClient,
  runId: string,
  deliveryResults: DeliveryResult[]
) {
  if (!runId || deliveryResults.length === 0) {
    return;
  }

  const { error } = await supabase
    .from('newsletter_recipients')
    .upsert(deliveryResults.map(result => ({
      run_id: runId,
      email: result.to,
      status: result.status,
      resend_id: result.resendId,
      error_message: result.error,
    })), { onConflict: 'run_id,email' });

  if (error) {
    console.error('Failed to record newsletter recipients:', error);
  }
}

export async function GET(request: Request) {
  let supabase: SupabaseClient | null = null;
  let activeRun: StartedNewsletterRun | null = null;

  try {
    const url = new URL(request.url);
    const dryRun = url.searchParams.get('dryRun') === 'true';
    const testEmail = url.searchParams.get('testEmail');
    const days = parseDaysFilter(url.searchParams.get('days'));
    const mixWithLatest = url.searchParams.get('mix') === 'true';
    const triggerSource = getTriggerSource(url.searchParams.get('source'));
    const runStartedAt = new Date();
    const periodKey = getNewsletterPeriodKey(runStartedAt, url.searchParams.get('periodKey'));

    const authHeader = request.headers.get('authorization');
    if (process.env.NODE_ENV === 'production' && !process.env.CRON_SECRET) {
      console.error('CRON_SECRET is missing; newsletter cron cannot authenticate requests.');
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

    supabase = createClient(supabaseUrl, supabaseServiceKey);

    const runStart = await startNewsletterRun(supabase, {
      periodKey,
      triggerSource,
      dryRun,
      testEmail,
      days,
      mixWithLatest,
    });

    if (runStart.duplicateResponse) {
      return runStart.duplicateResponse;
    }

    activeRun = runStart.run || null;
    if (!activeRun) {
      return new NextResponse('Could not start newsletter run', { status: 500 });
    }

    const now = new Date().toISOString();
    const expiredPremiumQuery = () => supabase!
      .from('listings')
      .select('id, title')
      .eq('status', 'ACTIVE_PREMIUM')
      .lte('public_at', now);

    const { data: upgradedListings, error: upgradeError } = dryRun
      ? await expiredPremiumQuery()
      : await supabase
        .from('listings')
        .update({ status: 'ACTIVE_PUBLIC' })
        .eq('status', 'ACTIVE_PREMIUM')
        .lte('public_at', now)
        .select('id, title');

    if (upgradeError) {
      await finishNewsletterRun(supabase, activeRun.id, {
        status: 'failed',
        errorMessage: `Error upgrading listings: ${upgradeError.message}`,
      });
      return new NextResponse('Error upgrading listings', { status: 500 });
    }

    const baseListingsQuery = () => supabase!
      .from('listings')
      .select('*, images(url, is_primary)')
      .eq('status', 'ACTIVE_PUBLIC')
      .lte('public_at', now)
      .order('created_at', { ascending: false });

    let listingsQuery = baseListingsQuery().limit(25);

    if (days && Number.isFinite(days) && days > 0) {
      const since = new Date();
      since.setDate(since.getDate() - days);
      listingsQuery = listingsQuery.gte('created_at', since.toISOString());
    }

    const { data: primaryListings, error: listingsError } = await listingsQuery;

    if (listingsError) {
      await finishNewsletterRun(supabase, activeRun.id, {
        status: 'failed',
        errorMessage: `Error fetching listings: ${listingsError.message}`,
      });
      return new NextResponse('Error fetching listings', { status: 500 });
    }

    let recentListings = getPromotedNewsletterListings((primaryListings || []) as NewsletterListing[]).slice(0, 10);
    const primaryListingCount = recentListings.length;

    if (mixWithLatest && recentListings.length < 10) {
      const existingIds = new Set(recentListings.map((listing) => listing.id));
      const { data: fallbackListings, error: fallbackError } = await baseListingsQuery().limit(25);

      if (fallbackError) {
        await finishNewsletterRun(supabase, activeRun.id, {
          status: 'failed',
          errorMessage: `Error fetching fallback listings: ${fallbackError.message}`,
        });
        return new NextResponse('Error fetching fallback listings', { status: 500 });
      }

      const fallbackMix = getPromotedNewsletterListings((fallbackListings || []) as NewsletterListing[])
        .filter((listing) => !existingIds.has(listing.id));

      recentListings = [...recentListings, ...fallbackMix].slice(0, 10);
    }

    if (recentListings.length === 0) {
      await finishNewsletterRun(supabase, activeRun.id, {
        status: 'skipped',
        listingsCount: 0,
        primaryListingCount,
        upgradedExpiredPremiumListings: dryRun ? 0 : upgradedListings?.length || 0,
        wouldUpgradeExpiredPremiumListings: dryRun ? upgradedListings?.length || 0 : 0,
        metadata: { reason: 'no_public_listings' },
      });

      return NextResponse.json({
        success: true,
        skipped: true,
        runId: activeRun.id,
        periodKey: activeRun.periodKey,
        auditUnavailable: activeRun.auditUnavailable || undefined,
        message: 'No public listings. Skip sending email.',
      });
    }

    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('email');

    if (usersError) {
      await finishNewsletterRun(supabase, activeRun.id, {
        status: 'failed',
        errorMessage: `Error fetching users: ${usersError.message}`,
      });
      return new NextResponse('Error fetching users', { status: 500 });
    }

    if (!users || users.length === 0) {
      await finishNewsletterRun(supabase, activeRun.id, {
        status: 'skipped',
        listingsCount: recentListings.length,
        primaryListingCount,
        listingIds: recentListings.map(listing => listing.id),
        metadata: { reason: 'no_users' },
      });

      return NextResponse.json({
        success: true,
        skipped: true,
        runId: activeRun.id,
        periodKey: activeRun.periodKey,
        auditUnavailable: activeRun.auditUnavailable || undefined,
        message: 'No users to send email to.',
      });
    }

    const recipientEmails = testEmail
      ? [normalizeEmail(testEmail)].filter(Boolean) as string[]
      : Array.from(new Set(
          (users as NewsletterUser[])
            .map(user => normalizeEmail(user.email))
            .filter(Boolean)
        )) as string[];

    const skippedInvalidRecipients = testEmail
      ? Number(recipientEmails.length === 0)
      : users.length - recipientEmails.length;

    if (recipientEmails.length === 0) {
      await finishNewsletterRun(supabase, activeRun.id, {
        status: 'skipped',
        skippedInvalidRecipients,
        listingsCount: recentListings.length,
        primaryListingCount,
        listingIds: recentListings.map(listing => listing.id),
        metadata: { reason: 'no_valid_recipients' },
      });

      return NextResponse.json({
        success: true,
        skipped: true,
        runId: activeRun.id,
        periodKey: activeRun.periodKey,
        auditUnavailable: activeRun.auditUnavailable || undefined,
        message: 'No valid recipient emails to send newsletter to.',
        skippedInvalidRecipients,
      });
    }

    if (dryRun) {
      await finishNewsletterRun(supabase, activeRun.id, {
        status: 'skipped',
        recipientsCount: recipientEmails.length,
        skippedInvalidRecipients,
        listingsCount: recentListings.length,
        primaryListingCount,
        listingIds: recentListings.map(listing => listing.id),
        upgradedExpiredPremiumListings: 0,
        wouldUpgradeExpiredPremiumListings: upgradedListings?.length || 0,
        metadata: { reason: 'dry_run' },
      });

      return NextResponse.json({
        success: true,
        dryRun: true,
        runId: activeRun.id,
        periodKey: activeRun.periodKey,
        auditUnavailable: activeRun.auditUnavailable || undefined,
        recipients: recipientEmails.length,
        skippedInvalidRecipients,
        daysFilter: days,
        mixWithLatest,
        primaryListingCount,
        upgradedExpiredPremiumListings: 0,
        wouldUpgradeExpiredPremiumListings: upgradedListings?.length || 0,
        listings: recentListings.map(listing => ({
          id: listing.id,
          title: listing.title,
          imageUrl: getPrimaryImageUrl(listing),
        })),
      });
    }

    const htmlBody = generateNewsletterHtml(recentListings);
    const emailBatch = recipientEmails.map(email => ({
      to: email,
      subject: 'New Hot Air Balloons on AeroTrade - Bi-Weekly Update',
      html: htmlBody,
    }));

    const { sendEmailBatch } = await import('@/utils/resend');
    const result = await sendEmailBatch(emailBatch);
    const sentCount = result.sentCount ?? 0;
    const failedCount = result.failedCount ?? Math.max(0, emailBatch.length - sentCount);
    const deliveryResults = (result.deliveryResults || []) as DeliveryResult[];
    const resendMessageIds = deliveryResults
      .map(delivery => delivery.resendId)
      .filter(Boolean) as string[];

    await recordNewsletterRecipients(supabase, activeRun.id, deliveryResults);

    const status: NewsletterRunStatus = result.success
      ? 'sent'
      : sentCount > 0
        ? 'partial'
        : 'failed';
    await finishNewsletterRun(supabase, activeRun.id, {
      status,
      recipientsCount: recipientEmails.length,
      sentCount,
      failedCount,
      skippedInvalidRecipients,
      listingsCount: recentListings.length,
      primaryListingCount,
      listingIds: recentListings.map(listing => listing.id),
      upgradedExpiredPremiumListings: upgradedListings?.length || 0,
      resendMessageIds,
      errorMessage: result.success
        ? undefined
        : sentCount > 0
          ? 'Newsletter was only partially accepted by Resend; automatic retry is blocked.'
          : getErrorMessage(result.error || 'Email batch failed'),
      metadata: {
        chunkCount: result.chunkCount,
        failures: result.failures || [],
      },
    });

    if (!result.success) {
      console.error('Failed to send newsletter batch', result.error);
      return NextResponse.json({
        success: false,
        runId: activeRun.id,
        periodKey: activeRun.periodKey,
        message: sentCount > 0
          ? 'Newsletter partially sent; retry is blocked to avoid duplicate emails.'
          : 'Newsletter send failed before any accepted delivery.',
        recipients: recipientEmails.length,
        sentCount,
        failedCount,
        skippedInvalidRecipients,
        listings: recentListings.length,
        upgradedExpiredPremiumListings: upgradedListings?.length || 0,
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      runId: activeRun.id,
      periodKey: activeRun.periodKey,
      message: `Newsletter sent to ${sentCount} users detailing ${recentListings.length} listings.`,
      recipients: recipientEmails.length,
      sentCount,
      failedCount,
      skippedInvalidRecipients,
      listings: recentListings.length,
      upgradedExpiredPremiumListings: upgradedListings?.length || 0,
    });
  } catch (error) {
    console.error('Newsletter cron error:', error);
    if (supabase && activeRun) {
      await finishNewsletterRun(supabase, activeRun.id, {
        status: 'failed',
        errorMessage: getErrorMessage(error),
      });
    }

    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
