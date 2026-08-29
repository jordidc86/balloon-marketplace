import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/utils/supabase/server'
import {
  getCatalogManufacturer,
  getCatalogManufacturerPath,
  listingMatchesCatalogManufacturer,
  minimumManufacturerInventoryForIndexing,
} from '@/utils/catalog-manufacturers.mjs'
import { isListingPubliclyIndexable } from '@/utils/marketplace-seo.mjs'
import { CatalogExperience } from '../../page'

type ManufacturerPageProps = {
  params: Promise<{ manufacturer: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

const getPublicManufacturerInventory = async (manufacturerSlug: string) => {
  const manufacturer = getCatalogManufacturer(manufacturerSlug)
  if (!manufacturer) return 0
  const supabase = await createAdminClient()
  const { data } = await supabase
    .from('listings')
    .select('title,details,status,public_at')
    .in('status', ['ACTIVE_PUBLIC', 'ACTIVE_PREMIUM'])

  return (data || []).filter((listing) => (
    isListingPubliclyIndexable(listing) && listingMatchesCatalogManufacturer(listing, manufacturer)
  )).length
}

export async function generateMetadata({ params }: ManufacturerPageProps): Promise<Metadata> {
  const { manufacturer: rawManufacturer } = await params
  const manufacturer = getCatalogManufacturer(rawManufacturer)
  if (!manufacturer) return { title: 'Manufacturer not found | AeroTrade', robots: { index: false, follow: true } }

  const publicInventory = await getPublicManufacturerInventory(manufacturer.slug)
  const title = `${manufacturer.heading} | AeroTrade`
  const canonical = getCatalogManufacturerPath(manufacturer.slug)

  return {
    title,
    description: manufacturer.description,
    alternates: { canonical },
    robots: publicInventory >= minimumManufacturerInventoryForIndexing
      ? { index: true, follow: true, googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1 } }
      : { index: false, follow: true },
    openGraph: { type: 'website', siteName: 'AeroTrade', title, description: manufacturer.description, url: canonical },
    twitter: { card: 'summary', title, description: manufacturer.description },
  }
}

export default async function ManufacturerCatalogPage({ params, searchParams }: ManufacturerPageProps) {
  const { manufacturer: rawManufacturer } = await params
  const manufacturer = getCatalogManufacturer(rawManufacturer)
  if (!manufacturer) notFound()

  return <CatalogExperience searchParams={searchParams} fixedManufacturer={manufacturer.slug} />
}
