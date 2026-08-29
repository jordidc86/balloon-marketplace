import EuropeanBuyerLanding, { buildEuropeanBuyerLandingMetadata } from '@/components/EuropeanBuyerLanding'
import { getEuropeanBuyerLanding } from '@/utils/european-buyer-landings.mjs'

export const dynamic = 'force-dynamic'

const landing = getEuropeanBuyerLanding('de')!
export const metadata = buildEuropeanBuyerLandingMetadata(landing)

export default function GebrauchteHeissluftballonsPage() {
  return <EuropeanBuyerLanding landing={landing} />
}
