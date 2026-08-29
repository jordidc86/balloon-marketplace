import { NextResponse } from 'next/server';
import { stripe } from '@/utils/stripe';
import { createClient } from '@supabase/supabase-js';
import { escapeHtml } from '@/utils/html';
import { sendPremiumListingAlert } from '@/utils/premium-alerts';
import {
  buildPaymentNotification,
  buildPaymentNotificationReceipt,
  matchesPaymentNotificationReceipt,
  normalizePaymentType,
} from '@/utils/payment-notification.mjs';
import type Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';
import { persistSellerFunnelEvent } from '@/utils/seller-funnel-server';

const activeSubscriptionStatuses = new Set<Stripe.Subscription.Status>([
  'active',
  'trialing',
])

const getStripeCustomerId = (customer: string | Stripe.Customer | Stripe.DeletedCustomer) =>
  typeof customer === 'string' ? customer : customer.id

const normalizedEmail = (value: unknown) => String(value || '').trim().toLowerCase()

async function resolvePremiumUserId(
  supabase: SupabaseClient,
  session: Stripe.Checkout.Session,
) {
  const requestedUserId = String(session.metadata?.user_id || '').trim()
  if (requestedUserId) {
    const { data: userById, error: userByIdError } = await supabase
      .from('users')
      .select('id')
      .eq('id', requestedUserId)
      .maybeSingle()

    if (userByIdError) {
      throw new Error(`Could not resolve Premium user by checkout metadata: ${userByIdError.message}`)
    }
    if (userById?.id) return String(userById.id)
  }

  const checkoutEmail = normalizedEmail(
    session.customer_details?.email || session.customer_email,
  )
  if (!checkoutEmail) {
    throw new Error(`Premium checkout ${session.id} has no resolvable user or customer email`)
  }

  const { data: matchingUsers, error: emailLookupError } = await supabase
    .from('users')
    .select('id')
    .ilike('email', checkoutEmail)
    .limit(2)

  if (emailLookupError) {
    throw new Error(`Could not resolve Premium user by checkout email: ${emailLookupError.message}`)
  }
  if (matchingUsers?.length !== 1) {
    throw new Error(`Premium checkout ${session.id} did not resolve to exactly one user`)
  }

  return String(matchingUsers[0].id)
}

const stripeObjectId = <T extends { id: string }>(value: string | T | null | undefined) =>
  typeof value === 'string' ? value : value?.id || null

const uniqueLabels = (values: Array<string | null | undefined>) =>
  [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))].join(' | ')

async function chargeNotificationContext(charge: Stripe.Charge) {
  const paymentIntentId = typeof charge.payment_intent === 'string'
    ? charge.payment_intent
    : charge.payment_intent?.id
  let paymentType = String(charge.metadata?.type || '').trim() || null
  let product = ''
  let customerEmail = normalizedEmail(charge.billing_details?.email || charge.receipt_email) || null
  let invoiceId: string | null = null
  let subscriptionId: string | null = null

  if (paymentIntentId) {
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId)
    paymentType = String(paymentIntent.metadata?.type || paymentType || '').trim() || null
    customerEmail = customerEmail || normalizedEmail(paymentIntent.receipt_email) || null

    const sessions = await stripe.checkout.sessions.list({ payment_intent: paymentIntentId, limit: 1 })
    const session = sessions.data[0]
    paymentType = String(session?.metadata?.type || paymentType || '').trim() || null
    if (session) {
      const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 10 })
      product = uniqueLabels(lineItems.data.map((item) => item.description))
      customerEmail = customerEmail || normalizedEmail(
        session.customer_details?.email || session.customer_email,
      ) || null
      invoiceId = stripeObjectId(session.invoice)
      subscriptionId = stripeObjectId(session.subscription)
    }

    if (!invoiceId) {
      const invoicePayments = await stripe.invoicePayments.list({
        limit: 1,
        status: 'paid',
        payment: { type: 'payment_intent', payment_intent: paymentIntentId },
      })
      invoiceId = stripeObjectId(invoicePayments.data[0]?.invoice)
    }

    if (invoiceId) {
      const invoice = await stripe.invoices.retrieve(invoiceId)
      if (!('deleted' in invoice && invoice.deleted)) {
        customerEmail = customerEmail || normalizedEmail(invoice.customer_email) || null
        subscriptionId = subscriptionId || stripeObjectId(
          invoice.parent?.subscription_details?.subscription,
        )
        product = product || uniqueLabels(invoice.lines.data.map((line) => line.description))
      }
    }

    if (subscriptionId) {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId)
      paymentType = String(
        subscription.metadata?.type || paymentType || 'premium_subscription',
      ).trim()
    }
  }

  return {
    paymentType: normalizePaymentType(paymentType),
    product,
    customerEmail,
    paymentIntentId: paymentIntentId || null,
    invoiceId,
    subscriptionId,
  }
}

async function persistPaymentNotificationReceipt(
  supabase: SupabaseClient,
  receipt: ReturnType<typeof buildPaymentNotificationReceipt>,
) {
  const { error: insertError } = await supabase
    .from('payment_notification_receipts')
    .insert(receipt)

  if (insertError && insertError.code !== '23505') {
    throw new Error(`Could not persist payment notification receipt: ${insertError.message}`)
  }

  const { data: stored, error: readError } = await supabase
    .from('payment_notification_receipts')
    .select('stripe_event_id,charge_id,amount_minor,currency,payment_type,provider_message_id')
    .eq('charge_id', receipt.charge_id)
    .single()

  if (readError || !stored) {
    throw new Error(`Could not read back payment notification receipt for ${receipt.stripe_event_id}`)
  }

  if (!matchesPaymentNotificationReceipt(stored, receipt)) {
    throw new Error(`Payment notification receipt mismatch for ${receipt.stripe_event_id}`)
  }
}

async function claimWebhookEvent(supabase: SupabaseClient, event: Stripe.Event) {
  const { error: insertError } = await supabase
    .from('stripe_webhook_events')
    .insert({
      event_id: event.id,
      event_type: event.type,
      stripe_created_at: new Date(event.created * 1000).toISOString(),
      status: 'processing',
      attempts: 1,
    })

  if (!insertError) {
    return true
  }

  if (insertError.code !== '23505') {
    throw new Error(`Could not audit Stripe event ${event.id}: ${insertError.message}`)
  }

  const { data: existing, error: existingError } = await supabase
    .from('stripe_webhook_events')
    .select('status, attempts, updated_at')
    .eq('event_id', event.id)
    .single()

  if (existingError || !existing) {
    throw new Error(`Could not read Stripe event audit ${event.id}`)
  }

  if (existing.status === 'processed') {
    return false
  }

  const processingIsFresh =
    existing.status === 'processing' &&
    Date.now() - new Date(existing.updated_at).getTime() < 5 * 60 * 1000

  if (processingIsFresh) {
    throw new Error(`Stripe event ${event.id} is already being processed`)
  }

  const { error: retryError } = await supabase
    .from('stripe_webhook_events')
    .update({
      status: 'processing',
      attempts: existing.attempts + 1,
      last_error: null,
      processed_at: null,
    })
    .eq('event_id', event.id)

  if (retryError) {
    throw new Error(`Could not retry Stripe event ${event.id}: ${retryError.message}`)
  }

  return true
}

async function finishWebhookEvent(
  supabase: SupabaseClient,
  eventId: string,
  status: 'processed' | 'failed',
  error?: unknown,
) {
  const message = error instanceof Error ? error.message : error ? String(error) : null
  const { error: updateError } = await supabase
    .from('stripe_webhook_events')
    .update({
      status,
      last_error: message?.slice(0, 1000) || null,
      processed_at: status === 'processed' ? new Date().toISOString() : null,
    })
    .eq('event_id', eventId)

  if (updateError) {
    throw new Error(`Failed to update Stripe event audit state for ${eventId}: ${updateError.message}`)
  }
}

export async function POST(req: Request) {
  const body = await req.text();
  const signature = req.headers.get('stripe-signature');

  if (!signature || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Missing signature or secret' }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Invalid Stripe webhook signature';
    console.error(`Webhook Error: ${message}`);
    return NextResponse.json({ error: `Webhook Error: ${message}` }, { status: 400 });
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[Stripe Webhook] Supabase server configuration is missing')
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  // Need Service Role Key to bypass RLS for webhook updates
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    const shouldProcess = await claimWebhookEvent(supabaseAdmin, event)
    if (!shouldProcess) {
      return NextResponse.json({ received: true, duplicate: true })
    }
  } catch (error) {
    console.error('[Stripe Webhook] Could not claim event:', error)
    return NextResponse.json({ error: 'Could not claim Stripe event' }, { status: 500 })
  }

  // Import our email utility
  const { sendEmail } = await import('@/utils/resend');

  try {
    switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;

      // Fulfill the purchase based on metadata
      if (session.metadata?.type === 'listing_fee') {
        if (session.payment_status !== 'paid') {
          console.warn(`[Stripe Webhook] Listing checkout completed without paid status: ${session.id}`);
          break;
        }

        const listingId = session.metadata.listing_id;
        if (!listingId) {
          throw new Error(`Listing checkout ${session.id} is missing listing_id metadata`)
        }

        // Update listing to ACTIVE_PREMIUM and set 48h window
        const publicAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

        const { data: listingData, error } = await supabaseAdmin
          .from('listings')
          .update({
            status: 'ACTIVE_PREMIUM',
            public_at: publicAt
          })
          .eq('id', listingId)
          .select()
          .single();

        if (error) {
          throw new Error(`Failed to update listing post-checkout: ${error.message}`)
        } else if (listingData) {
          await persistSellerFunnelEvent(supabaseAdmin, {
            sellerId: listingData.seller_id,
            listingId: listingData.id,
            listingPlan: 'premium',
            stage: 'PAYMENT_CONFIRMED',
            source: 'stripe',
          })
          await persistSellerFunnelEvent(supabaseAdmin, {
            sellerId: listingData.seller_id,
            listingId: listingData.id,
            listingPlan: 'premium',
            stage: 'LISTING_PUBLISHED',
            source: 'stripe',
          })
          // 1. Send Confirmation Email to Seller
          const sellerHtml = `
            <h2>Your Premium listing is live!</h2>
            <p>Hi,</p>
            <p>Great news! Your listing "<strong>${escapeHtml(listingData.title)}</strong>" has been published on AeroTrade as a Premium listing.</p>
            <p>It is currently in the <strong>48-hour Premium Exclusive Window</strong>. It will become visible to the general public on ${escapeHtml(new Date(publicAt).toLocaleString())}.</p>
            <p>Premium promotion includes the bi-weekly newsletter, social promotion while the listing is active, and personal buyer outreach where relevant.</p>
            <p>Good luck!</p>
          `;
          await sendEmail(listingData.contact_email, 'AeroTrade: Your Premium Listing is Live!', sellerHtml);

          try {
            const alertResult = await sendPremiumListingAlert(supabaseAdmin, listingData.id);
            console.log('Premium listing alert sent after listing payment:', alertResult);
          } catch (alertError) {
            console.error('Failed to send premium listing alert after listing payment:', alertError);
          }
        }
      }
      else if (session.metadata?.type === 'premium_subscription') {
        const userId = await resolvePremiumUserId(supabaseAdmin, session);
        const stripeCustomerId = session.customer as string;
        const stripeSubscriptionId = session.subscription as string;

        if (session.payment_status !== 'paid') {
          console.warn(`[Stripe Webhook] Premium checkout completed without paid status: ${session.id}`);
          break;
        }

        if (!stripeCustomerId || !stripeSubscriptionId) {
          throw new Error(`Premium checkout is missing required metadata or Stripe IDs: ${session.id}`)
        }

        const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
        const isPremium = activeSubscriptionStatuses.has(subscription.status);

        if (!isPremium) {
          console.warn(`[Stripe Webhook] Premium subscription ${stripeSubscriptionId} is not active: ${subscription.status}`);
          break;
        }

        console.log(`[Stripe Webhook] Updating premium status for user ${userId}`);

        const { data: updatedUser, error } = await supabaseAdmin
          .from('users')
          .update({
            is_premium: true,
            stripe_customer_id: stripeCustomerId,
            stripe_subscription_id: stripeSubscriptionId,
            premium_source: 'stripe',
            premium_granted_by: null,
            premium_granted_at: new Date().toISOString(),
            premium_revoked_at: null,
            premium_last_stripe_event_id: event.id,
            updated_at: new Date().toISOString(),
          })
          .eq('id', userId)
          .select('id,is_premium,premium_source,stripe_customer_id,stripe_subscription_id,premium_last_stripe_event_id')
          .single();

        if (error) {
          throw new Error(`Failed to update user premium status for ${userId}: ${error.message}`)
        }
        if (
          !updatedUser?.is_premium
          || updatedUser.premium_source !== 'stripe'
          || updatedUser.stripe_customer_id !== stripeCustomerId
          || updatedUser.stripe_subscription_id !== stripeSubscriptionId
          || updatedUser.premium_last_stripe_event_id !== event.id
        ) {
          throw new Error(`Premium fulfillment readback failed for checkout ${session.id}`)
        }

        console.log(`[Stripe Webhook] Successfully updated and verified Premium status for ${userId}`);
      }
      break;
    }

    case 'charge.succeeded': {
      const charge = event.data.object as Stripe.Charge
      if (!charge.paid || charge.status !== 'succeeded') {
        throw new Error(`Stripe charge event ${event.id} is not a successful paid charge`)
      }

      const adminEmail = String(process.env.ADMIN_EMAIL || '').trim()
      if (!adminEmail) {
        throw new Error('ADMIN_EMAIL is missing; payment notification was not sent')
      }

      const context = await chargeNotificationContext(charge)
      const notification = buildPaymentNotification({
        chargeId: charge.id,
        amount: charge.amount,
        currency: charge.currency,
        createdAt: new Date(charge.created * 1000).toISOString(),
        customerEmail: context.customerEmail,
        paymentType: context.paymentType,
        product: context.product,
        description: charge.description,
        dashboardUrl: `https://dashboard.stripe.com/${event.livemode ? '' : 'test/'}payments/${charge.id}`,
      })
      const delivery = await sendEmail(
        adminEmail,
        notification.subject,
        notification.html,
        { idempotencyKey: notification.idempotencyKey },
      )

      if (!delivery.success || !delivery.resendId) {
        throw new Error(`Payment notification delivery was not accepted for event ${event.id}`)
      }
      const acceptedAt = new Date().toISOString()

      const receipt = buildPaymentNotificationReceipt({
        eventId: event.id,
        chargeId: charge.id,
        paymentIntentId: context.paymentIntentId,
        invoiceId: context.invoiceId,
        subscriptionId: context.subscriptionId,
        amount: charge.amount,
        currency: charge.currency,
        paymentType: notification.paymentType,
        product: notification.productLabel,
        providerMessageId: delivery.resendId,
        livemode: event.livemode,
        acceptedAt,
      })
      await persistPaymentNotificationReceipt(supabaseAdmin, receipt)
      console.log(JSON.stringify({
        event: 'aerotrade_payment_notification',
        stripeEventId: event.id,
        status: 'accepted',
        providerMessageId: delivery.resendId,
        receiptPersisted: true,
      }))
      break;
    }

    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const eventSubscription = event.data.object as Stripe.Subscription;
      const subscription = event.type === 'customer.subscription.updated'
        ? await stripe.subscriptions.retrieve(eventSubscription.id)
        : eventSubscription
      const isPremium = activeSubscriptionStatuses.has(subscription.status);

      const { error } = await supabaseAdmin
        .from('users')
        .update({
          is_premium: isPremium,
          stripe_subscription_id: subscription.id,
          stripe_customer_id: getStripeCustomerId(subscription.customer),
          premium_source: isPremium ? 'stripe' : null,
          premium_granted_by: null,
          premium_granted_at: isPremium ? new Date().toISOString() : null,
          premium_revoked_at: isPremium ? null : new Date().toISOString(),
          premium_last_stripe_event_id: event.id,
          updated_at: new Date().toISOString(),
        })
        .eq('stripe_subscription_id', subscription.id);

      if (error) {
        throw new Error(`Failed to sync subscription ${subscription.id}: ${error.message}`)
      }

      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      const invoiceSubscription = invoice.parent?.subscription_details?.subscription;
      const subscriptionId =
        typeof invoiceSubscription === 'string' ? invoiceSubscription : invoiceSubscription?.id;

      if (subscriptionId) {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId)
        const isPremium = activeSubscriptionStatuses.has(subscription.status)
        const { error } = await supabaseAdmin
          .from('users')
          .update({
            is_premium: isPremium,
            premium_source: isPremium ? 'stripe' : null,
            premium_revoked_at: isPremium ? null : new Date().toISOString(),
            premium_last_stripe_event_id: event.id,
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_subscription_id', subscriptionId);

        if (error) {
          throw new Error(`Failed to revoke premium after failed invoice ${invoice.id}: ${error.message}`)
        }
      }

      break;
    }
    }

    await finishWebhookEvent(supabaseAdmin, event.id, 'processed')
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error(`[Stripe Webhook] Failed to process ${event.id}:`, error)
    await finishWebhookEvent(supabaseAdmin, event.id, 'failed', error)
    return NextResponse.json({ error: 'Stripe event processing failed' }, { status: 500 })
  }
}
