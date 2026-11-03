import { permanentRedirect } from 'next/navigation'

export default async function LegacyGlobalSearch({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams
  const query = typeof q === 'string' ? q.trim().slice(0, 100) : ''
  permanentRedirect(query ? `/catalog?q=${encodeURIComponent(query)}` : '/catalog')
}
