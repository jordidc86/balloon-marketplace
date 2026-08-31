import Link from 'next/link'
import { getCatalogCategoryPath } from '@/utils/catalog-categories.mjs'
import { Plane } from 'lucide-react'

export default function Footer() {
  return (
    <footer className="bg-slate-900 border-t border-slate-800 text-slate-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-8">
          
          <div className="md:col-span-1">
            <div className="flex items-center gap-2 text-white mb-4">
              <Plane className="h-6 w-6 text-primary" />
              <span className="font-bold text-xl tracking-tight">AeroTrade</span>
            </div>
            <p className="text-sm text-slate-400">
              The European marketplace for used hot air balloon equipment. Buy, sell, and fly with confidence.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-white mb-4">Marketplace</h3>
            <ul className="space-y-2 text-sm">
              <li><Link href={getCatalogCategoryPath('complete')} className="hover:text-primary transition-colors">Complete Balloons</Link></li>
              <li><Link href={getCatalogCategoryPath('envelopes')} className="hover:text-primary transition-colors">Envelopes</Link></li>
              <li><Link href={getCatalogCategoryPath('baskets')} className="hover:text-primary transition-colors">Baskets</Link></li>
              <li><Link href={getCatalogCategoryPath('burners')} className="hover:text-primary transition-colors">Burners</Link></li>
              <li><Link href={getCatalogCategoryPath('cylinders')} className="hover:text-primary transition-colors">Cylinders</Link></li>
              <li><Link href={getCatalogCategoryPath('other-equipment')} className="hover:text-primary transition-colors">Other Equipment</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-white mb-4">Buy in Europe</h3>
            <ul className="space-y-2 text-sm">
              <li><Link href="/used-hot-air-balloons-for-sale" className="hover:text-primary transition-colors">Used Balloons in Europe</Link></li>
              <li><Link href="/de/gebrauchte-heissluftballons" className="hover:text-primary transition-colors">Gebrauchte Ballone</Link></li>
              <li><Link href="/fr/montgolfieres-occasion" className="hover:text-primary transition-colors">Montgolfières d’occasion</Link></li>
              <li><Link href="/es/globos-aerostaticos-segunda-mano" className="hover:text-primary transition-colors">Globos de segunda mano</Link></li>
              <li><Link href="/new-balloon?source=footer" className="hover:text-primary transition-colors">Price a New Balloon</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-white mb-4">Members</h3>
            <ul className="space-y-2 text-sm">
              <li><Link href="/pricing" className="hover:text-primary transition-colors">Buyer Early Access</Link></li>
              <li><Link href="/sell-hot-air-balloon" className="hover:text-primary transition-colors">Sell a Balloon</Link></li>
              <li><Link href="/dashboard" className="hover:text-primary transition-colors">Pilot Dashboard</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-white mb-4">Company</h3>
            <ul className="space-y-2 text-sm">
              <li><Link href="/about" className="hover:text-primary transition-colors">About AeroTrade</Link></li>
              <li><Link href="/contact" className="hover:text-primary transition-colors">Contact Us</Link></li>
              <li><Link href="/feed.xml" className="hover:text-primary transition-colors">Active Inventory Feed</Link></li>
              <li><Link href="/terms" className="hover:text-primary transition-colors">Terms of Service</Link></li>
              <li><Link href="/privacy" className="hover:text-primary transition-colors">Privacy Policy</Link></li>
            </ul>
          </div>
          
        </div>
        
        <div className="border-t border-slate-800 mt-12 pt-8 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <p>© {new Date().getFullYear()} AeroTrade Marketplace. All rights reserved.</p>
          <div className="flex gap-4">
            <span className="flex items-center gap-1">Built for pilots, by pilots.</span>
          </div>
        </div>
      </div>
    </footer>
  )
}
