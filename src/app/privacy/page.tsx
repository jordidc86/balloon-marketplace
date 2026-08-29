import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacy Policy | AeroTrade Marketplace',
}

export default function PrivacyPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-16 sm:py-24">
      <h1 className="text-4xl font-extrabold tracking-tight mb-8">Privacy Policy</h1>
      
      <div className="prose prose-slate dark:prose-invert lg:prose-lg max-w-none">
        <p><strong>Last Updated:</strong> 29 August 2026</p>
        
        <h2>1. Information We Collect</h2>
        <p>When you register for an AeroTrade account, we collect your name, email address, and optionally your phone number. When you submit an enquiry or record wanted equipment, we store the contact details, requirements, consent choices, relevant listing or equipment category, delivery evidence and commercial status. When you subscribe to Premium or pay for Premium listing promotion, your payment information is processed by Stripe; we do not store your card details on our servers. We retain a private checkout-status record so an interrupted Premium checkout can be resumed without creating another account; it contains no card data or checkout URL.</p>
        
        <h2>2. How We Use Your Information</h2>
        <ul>
          <li>To provide and maintain the Platform.</li>
          <li>To facilitate communication between buyers and sellers via the "Secure Contact Info Reveal" feature.</li>
          <li>To deliver, recover and track buyer enquiries so they are not lost and their commercial outcome can be measured.</li>
          <li>To compare consented wanted-equipment requests with current or future supply and, only when requested, email you about potentially suitable equipment.</li>
          <li>To measure account-linked seller onboarding stages, such as opening or starting the listing form, submitting a listing, opening or resuming checkout, and publication. This private operational record does not store passwords, card data, IP addresses or form text.</li>
          <li>To review seller identity or supporting listing evidence when a seller requests an AeroTrade document-checked badge.</li>
          <li>To send you important email alerts regarding new listings or account changes.</li>
        </ul>
        
        <h2>3. Information Sharing and Disclosure</h2>
        <p>AeroTrade does not sell or rent your personal information to third parties. We only share information in the following circumstances:</p>
        <ul>
          <li><strong>To Buyers:</strong> If you are a seller, your contact information is shared with users who choose to reveal it on public listings, and with Premium users during an active 48-hour Premium window, strictly for the purpose of facilitating the sale.</li>
          <li><strong>To Sellers:</strong> If you send a tracked enquiry, the contact details and message you provide are shared with the seller of that listing.</li>
          <li><strong>Wanted equipment:</strong> A wanted request is private by default. AeroTrade may use it to identify relevant supply; it is not published as a public listing.</li>
          <li><strong>Service Providers:</strong> We use third-party tools (like Stripe for payments and Resend for emails) which have access to limited data strictly to perform their functions.</li>
        </ul>
        
        <h2>4. Data Security</h2>
        <p>Connections to the Platform are encrypted and private operational tables use access controls, including Row Level Security. No internet service can guarantee absolute security.</p>

        <h2>5. Retention and Your Rights</h2>
        <p>We retain marketplace records for as long as reasonably necessary to operate the service, resolve disputes, prevent fraud and maintain commercial evidence. You may contact AeroTrade to request access, correction or deletion where applicable. Some audit and transaction evidence may need to be retained for legal or security reasons.</p>
      </div>
    </div>
  )
}
