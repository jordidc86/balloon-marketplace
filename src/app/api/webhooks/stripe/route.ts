import { NextResponse } from 'next/server';
import { stripe } from '@/utils/stripe';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: Request) {
  const body = await req.text();
  const signature = req.headers.get('stripe-signature');

  if (!signature || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Missing signature or secret' }, { status: 400 });
  }

  let event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err: any) {
    console.error(`Webhook Error: ${err.message}`);
    return NextResponse.json({ error: `Webhook Error: ${err.message}` }, { status: 400 });
  }

  // Need Service Role Key to bypass RLS for webhook updates
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  
  // Import our email utility
  const { sendEmail } = await import('@/utils/resend');

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as any;

    // Fulfill the purchase based on metadata
    if (session.metadata?.type === 'listing_fee') {
      const listingId = session.metadata.listing_id;
      const userId = session.metadata.user_id;
      
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
          <p>Great news! Your listing "<strong>${listingData.title}</strong>" has been published on AeroTrade.</p>
          <p>It is currently in the <strong>48-hour Premium Exclusive Window</strong>. It will become visible to the general public on ${new Date(publicAt).toLocaleString()}.</p>
          <p>Good luck!</p>
        `;
        await sendEmail(listingData.contact_email, 'AeroTrade: Your Listing is Live!', sellerHtml);

        // 2. Broadcast Instant Alert to Premium Members
        const { data: premiumUsers, error: premiumError } = await supabaseAdmin
          .from('users')
          .select('email') // Ideally users table has email, or we get it from auth.users via RPC, assuming basic relation for now
          .eq('is_premium', true);
          
        // Note: For MVP we assume we have user emails in a reachable way.
        // If not, we'd use a Supabase Function or join with auth.users. 
        // For demonstration of the strategic feature:
        if (premiumUsers && premiumUsers.length > 0) {
          console.log(`Sending alerts to ${premiumUsers.length} premium members...`);
          // In production, batch these to avoid limits
          const alertHtml = `
            <h3>🔥 New Premium Exclusive Listing!</h3>
            <p>A new <strong>${listingData.category.toUpperCase()}</strong> was just listed on AeroTrade.</p>
            <p><strong>${listingData.title}</strong> - ${listingData.price} ${listingData.currency}</p>
            <p>Because you are a Premium Club member, you have exclusive access to view photos and contact the seller 48 hours before the public.</p>
            <p><a href="${process.env.NEXT_PUBLIC_SITE_URL}/catalog/${listingData.id}">View Listing Now</a></p>
          `;
          
          for (const pUser of premiumUsers) {
             if(pUser.email) {
               await sendEmail(pUser.email, '🔥 AeroTrade Premium Alert: New Gear Listed', alertHtml);
             }
          }
        }
      }
    } 
    else if (session.metadata?.type === 'premium_subscription') {
      const userId = session.metadata.user_id;
      
      const { error } = await supabaseAdmin
        .from('users')
        .update({ is_premium: true })
        .eq('id', userId);

      if (error) {
        console.error('Failed to update user premium status', error);
      }
    }
  }

  return NextResponse.json({ received: true });
}
