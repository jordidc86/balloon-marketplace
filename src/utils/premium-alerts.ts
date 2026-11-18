import type { SupabaseClient } from '@supabase/supabase-js';
import { sendEmailBatch } from '@/utils/resend';
import { premiumListingAlertContent } from '@/utils/premium-alert-content.mjs';
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
  status: string
  public_at: string | null
  seller_id: string
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

async function startPremiumAlertRun(supabase: SupabaseClient, listingId: string): Promise<PremiumAlertRun> {
  const staleCutoff = new Date(Date.now() - staleRunMs).toISOString();
  const { error: staleError } = await supabase
    .from('premium_alert_runs')
    .update({
      status: 'partial',
      completed_at: new Date().toISOString(),
      error_message: 'Delivery outcome is uncertain after the stale cutoff; automatic resend is blocked.',
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
    const { data: existingRun, error: existingError } = await supabase
      .from('premium_alert_runs')
      .select('id, status')
      .eq('listing_id', listingId)
      .in('status', ['running', 'sent', 'partial'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingError || !existingRun?.id) throw new Error('Existing Premium alert receipt could not be verified');
    return {
      id: existingRun.id,
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
  const { data: stored, error } = await supabase
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
    .eq('id', runId)
    .select('id,status,recipients_count,sent_count,failed_count,completed_at')
    .single();

  if (
    error
    || !stored
    || stored.status !== fields.status
    || !stored.completed_at
    || (fields.recipientsCount !== undefined && stored.recipients_count !== fields.recipientsCount)
    || (fields.sentCount !== undefined && stored.sent_count !== fields.sentCount)
    || (fields.failedCount !== undefined && stored.failed_count !== fields.failedCount)
  ) {
    throw new Error(`Premium alert run result did not persist: ${error?.message || 'readback mismatch'}`);
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

  const rows = deliveryResults.map(result => ({
    run_id: runId,
    email: result.to,
    status: result.status,
    resend_id: result.resendId,
    error_message: result.error,
  }));
  const { error } = await supabase
    .from('premium_alert_recipients')
    .upsert(rows, { onConflict: 'run_id,email' });

  if (error) {
    throw new Error(`Premium alert recipient evidence did not persist: ${error.message}`);
  }
  const { data: stored, error: readError } = await supabase
    .from('premium_alert_recipients')
    .select('email,status,resend_id')
    .eq('run_id', runId);
  const expectedByEmail = new Map(rows.map((row) => [row.email, row]));
  const matches = !readError
    && stored?.length === rows.length
    && stored.every((row) => {
      const expected = expectedByEmail.get(row.email);
      if (!expected) return false;
      return expected.status === row.status
        && String(expected.resend_id || '') === String(row.resend_id || '');
    });
  if (!matches) {
    throw new Error(`Premium alert recipient readback failed: ${readError?.message || 'readback mismatch'}`);
  }
}

export async function sendPremiumListingAlert(supabase: SupabaseClient, listingId: string) {
  const { data: listing, error: listingError } = await supabase
    .from('listings')
    .select('id, title, category, price, currency, status, public_at, seller_id, images(url, is_primary)')
    .eq('id', listingId)
    .in('status', ['ACTIVE_PUBLIC', 'ACTIVE_PREMIUM'])
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
  let dispatchStarted = false;

  try {
    const { data: premiumUsers, error: usersError } = await supabase
      .from('users')
      .select('email')
      .eq('is_premium', true)
      .eq('listing_alerts_enabled', true)
      .neq('id', listing.seller_id);

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
    const content = premiumListingAlertContent(typedListing, siteUrl);
    dispatchStarted = true;
    const result = await sendEmailBatch(recipients.map((to) => ({
      to,
      subject: content.subject,
      html: content.html,
    })), { idempotencyKeyPrefix: `premium-alert/${listingId}` });

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
        status: dispatchStarted ? 'partial' : 'failed',
        errorMessage: getErrorMessage(error),
      });
    }

    throw error;
  }
}
