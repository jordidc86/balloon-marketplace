import { Metadata } from 'next'
import { Mail, MessageCircle, Clock } from 'lucide-react'
import { supportEmail } from '@/utils/site'

export const metadata: Metadata = {
  title: 'Contact Us | AeroTrade Marketplace',
  description: 'Get in touch with the AeroTrade team for support with your listings or account.',
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
              AeroTrade Premium members receive priority response times. Please email us from the address associated with your premium account.
            </p>
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground bg-muted w-fit px-3 py-1.5 rounded-full">
              <Clock className="w-4 h-4" /> Average response: &lt; 24h
            </div>
          </div>
        </div>

        <div className="bg-card border p-8 rounded-2xl shadow-sm">
          <h2 className="text-2xl font-bold mb-4">Send a Message</h2>
          <p className="text-muted-foreground mb-6">
            Email is the fastest way to reach us. Include your listing URL, account email, or balloon details so we can respond with useful context.
          </p>
          <a
            href={`mailto:${supportEmail}?subject=AeroTrade%20support%20request`}
            className="inline-flex w-full items-center justify-center bg-primary text-primary-foreground font-bold py-3 rounded-lg hover:bg-primary/90 transition-colors"
          >
            Email AeroTrade Support
          </a>
        </div>
      </div>
    </div>
  )
}
