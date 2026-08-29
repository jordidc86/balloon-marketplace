import { Metadata } from 'next'
import { Mail, MessageCircle, Clock } from 'lucide-react'
import { supportEmail } from '@/utils/site'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Contact Us | AeroTrade Marketplace',
  description: 'Contact AeroTrade for marketplace support or request an indicative budget for a factory-new Pasha or Schroeder hot air balloon.',
}

export default function ContactPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-16 sm:py-24">
      <div className="text-center mb-16">
        <h1 className="text-4xl font-extrabold tracking-tight mb-4">Contact AeroTrade</h1>
        <p className="text-xl text-muted-foreground">We are here to help keep you flying.</p>
      </div>
      
      <div className="grid md:grid-cols-2 gap-12">
        {/* Contact Info */}
        <div className="space-y-8">
          <div className="bg-card border p-6 rounded-2xl shadow-sm">
            <h2 className="text-xl font-bold flex items-center gap-2 mb-4">
              <Mail className="text-primary w-5 h-5" /> General Inquiries
            </h2>
            <p className="text-muted-foreground mb-4">
              For questions about the platform, feedback, or general support, reach out to us via email.
            </p>
            <a href={`mailto:${supportEmail}`} className="font-semibold text-foreground hover:text-primary transition-colors">
              {supportEmail}
            </a>
          </div>

          <div className="bg-card border p-6 rounded-2xl shadow-sm">
            <h2 className="text-xl font-bold flex items-center gap-2 mb-4">
              <MessageCircle className="text-primary w-5 h-5" /> Premium Support
            </h2>
            <p className="text-muted-foreground mb-4">
              For account or billing questions, email us from the address associated with your AeroTrade account so we can identify the correct record safely.
            </p>
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground bg-muted w-fit px-3 py-1.5 rounded-full">
              <Clock className="w-4 h-4" /> Average response: &lt; 24h
            </div>
          </div>
        </div>

        <div className="bg-card border p-8 rounded-2xl shadow-sm">
          <h2 className="text-2xl font-bold mb-4">Need a new balloon?</h2>
          <p className="text-muted-foreground mb-6">
            If you did not find the right used aircraft, AeroTrade can also help you buy a factory-new Pasha or Schroeder balloon. Tell us the intended use and configuration to receive an indicative budget.
          </p>
          <Link
            href="/new-balloon?source=contact"
            className="mb-3 inline-flex w-full items-center justify-center bg-primary text-primary-foreground font-bold py-3 rounded-lg hover:bg-primary/90 transition-colors"
          >
            Request a New-Balloon Budget
          </Link>
          <a
            href={`mailto:${supportEmail}?subject=AeroTrade%20support%20request`}
            className="inline-flex w-full items-center justify-center border border-primary/30 bg-background text-primary font-bold py-3 rounded-lg hover:bg-primary/5 transition-colors"
          >
            Email AeroTrade Support
          </a>
        </div>
      </div>
    </div>
  )
}
