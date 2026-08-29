import type { Metadata } from 'next'
import NewBalloonManufacturerLanding from '@/components/NewBalloonManufacturerLanding'
import { getNewBalloonManufacturer } from '@/utils/new-balloon-manufacturers.mjs'

export const metadata: Metadata = {
  title: 'New Schroeder Hot Air Balloon Quote | AeroTrade',
  description: 'Request an indicative configuration and budget direction for a factory-new Schroeder hot air balloon through AeroTrade.',
  alternates: { canonical: '/new-balloon/schroeder' },
  openGraph: {
    type: 'website',
    siteName: 'AeroTrade',
    title: 'Plan a New Schroeder Hot Air Balloon | AeroTrade',
    description: 'A practical route from capacity and mission to an indicative Schroeder configuration and budget direction.',
    url: '/new-balloon/schroeder',
  },
}

export default function NewSchroederBalloonPage() {
  const manufacturer = getNewBalloonManufacturer('schroeder')!
  return <NewBalloonManufacturerLanding manufacturer={manufacturer} />
}
