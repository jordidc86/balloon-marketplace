import { NextResponse } from 'next/server';
import { stripe } from '@/utils/stripe';
import { createClient } from '@supabase/supabase-js';
import { escapeHtml } from '@/utils/html';
import { sendPremiumListingAlert } from '@/utils/premium-alerts';
import type Stripe from 'stripe';

const activeSubscriptionStatuses = new Set<Stripe.Subscription.Status>([
  'active',
  'trialing',
])

const getStripeCustomerId = (customer: string | Stripe.Customer | Stripe.DeletedCustomer) =>
  typeof customer === 'string' ? customer : customer.id

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

  // Need Service Role Key to bypass RLS for webhook updates
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Import our email utility
  const { sendEmail } = await import('@/utils/resend');

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
          console.error('Failed to update listing post-checkout', error);
        } else if (listingData) {
          // 1. Send Confirmation Email to Seller
          const sellerHtml = `
            <h2>Your listing is live!</h2>
            <p>Hi,</p>
            <p>Great news! Your listing "<strong>${escapeHtml(listingData.title)}</strong>" has been published on AeroTrade.</p>
            <p>It is currently in the <strong>48-hour Premium Exclusive Window</strong>. It will become visible to the general public on ${escapeHtml(new Date(publicAt).toLocaleString())}.</p>
            <p>Good luck!</p>
          `;
          await sendEmail(listingData.contact_email, 'AeroTrade: Your Listing is Live!', sellerHtml);

          try {
            const alertResult = await sendPremiumListingAlert(supabaseAdmin, listingData.id);
            console.log('Premium listing alert sent after listing payment:', alertResult);
          } catch (alertError) {
            console.error('Failed to send premium listing alert after listing payment:', alertError);
          }
        }
      }
      else if (session.metadata?.type === 'premium_subscription') {
        const userId = session.metadata.user_id;
        const stripeCustomerId = session.customer as string;
        const stripeSubscriptionId = session.subscription as string;

        if (session.payment_status !== 'paid') {
          console.warn(`[Stripe Webhook] Premium checkout completed without paid status: ${session.id}`);
          break;
        }

        if (!userId || !stripeCustomerId || !stripeSubscriptionId) {
          console.error(`[Stripe Webhook] Premium checkout is missing required metadata or Stripe IDs: ${session.id}`);
          break;
        }

        const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
        const isPremium = activeSubscriptionStatuses.has(subscription.status);

        if (!isPremium) {
          console.warn(`[Stripe Webhook] Premium subscription ${stripeSubscriptionId} is not active: ${subscription.status}`);
          break;
        }

        console.log(`[Stripe Webhook] Updating premium status for user ${userId}`);

        const { error } = await supabaseAdmin
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
          .eq('id', userId);

        if (error) {
          console.error(`[Stripe Webhook] Failed to update user premium status for ${userId}:`, error);
        } else {
          console.log(`[Stripe Webhook] Successfully updated premium status for ${userId}`);
        }
      }
      break;
    }

    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription;
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
        console.error(`[Stripe Webhook] Failed to sync subscription ${subscription.id}:`, error);
      }

      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      const invoiceSubscription = invoice.parent?.subscription_details?.subscription;
      const subscriptionId =
        typeof invoiceSubscription === 'string' ? invoiceSubscription : invoiceSubscription?.id;

      if (subscriptionId) {
        const { error } = await supabaseAdmin
          .from('users')
          .update({
            is_premium: false,
            premium_source: null,
            premium_revoked_at: new Date().toISOString(),
            premium_last_stripe_event_id: event.id,
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_subscription_id', subscriptionId);

        if (error) {
          console.error(`[Stripe Webhook] Failed to revoke premium after failed invoice ${invoice.id}:`, error);
        }
      }

      break;
    }
  }

  return NextResponse.json({ received: true });
}
