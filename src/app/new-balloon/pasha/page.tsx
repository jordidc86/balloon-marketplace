import type { Metadata } from 'next'
import NewBalloonManufacturerLanding from '@/components/NewBalloonManufacturerLanding'
import { getNewBalloonManufacturer } from '@/utils/new-balloon-manufacturers.mjs'

export const metadata: Metadata = {
  title: 'New Pasha Hot Air Balloon Quote | AeroTrade',
  description: 'Request an indicative configuration and budget direction for a factory-new Pasha hot air balloon through AeroTrade.',
  alternates: { canonical: '/new-balloon/pasha' },
  openGraph: {
    type: 'website',
    siteName: 'AeroTrade',
    title: 'Plan a New Pasha Hot Air Balloon | AeroTrade',
    description: 'A practical route from capacity and mission to an indicative Pasha configuration and budget direction.',
    url: '/new-balloon/pasha',
  },
}

export default function NewPashaBalloonPage() {
  const manufacturer = getNewBalloonManufacturer('pasha')!
  return <NewBalloonManufacturerLanding manufacturer={manufacturer} />
}
