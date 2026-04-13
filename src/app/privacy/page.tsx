import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacy Policy | AeroTrade Marketplace',
}

export default function PrivacyPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-16 sm:py-24">
      <h1 className="text-4xl font-extrabold tracking-tight mb-8">Privacy Policy</h1>
      
      <div className="prose prose-slate dark:prose-invert lg:prose-lg max-w-none">
        <p><strong>Last Updated:</strong> April 2026</p>
        
        <h2>1. Information We Collect</h2>
        <p>When you register for an AeroTrade account, we collect your name, email address, and optionally your phone number. When you subscribe to Premium or pay a listing fee, your payment information is securely processed by Stripe; we do not store your credit card details on our servers.</p>
        
        <h2>2. How We Use Your Information</h2>
        <ul>
          <li>To provide and maintain the Platform.</li>
          <li>To facilitate communication between buyers and sellers via the "Secure Contact Info Reveal" feature.</li>
          <li>To send you important email alerts regarding new listings or account changes.</li>
        </ul>
        
        <h2>3. Information Sharing and Disclosure</h2>
        <p>AeroTrade does not sell or rent your personal information to third parties. We only share information in the following circumstances:</p>
        <ul>
          <li><strong>To Buyers:</strong> If you are a seller, your contact information is shared with Premium users who choose to securely reveal it, and with public users after the 48-hour window expires, strictly for the purpose of facilitating the sale.</li>
          <li><strong>Service Providers:</strong> We use third-party tools (like Stripe for payments and Resend for emails) which have access to limited data strictly to perform their functions.</li>
        </ul>
        
        <h2>4. Data Security</h2>
        <p>We implement robust security measures to protect your data. Your connection to the Platform is encrypted, and our database is secured with Row Level Security (RLS) to ensure data isolation.</p>
      </div>
    </div>
  )
}
