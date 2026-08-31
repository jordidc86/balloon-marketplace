import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import "./globals.css";
import { siteUrl } from '@/utils/site'
import { buildMarketplaceIdentityJsonLd, serializeJsonLd } from '@/utils/marketplace-seo.mjs'

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "AeroTrade | Global Hot Air Balloon Marketplace",
  description: "The private global exchange for lighter-than-air aviation. Buy and sell used hot air balloons, baskets, burners, and accessories.",
  openGraph: {
    type: 'website',
    siteName: 'AeroTrade',
    title: 'AeroTrade | Global Hot Air Balloon Marketplace',
    description: 'Buy and sell used hot air balloons, envelopes, baskets, burners and accessories across Europe and worldwide.',
    url: siteUrl,
  },
  alternates: {
    types: {
      'application/rss+xml': `${siteUrl}/feed.xml`,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen flex flex-col`}
      >
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(buildMarketplaceIdentityJsonLd(siteUrl)) }}
        />
        <Navbar />
        <main className="flex-1">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}
