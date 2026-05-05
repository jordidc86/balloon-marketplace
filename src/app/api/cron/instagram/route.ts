import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendEmail } from '@/utils/resend';

export async function GET(request: Request) {
  try {
    // 1. Verify Vercel/Netlify CRON Secret
    const authHeader = request.headers.get('authorization');
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
    
    // First, upgrade ACTIVE_PREMIUM to ACTIVE_PUBLIC if 48h has passed
    const { data: upgradedListings, error: upgradeError } = await supabase
      .from('listings')
      .update({ status: 'ACTIVE_PUBLIC' })
      .eq('status', 'ACTIVE_PREMIUM')
      .lte('public_at', now)
      .select('id');
      
    if (upgradeError) {
      console.error('Error upgrading premium listings to public:', upgradeError);
    } else if (upgradedListings && upgradedListings.length > 0) {
      console.log(`Upgraded ${upgradedListings.length} premium listings to public.`);
    }

    // 3. Find listings ready for Instagram (public_at passed, not yet posted)
    const { data: listingsForIg, error: igError } = await supabase
      .from('listings')
      .select('*, images(url, is_primary), users(email, name)')
      .in('status', ['ACTIVE_PUBLIC', 'ACTIVE_PREMIUM'])
      .lte('public_at', now)
      .eq('instagram_posted', false)
      .order('public_at', { ascending: true })
      .limit(5); // Process in small batches

    if (igError) {
      console.error('Error fetching listings for Instagram:', igError);
      return new NextResponse('Error fetching listings', { status: 500 });
    }

    if (!listingsForIg || listingsForIg.length === 0) {
      return NextResponse.json({ message: 'No listings require Instagram publication at this time.' });
    }

    let processedCount = 0;

    // 4. Send email to admin to post them, and mark as posted
    for (const listing of listingsForIg) {
      const imageUrl = listing.images && listing.images[0]?.url 
        ? listing.images[0].url 
        : 'https://images.unsplash.com/photo-1543326727-cf6c39e8f84c?q=80&w=600&auto=format&fit=crop';
        
      const htmlBody = `
        <h2>🔔 Instagram Post Reminder</h2>
        <p>The following listing has passed its 48h premium window and is ready to be published on Instagram.</p>
        <hr/>
        <h3>${listing.title}</h3>
        <p><strong>Category:</strong> ${listing.category}</p>
        <p><strong>Price:</strong> ${listing.price} ${listing.currency}</p>
        <p><strong>Location:</strong> ${listing.location_country}</p>
        <p><strong>Description:</strong> ${listing.description?.substring(0, 200)}...</p>
        <br/>
        <p><img src="${imageUrl}" alt="Listing Image" style="max-width: 400px; border-radius: 8px;"/></p>
        <br/>
        <a href="https://aerotrade.app/catalog/${listing.id}">View Listing</a>
        <br/><br/>
        <p><i>This listing has now been marked as 'instagram_posted = true' in the database.</i></p>
      `;

      // Assuming an admin email env var, or fallback
      const adminEmail = process.env.ADMIN_EMAIL || 'jordi@balloonconsulting.com';
      
      try {
        await sendEmail(
          adminEmail,
          `Ready for Instagram: ${listing.title}`,
          htmlBody
        );
        
        // Mark as posted
        await supabase
          .from('listings')
          .update({ instagram_posted: true })
          .eq('id', listing.id);
          
        processedCount++;
      } catch (err) {
        console.error(`Failed to process IG notification for listing ${listing.id}`, err);
      }
    }

    return NextResponse.json({ 
      success: true, 
      message: `Processed ${processedCount} listings for Instagram publication.` 
    });

  } catch (error) {
    console.error('Instagram cron error:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
