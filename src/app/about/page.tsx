import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'About | AeroTrade Marketplace',
  description: 'Learn about AeroTrade, the premium global exchange for hot air balloon equipment.',
}

export default function AboutPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-16 sm:py-24">
      <h1 className="text-4xl font-extrabold tracking-tight mb-8">About AeroTrade</h1>
      
      <div className="prose prose-slate dark:prose-invert lg:prose-lg">
        <p className="lead text-xl text-muted-foreground mb-8">
          AeroTrade was built by pilots, for pilots, to solve the biggest friction in our sport: safely buying and selling used hot air balloon equipment across borders.
        </p>

        <h2 className="text-2xl font-bold mt-12 mb-4">The Global Exchange</h2>
        <p className="mb-6 leading-relaxed">
          For decades, the second-hand balloon market has been fragmented. Finding a specific Cameron basket, a lightly used Ultramagic envelope, or a reliable double burner meant scouring Facebook groups in multiple languages, relying on word of mouth, or hoping you knew the right dealer.
        </p>
        <p className="mb-6 leading-relaxed">
          AeroTrade centralizes the global inventory. We act as an open directory where sellers can list equipment easily, and serious buyers can find exactly what they need based on detailed technical specifications.
        </p>

        <h2 className="text-2xl font-bold mt-12 mb-4">Trust and Security</h2>
        <p className="mb-6 leading-relaxed">
          We understand that hot air balloon equipment involves significant investment and, above all, safety. That's why AeroTrade implements features like the Premium 48-Hour access window and Secure Contact Info reveals to deter spammers and protect the integrity of the transaction between real aviators.
        </p>
        
        <h2 className="text-2xl font-bold mt-12 mb-4">Our Mission</h2>
        <p className="mb-6 leading-relaxed">
          To keep more balloons flying safely by making the transfer of quality equipment as frictionless, transparent, and global as possible.
        </p>
      </div>
    </div>
  )
}
