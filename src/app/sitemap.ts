import { MetadataRoute } from 'next';
import { createClient } from '@/utils/supabase/server';
import { siteUrl } from '@/utils/site';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Static routes
  const routes = ['', '/catalog', '/wanted', '/pricing', '/login', '/signup', '/sell', '/new-balloon'].map(
    (route) => ({
      url: `${siteUrl}${route}`,
      lastModified: new Date(),
      changeFrequency: 'daily' as const,
      priority: route === '' ? 1 : 0.8,
    })
  );

  // Dynamic routes (Listings)
  const supabase = await createClient();
  const { data: listings } = await supabase
    .from('listings')
    .select('id, updated_at')
    .in('status', ['ACTIVE_PUBLIC', 'ACTIVE_PREMIUM']);

  const listingRoutes = (listings || []).map((listing) => ({
    url: `${siteUrl}/catalog/${listing.id}`,
    lastModified: new Date(listing.updated_at || new Date()),
    changeFrequency: 'weekly' as const,
    priority: 0.6,
  }));

  return [...routes, ...listingRoutes];
}
