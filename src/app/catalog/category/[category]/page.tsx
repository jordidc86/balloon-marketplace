import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/utils/supabase/server'
import { getCatalogCategory, getCatalogCategoryPath } from '@/utils/catalog-categories.mjs'
import { isListingPubliclyIndexable } from '@/utils/marketplace-seo.mjs'
import { CatalogExperience } from '../../page'

type CategoryPageProps = {
  params: Promise<{ category: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

const getPublicCategoryInventory = async (category: string) => {
  const supabase = await createAdminClient()
  const { data } = await supabase
    .from('listings')
    .select('status, public_at')
    .eq('category', category)
    .in('status', ['ACTIVE_PUBLIC', 'ACTIVE_PREMIUM'])

  return (data || []).filter((listing) => isListingPubliclyIndexable(listing)).length
}

export async function generateMetadata({ params }: CategoryPageProps): Promise<Metadata> {
  const { category: rawCategory } = await params
  const category = getCatalogCategory(rawCategory)
  if (!category) return { title: 'Category not found | AeroTrade', robots: { index: false, follow: true } }

  const publicInventory = await getPublicCategoryInventory(category.slug)
  const title = `${category.heading} | AeroTrade`

  return {
    title,
    description: category.description,
    alternates: { canonical: getCatalogCategoryPath(category.slug) },
    robots: publicInventory > 0
      ? { index: true, follow: true, googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1 } }
      : { index: false, follow: true },
    openGraph: {
      type: 'website',
      siteName: 'AeroTrade',
      title,
      description: category.description,
      url: getCatalogCategoryPath(category.slug),
    },
    twitter: { card: 'summary', title, description: category.description },
  }
}

export default async function CategoryCatalogPage({ params, searchParams }: CategoryPageProps) {
  const { category: rawCategory } = await params
  const category = getCatalogCategory(rawCategory)
  if (!category) notFound()

  return <CatalogExperience searchParams={searchParams} fixedCategory={category.slug} />
}
