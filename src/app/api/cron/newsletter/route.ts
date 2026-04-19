import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendEmail } from '@/utils/resend';

// Helper to generate the HTML for the email
const generateNewsletterHtml = (listings: any[]) => {
  const listingsHtml = listings.map(listing => {
    const imageUrl = listing.images && listing.images[0]?.url 
      ? listing.images[0].url 
      : 'https://images.unsplash.com/photo-1543326727-cf6c39e8f84c?q=80&w=600&auto=format&fit=crop';
    
    return `
      <div style="margin-bottom: 32px; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; font-family: sans-serif;">
        <img src="${imageUrl}" style="width: 100%; height: 250px; object-fit: cover;" alt="${listing.title}" />
        <div style="padding: 24px;">
          <h2 style="margin: 0 0 8px 0; font-size: 20px; color: #0f172a;">${listing.title}</h2>
          <p style="margin: 0 0 16px 0; font-size: 24px; font-weight: bold; color: #2563eb;">${listing.price} ${listing.currency}</p>
          <div style="color: #64748b; font-size: 14px; margin-bottom: 16px;">
            <p style="margin: 0 0 4px 0;">📍 Location: ${listing.location_country}</p>
            <p style="margin: 0;">✨ Condition: ${listing.condition}</p>
          </div>
          <a href="https://aerotrade.app/catalog/${listing.id}" style="display: inline-block; background-color: #2563eb; color: white; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: bold;">View Listing</a>
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
            Hello from AeroTrade! Here are the latest hot air balloons and equipment listed in the past two weeks. Don't miss out on these great deals!
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
    // 1. Verify Vercel CRON Secret
    const authHeader = request.headers.get('authorization');
    if (
      process.env.NODE_ENV === 'production' && 
      authHeader !== \`Bearer \${process.env.CRON_SECRET}\`
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

    // 2. Fetch Listings from the last 15 days
    const fifteenDaysAgo = new Date();
    fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);

    const { data: recentListings, error: listingsError } = await supabase
      .from('listings')
      .select('*, images(url, is_primary)')
      .eq('status', 'ACTIVE_PUBLIC')
      .gte('created_at', fifteenDaysAgo.toISOString())
      .order('created_at', { ascending: false })
      .limit(10); // Keep email size reasonable

    if (listingsError) {
      console.error('Error fetching listings:', listingsError);
      return new NextResponse('Error fetching listings', { status: 500 });
    }

    if (!recentListings || recentListings.length === 0) {
      return NextResponse.json({ message: 'No recent listings. Skip sending email.' });
    }

    // 3. Fetch Subscriber Emails
    // We assume public.users table contains the emails
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

    // 4. Generate HTML and Dispatch
    const htmlBody = generateNewsletterHtml(recentListings);
    
    let sentCount = 0;
    
    // Send in batches or one-by-one. 
    // Resend currently supports up to 50 recipients in a single API call if we use batch API, 
    // but a loop is safer for smaller lists to start with.
    for (const user of users) {
      if (user.email) {
         try {
           await sendEmail(
             user.email,
             '🔥 New Hot Air Balloons on AeroTrade - Bi-Weekly Update',
             htmlBody
           );
           sentCount++;
           // Delay slightly to respect rate limits if needed
           await new Promise(res => setTimeout(res, 100)); 
         } catch (e) {
           console.error(\`Failed to send to \${user.email}\`, e);
         }
      }
    }

    return NextResponse.json({ 
      success: true, 
      message: \`Newsletter sent to \${sentCount} users detailing \${recentListings.length} listings.\` 
    });

  } catch (error) {
    console.error('Newsletter cron error:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
