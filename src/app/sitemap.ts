import { MetadataRoute } from 'next';
import { createAdminClient } from '@/utils/supabase/server';
import { siteUrl } from '@/utils/site';
import { getListingSearchLastModified, isListingPubliclyIndexable } from '@/utils/marketplace-seo.mjs';
import { getCatalogCategory, getCatalogCategoryPath } from '@/utils/catalog-categories.mjs';
import { getCatalogManufacturerPath, getCatalogManufacturersWithInventory, minimumManufacturerInventoryForIndexing } from '@/utils/catalog-manufacturers.mjs';
import { getCatalogCountriesWithInventory, getCatalogCountryPath, minimumCountryInventoryForIndexing } from '@/utils/catalog-countries.mjs';
import { europeanBuyerLandingPaths } from '@/utils/european-buyer-landings.mjs';

// Listing visibility depends on the current Premium release timestamp. Generate
// the sitemap at request time so builds never freeze or require production data.
export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Static routes
  const routes = [
    { route: '', priority: 1, changeFrequency: 'daily' as const },
    { route: '/catalog', priority: 0.9, changeFrequency: 'daily' as const },
    { route: '/new-balloon', priority: 0.9, changeFrequency: 'monthly' as const },
    { route: '/new-balloon/pasha', priority: 0.8, changeFrequency: 'monthly' as const },
    { route: '/new-balloon/schroeder', priority: 0.8, changeFrequency: 'monthly' as const },
    { route: '/wanted', priority: 0.8, changeFrequency: 'monthly' as const },
    { route: '/sell', priority: 0.8, changeFrequency: 'monthly' as const },
    { route: '/sell-hot-air-balloon', priority: 0.9, changeFrequency: 'monthly' as const },
    { route: '/sell/assisted', priority: 0.8, changeFrequency: 'monthly' as const },
    { route: '/pricing', priority: 0.7, changeFrequency: 'monthly' as const },
    { route: '/about', priority: 0.6, changeFrequency: 'monthly' as const },
    { route: '/contact', priority: 0.6, changeFrequency: 'monthly' as const },
    ...europeanBuyerLandingPaths.map((route) => ({ route, priority: 0.85, changeFrequency: 'daily' as const })),
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
    .select('id, title, details, category, location_country, status, public_at, updated_at, images(url, is_primary)')
    .in('status', ['ACTIVE_PUBLIC', 'ACTIVE_PREMIUM', 'SOLD']);

  // Sold pages remain useful, truthful landing pages for comparable-equipment
  // recovery. Keep them in the sitemap so a status change is recrawled, but do
  // not let sold inventory create category, manufacturer or country facets.
  const publicListings = (listings || [])
    .filter((listing) => isListingPubliclyIndexable(listing));
  const activeListings = publicListings
    .filter((listing) => listing.status !== 'SOLD');

  const soldListingIds = publicListings
    .filter((listing) => listing.status === 'SOLD')
    .map((listing) => listing.id);
  const { data: soldEvents } = soldListingIds.length
    ? await supabase
      .from('listing_lifecycle_events')
      .select('listing_id, created_at')
      .eq('event_type', 'SOLD')
      .in('listing_id', soldListingIds)
    : { data: [] as Array<{ listing_id: string; created_at: string }> };
  const soldAtByListingId = new Map(
    (soldEvents || []).map((event) => [event.listing_id, event.created_at]),
  );

  const listingRoutes = publicListings
    .map((listing) => {
      const lastModified = getListingSearchLastModified(
        listing,
        soldAtByListingId.get(listing.id),
      );
      return {
        url: `${siteUrl}/catalog/${listing.id}`,
        ...(lastModified ? { lastModified } : {}),
        changeFrequency: 'weekly' as const,
        priority: 0.7,
        images: (listing.images || [])
          .map((image) => image.url)
          .filter((url) => typeof url === 'string' && /^https?:\/\//.test(url)),
      };
    });

  const publicCategories = Array.from(new Set(
    activeListings
      .map((listing) => getCatalogCategory(listing.category)?.slug)
      .filter((category): category is string => Boolean(category))
  ));
  const categoryRoutes = publicCategories.map((category) => ({
    url: `${siteUrl}${getCatalogCategoryPath(category)}`,
    changeFrequency: 'daily' as const,
    priority: 0.8,
  }));

  const publicManufacturerRoutes = getCatalogManufacturersWithInventory(
    activeListings,
    minimumManufacturerInventoryForIndexing,
  ).map((manufacturer) => ({
    url: `${siteUrl}${getCatalogManufacturerPath(manufacturer.slug)}`,
    changeFrequency: 'daily' as const,
    priority: 0.8,
  }));

  const publicCountryRoutes = getCatalogCountriesWithInventory(
    activeListings,
    minimumCountryInventoryForIndexing,
  ).map((country) => ({
    url: `${siteUrl}${getCatalogCountryPath(country.slug)}`,
    changeFrequency: 'daily' as const,
    priority: 0.8,
  }));

  return [...routes, ...categoryRoutes, ...publicManufacturerRoutes, ...publicCountryRoutes, ...listingRoutes];
}
