import EuropeanBuyerLanding, { buildEuropeanBuyerLandingMetadata } from '@/components/EuropeanBuyerLanding'
import { getEuropeanBuyerLanding } from '@/utils/european-buyer-landings.mjs'

export const dynamic = 'force-dynamic'

const landing = getEuropeanBuyerLanding('fr')!
export const metadata = buildEuropeanBuyerLandingMetadata(landing)

export default function MontgolfieresOccasionPage() {
  return <EuropeanBuyerLanding landing={landing} />
}
