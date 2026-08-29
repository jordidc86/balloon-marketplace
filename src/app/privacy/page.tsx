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
        <p>When you register for an AeroTrade account, we collect your name, email address, and optionally your phone number. When you submit an enquiry, record wanted equipment, watch a specific listing or request help preparing a sale, we store the contact details, requirements, consent choices, relevant listing or equipment category, delivery evidence and commercial status. A listing watch remains inactive until you confirm it by email; it records its confirmation, current state and notification evidence and includes a signed unsubscribe action. It is used only for material changes to that listing and not for general marketing. An assisted seller may also provide the public URL of an advert on another website so AeroTrade can review the information manually; AeroTrade does not automatically copy or publish that external content. If a buyer adds a non-binding price indication, or either party accepts negotiation, counters or declines through AeroTrade, we retain the amount, response, relationship to the preceding response and email-delivery status as private commercial evidence. A buyer response link is signed for that buyer, enquiry and seller response, expires after 30 days and accepts one response to that seller update. A separate signed status link can display that buyer&apos;s private enquiry and negotiation history for up to 90 days without requiring an account; it is bound to the enquiry and buyer email and is not indexed. These records do not reserve equipment, execute payment or create a sale contract. Assisted-sale requests remain private and do not create or publish a listing. When you subscribe to annual Buyer Early Access or pay once for Seller Launch Promotion, your payment information is processed by Stripe; we do not store your card details on our servers. We retain a private checkout-status record so an interrupted checkout can be resumed without creating another account; it contains no card data or checkout URL.</p>
        <p>To understand whether marketplace demand leads to a seller contact, a wanted-equipment request or a new-balloon quotation, AeroTrade may retain the external referring host, bounded campaign labels and a daily server-generated pseudonymous journey key. The key is created with a one-way HMAC and does not contain or retain the browser identifier, a user identifier, an IP address, a full referring URL or browsing text. Administrator and listing-owner activity is excluded from buyer conversion measurements.</p>
        <p>If a seller requests an AeroTrade listing verification, the platform stores the review state, the closed category of identity and supporting evidence reviewed, the decision reason where applicable, and audit timestamps and actors. This workflow does not upload or retain copies of identity documents, aircraft records, document numbers or evidence links. Original evidence is reviewed outside the platform until a separate, approved retention process exists.</p>
        
        <h2>2. How We Use Your Information</h2>
        <ul>
          <li>To provide and maintain the Platform.</li>
          <li>To facilitate communication between buyers and sellers via the "Secure Contact Info Reveal" feature.</li>
          <li>To deliver, recover and track buyer enquiries so they are not lost and their commercial outcome can be measured.</li>
          <li>To compare consented wanted-equipment requests with current or future supply and, only when requested, email you about potentially suitable equipment.</li>
          <li>To confirm and operate a listing-specific watch you requested, sending one operational alert when its price, availability, condition or location materially changes.</li>
          <li>To measure account-linked seller onboarding stages, such as opening or starting the listing form, submitting a listing, opening or resuming checkout, and publication. A closed entry-point label may distinguish navigation, seller search content, the dashboard or assisted conversion; it stores no page URL or campaign free text. This private operational record does not store passwords, card data, IP addresses or draft form text.</li>
          <li>To help a consenting owner prepare a normal marketplace listing when photos, documents, description or price are not yet ready.</li>
          <li>To review seller identity or supporting listing evidence when a seller requests an AeroTrade document-checked badge.</li>
          <li>To send you important email alerts regarding new listings or account changes.</li>
        </ul>
        
        <h2>3. Information Sharing and Disclosure</h2>
        <p>AeroTrade does not sell or rent your personal information to third parties. We only share information in the following circumstances:</p>
        <ul>
          <li><strong>To Buyers:</strong> If you are a seller, your contact information is shared with users who choose to reveal it on public listings, and with Buyer Early Access members during an active 48-hour early-access window, strictly for the purpose of facilitating the sale.</li>
          <li><strong>To Sellers:</strong> If you send a tracked enquiry, the contact details and message you provide are shared with the seller of that listing.</li>
          <li><strong>Wanted equipment:</strong> A wanted request is private by default. AeroTrade may use it to identify relevant supply; it is not published as a public listing.</li>
          <li><strong>Listing watches:</strong> A watch and its email address remain private. Sellers can see only the aggregate number of confirmed watchers for their own listings.</li>
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
