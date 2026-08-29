import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/utils/supabase/server'
import {
  getCatalogCountry,
  getCatalogCountryPath,
  listingMatchesCatalogCountry,
  minimumCountryInventoryForIndexing,
} from '@/utils/catalog-countries.mjs'
import { isListingPubliclyIndexable } from '@/utils/marketplace-seo.mjs'
import { CatalogExperience } from '../../page'

type CountryPageProps = {
  params: Promise<{ country: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

const getPublicCountryInventory = async (countrySlug: string) => {
  const country = getCatalogCountry(countrySlug)
  if (!country) return 0
  const supabase = await createAdminClient()
  const { data } = await supabase
    .from('listings')
    .select('location_country,status,public_at')
    .in('status', ['ACTIVE_PUBLIC', 'ACTIVE_PREMIUM'])

  return (data || []).filter((listing) => (
    isListingPubliclyIndexable(listing) && listingMatchesCatalogCountry(listing, country)
  )).length
}

export async function generateMetadata({ params }: CountryPageProps): Promise<Metadata> {
  const { country: rawCountry } = await params
  const country = getCatalogCountry(rawCountry)
  if (!country) return { title: 'Country not found | AeroTrade', robots: { index: false, follow: true } }

  const publicInventory = await getPublicCountryInventory(country.slug)
  const title = `${country.heading} | AeroTrade`
  const canonical = getCatalogCountryPath(country.slug)

  return {
    title,
    description: country.description,
    alternates: { canonical },
    robots: publicInventory >= minimumCountryInventoryForIndexing
      ? { index: true, follow: true, googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1 } }
      : { index: false, follow: true },
    openGraph: { type: 'website', siteName: 'AeroTrade', title, description: country.description, url: canonical },
    twitter: { card: 'summary', title, description: country.description },
  }
}

export default async function CountryCatalogPage({ params, searchParams }: CountryPageProps) {
  const { country: rawCountry } = await params
  const country = getCatalogCountry(rawCountry)
  if (!country) notFound()

  return <CatalogExperience searchParams={searchParams} fixedCountry={country.slug} />
}
