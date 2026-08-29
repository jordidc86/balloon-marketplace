import { MetadataRoute } from 'next';
import { createAdminClient } from '@/utils/supabase/server';
import { siteUrl } from '@/utils/site';
import { isListingPubliclyIndexable } from '@/utils/marketplace-seo.mjs';
import { getCatalogCategory, getCatalogCategoryPath } from '@/utils/catalog-categories.mjs';
import { getCatalogManufacturerPath, getCatalogManufacturersWithInventory, minimumManufacturerInventoryForIndexing } from '@/utils/catalog-manufacturers.mjs';

// Listing visibility depends on the current Premium release timestamp. Generate
// the sitemap at request time so builds never freeze or require production data.
export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Static routes
  const routes = [
    { route: '', priority: 1, changeFrequency: 'daily' as const },
    { route: '/catalog', priority: 0.9, changeFrequency: 'daily' as const },
    { route: '/new-balloon', priority: 0.9, changeFrequency: 'monthly' as const },
    { route: '/wanted', priority: 0.8, changeFrequency: 'monthly' as const },
    { route: '/sell', priority: 0.8, changeFrequency: 'monthly' as const },
    { route: '/sell-hot-air-balloon', priority: 0.9, changeFrequency: 'monthly' as const },
    { route: '/sell/assisted', priority: 0.8, changeFrequency: 'monthly' as const },
    { route: '/pricing', priority: 0.7, changeFrequency: 'monthly' as const },
    { route: '/about', priority: 0.6, changeFrequency: 'monthly' as const },
    { route: '/contact', priority: 0.6, changeFrequency: 'monthly' as const },
  ].map(
    ({ route, priority, changeFrequency }) => ({
      url: `${siteUrl}${route}`,
      changeFrequency,
      priority,
    })
  );

  // Dynamic routes (Listings)
  const supabase = await createAdminClient();
  const { data: listings } = await supabase
    .from('listings')
    .select('id, title, details, category, status, public_at, updated_at, images(url, is_primary)')
    .in('status', ['ACTIVE_PUBLIC', 'ACTIVE_PREMIUM']);

  const listingRoutes = (listings || [])
    .filter((listing) => isListingPubliclyIndexable(listing))
    .map((listing) => ({
      url: `${siteUrl}/catalog/${listing.id}`,
      ...(listing.updated_at ? { lastModified: new Date(listing.updated_at) } : {}),
      changeFrequency: 'weekly' as const,
      priority: 0.7,
      images: (listing.images || [])
        .map((image) => image.url)
        .filter((url) => typeof url === 'string' && /^https?:\/\//.test(url)),
    }));

  const publicCategories = Array.from(new Set(
    (listings || [])
      .filter((listing) => isListingPubliclyIndexable(listing))
      .map((listing) => getCatalogCategory(listing.category)?.slug)
      .filter((category): category is string => Boolean(category))
  ));
  const categoryRoutes = publicCategories.map((category) => ({
    url: `${siteUrl}${getCatalogCategoryPath(category)}`,
    changeFrequency: 'daily' as const,
    priority: 0.8,
  }));

  const publicManufacturerRoutes = getCatalogManufacturersWithInventory(
    (listings || []).filter((listing) => isListingPubliclyIndexable(listing)),
    minimumManufacturerInventoryForIndexing,
  ).map((manufacturer) => ({
    url: `${siteUrl}${getCatalogManufacturerPath(manufacturer.slug)}`,
    changeFrequency: 'daily' as const,
    priority: 0.8,
  }));

  return [...routes, ...categoryRoutes, ...publicManufacturerRoutes, ...listingRoutes];
}
