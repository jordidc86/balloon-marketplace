export const catalogCategories = [
  {
    slug: 'complete',
    label: 'Complete Balloons',
    heading: 'Used hot air balloons for sale',
    description: 'Browse complete used hot air balloon systems listed by European and international sellers, or request a new Pasha or Schroeder balloon if the right aircraft is not available.',
  },
  {
    slug: 'envelopes',
    label: 'Envelopes',
    heading: 'Used hot air balloon envelopes for sale',
    description: 'Compare used hot air balloon envelopes by manufacturer, model, condition and location, with a direct path to record an unmet requirement.',
  },
  {
    slug: 'baskets',
    label: 'Baskets',
    heading: 'Used hot air balloon baskets for sale',
    description: 'Find used hot air balloon baskets and passenger compartments offered by marketplace sellers across Europe and worldwide.',
  },
  {
    slug: 'burners',
    label: 'Burners',
    heading: 'Used hot air balloon burners for sale',
    description: 'Browse used hot air balloon burner systems with seller-declared condition, location and supporting details.',
  },
  {
    slug: 'bottom-end',
    label: 'Bottom Ends',
    heading: 'Used hot air balloon bottom ends for sale',
    description: 'Find complete used bottom-end packages, baskets and burner combinations from hot air balloon sellers.',
  },
  {
    slug: 'cylinders',
    label: 'Cylinders',
    heading: 'Used hot air balloon cylinders for sale',
    description: 'Browse used hot air balloon fuel cylinders and record the exact equipment requirement when no suitable listing is available.',
  },
  {
    slug: 'other-equipment',
    label: 'Other Equipment',
    heading: 'Used hot air balloon equipment for sale',
    description: 'Browse additional used hot air balloon equipment and aviation accessories listed in the AeroTrade marketplace.',
  },
]

export const getCatalogCategory = (value) => {
  if (typeof value !== 'string') return null
  return catalogCategories.find((category) => category.slug === value.trim().toLowerCase()) || null
}

export const getCatalogCategoryPath = (slug) => `/catalog/category/${encodeURIComponent(slug)}`
