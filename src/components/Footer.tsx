import Link from 'next/link'
import { Plane } from 'lucide-react'

export default function Footer() {
  return (
    <footer className="bg-slate-900 border-t border-slate-800 text-slate-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          
          <div className="md:col-span-1">
            <div className="flex items-center gap-2 text-white mb-4">
              <Plane className="h-6 w-6 text-primary" />
              <span className="font-bold text-xl tracking-tight">AeroTrade</span>
            </div>
            <p className="text-sm text-slate-400">
              The premium global exchange for used hot air balloon equipment. Buy, sell, and fly with confidence.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-white mb-4">Marketplace</h3>
            <ul className="space-y-2 text-sm">
              <li><Link href="/catalog?category=complete" className="hover:text-primary transition-colors">Complete Balloons</Link></li>
              <li><Link href="/catalog?category=envelopes" className="hover:text-primary transition-colors">Envelopes</Link></li>
              <li><Link href="/catalog?category=baskets" className="hover:text-primary transition-colors">Baskets</Link></li>
              <li><Link href="/catalog?category=burners" className="hover:text-primary transition-colors">Burners</Link></li>
              <li><Link href="/catalog?category=cylinders" className="hover:text-primary transition-colors">Cylinders</Link></li>
              <li><Link href="/catalog?category=other-equipment" className="hover:text-primary transition-colors">Other Equipment</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-white mb-4">Members</h3>
            <ul className="space-y-2 text-sm">
              <li><Link href="/pricing" className="hover:text-primary transition-colors">Premium Access</Link></li>
              <li><Link href="/sell" className="hover:text-primary transition-colors">List Equipment</Link></li>
              <li><Link href="/dashboard" className="hover:text-primary transition-colors">Pilot Dashboard</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-white mb-4">Company</h3>
            <ul className="space-y-2 text-sm">
              <li><Link href="/about" className="hover:text-primary transition-colors">About AeroTrade</Link></li>
              <li><Link href="/contact" className="hover:text-primary transition-colors">Contact Us</Link></li>
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
