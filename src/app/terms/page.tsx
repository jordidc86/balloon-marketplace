import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Terms of Service | AeroTrade Marketplace',
}

export default function TermsPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-16 sm:py-24">
      <h1 className="text-4xl font-extrabold tracking-tight mb-8">Terms of Service</h1>
      
      <div className="prose prose-slate dark:prose-invert lg:prose-lg max-w-none">
        <p><strong>Last Updated:</strong> 29 August 2026</p>
        
        <h2>1. Acceptance of Terms</h2>
        <p>By accessing or using the AeroTrade Marketplace ("Platform"), you agree to be bound by these Terms of Service. If you disagree with any part of the terms, you may not access the Platform.</p>
        
        <h2>2. Description of Service</h2>
        <p>AeroTrade is a directory and classifieds platform connecting buyers and sellers of used hot air balloon equipment. We are not a broker, auctioneer, or party to any transaction between users. We do not handle payments for the actual equipment sold.</p>
        
        <h2>3. User Responsibilities</h2>
        <ul>
          <li>You must provide accurate and complete information when creating a listing.</li>
          <li>You are solely responsible for ensuring the equipment listed complies with local aviation authority regulations (e.g., FAA, EASA) regarding airworthiness.</li>
          <li>You agree not to post false, misleading, or fraudulent listings.</li>
          <li>If you submit a buyer enquiry, you must provide genuine contact information and use it only for a legitimate interest in the equipment.</li>
          <li>If you record wanted equipment, you must provide a genuine buying requirement. A recorded request does not guarantee that suitable equipment will be found or that a seller will respond.</li>
        </ul>
        
        <h2>4. Fees and Premium Limits</h2>
        <p>AeroTrade may offer free listings, paid Premium listing promotion for sellers, and an optional subscription fee ("Premium") for buyers. These fees are non-refundable unless otherwise required by law. The 48-Hour Premium window is provided "as is" and subject to system availability.</p>
        
        <h2>5. Limitation of Liability</h2>
        <p>AeroTrade makes no warranties regarding the condition, airworthiness, safety, or legality of any equipment listed. All transactions are at your own risk. AeroTrade shall not be liable for any indirect, incidental, or consequential damages arising from the use of the Platform.</p>

        <h2>6. Verification Badges</h2>
        <p>An AeroTrade document-checked badge means only that AeroTrade recorded a review of seller identity and supporting listing evidence. It is not an airworthiness review, maintenance release, title guarantee, escrow service, physical inspection or recommendation to purchase. Buyers remain responsible for independent technical, legal and financial due diligence.</p>
      </div>
    </div>
  )
}
