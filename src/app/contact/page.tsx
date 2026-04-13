import { Metadata } from 'next'
import { Mail, MessageCircle, Clock } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Contact Us | AeroTrade Marketplace',
  description: 'Get in touch with the AeroTrade team for support with your listings or account.',
}

export default function ContactPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-16 sm:py-24">
      <div className="text-center mb-16">
        <h1 className="text-4xl font-extrabold tracking-tight mb-4">Contact AeroTrade</h1>
        <p className="text-xl text-muted-foreground">We're here to help keep you flying.</p>
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
            <a href="mailto:support@aerotrade.example.com" className="font-semibold text-foreground hover:text-primary transition-colors">
              support@aerotrade.example.com
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

        {/* Contact Form */}
        <div className="bg-card border p-8 rounded-2xl shadow-sm">
          <h2 className="text-2xl font-bold mb-6">Send a Message</h2>
          <form className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5 text-foreground">Name</label>
              <input type="text" className="w-full px-3 py-2 border rounded-lg bg-input/50 focus:ring-2 focus:ring-primary focus:outline-none" placeholder="Your Name" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5 text-foreground">Email</label>
              <input type="email" className="w-full px-3 py-2 border rounded-lg bg-input/50 focus:ring-2 focus:ring-primary focus:outline-none" placeholder="you@example.com" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5 text-foreground">Subject</label>
              <select className="w-full px-3 py-2 border rounded-lg bg-input/50 focus:ring-2 focus:ring-primary focus:outline-none">
                <option>Questions about Premium</option>
                <option>Help with a Listing</option>
                <option>Report an Issue/Scam</option>
                <option>Other</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5 text-foreground">Message</label>
              <textarea rows={4} className="w-full px-3 py-2 border rounded-lg bg-input/50 focus:ring-2 focus:ring-primary focus:outline-none" placeholder="How can we help?"></textarea>
            </div>
            <button type="button" className="w-full bg-primary text-primary-foreground font-bold py-3 rounded-lg hover:bg-primary/90 transition-colors">
              Send Message
            </button>
            <p className="text-xs text-center text-muted-foreground mt-4">
              This form is for demonstration purposes in the MVP.
            </p>
          </form>
        </div>
      </div>
    </div>
  )
}
