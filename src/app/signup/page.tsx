import { signupWithDetails } from '../login/actions'
import { AlertCircle } from 'lucide-react'
import Link from 'next/link'
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Sign Up | AeroTrade Marketplace',
  description: 'Create an AeroTrade pilot account to buy and sell hot air balloon equipment worldwide.',
}

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const params = await searchParams
  const error = params.error

  return (
    <div className="flex min-h-screen bg-background">
      {/* Left side: Signup Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8">
        <div className="w-full max-w-md p-8 bg-card rounded-2xl shadow-sm border">
          <div className="mb-8 text-center text-balance">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Create Pilot Account</h1>
          <p className="text-sm text-muted-foreground mt-2">Enter your details to register in the marketplace.</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-destructive/10 border border-destructive/20 rounded-lg flex items-start gap-3 text-destructive">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        <form className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="name" className="text-sm font-medium text-foreground">
              Full Name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              className="w-full px-3 py-2 border rounded-lg bg-input/50 focus:bg-background focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-colors"
              placeholder="John Doe"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="email" className="text-sm font-medium text-foreground">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              className="w-full px-3 py-2 border rounded-lg bg-input/50 focus:bg-background focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-colors"
              placeholder="pilot@example.com"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="phone" className="text-sm font-medium text-foreground">
              Phone Number
            </label>
            <input
              id="phone"
              name="phone"
              type="tel"
              className="w-full px-3 py-2 border rounded-lg bg-input/50 focus:bg-background focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-colors"
              placeholder="+34 600 000 000"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="password" className="text-sm font-medium text-foreground">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              className="w-full px-3 py-2 border rounded-lg bg-input/50 focus:bg-background focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-colors"
              placeholder="••••••••"
            />
          </div>

          <div className="pt-2">
            <div className="flex items-start gap-3 border p-4 rounded-xl bg-primary/10 border-primary/30">
              <input
                id="premium"
                name="is_premium"
                type="checkbox"
                className="mt-1 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
              />
              <div>
                <label htmlFor="premium" className="text-sm font-medium text-foreground">
                  Join AeroTrade Premium Club (€9.99/year)
                </label>
                <p className="text-xs text-muted-foreground mt-1">
                  Get 48-hour early access and alerts. Upgrade during registration!
                </p>
              </div>
            </div>
          </div>


          <div className="pt-4">
            <button
              formAction={signupWithDetails}
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2.5 rounded-lg font-medium transition-colors"
            >
              Sign up
            </button>
          </div>

          <div className="text-center mt-4">
            <p className="text-sm text-muted-foreground">
              Already have an account?{' '}
              <Link href="/login" className="text-primary hover:underline">
                Log in
              </Link>
            </p>
          </div>
        </div>
      </div>

      {/* Right side: Trust Signals Panel */}
      <div className="hidden lg:flex flex-1 bg-slate-900 text-white items-center justify-center p-12 relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1549448009-41a4a49c4aa0?q=80&w=2000')] opacity-20 bg-cover bg-center"></div>
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900 to-slate-900/40"></div>
        
        <div className="max-w-md relative z-10 space-y-8">
          <h2 className="text-4xl font-bold">The Global Exchange for Pilots.</h2>
          <div className="space-y-6">
            <div className="flex items-start gap-4">
              <div className="bg-primary/20 p-3 rounded-full text-primary shrink-0"><AlertCircle className="w-6 h-6 border-none" /></div>
              <div>
                <h3 className="font-semibold text-lg">Verified Sellers & Buyers</h3>
                <p className="text-slate-400 text-sm">Join a trusted community of hot air balloon professionals and enthusiasts.</p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="bg-primary/20 p-3 rounded-full text-primary shrink-0"><AlertCircle className="w-6 h-6 border-none" /></div>
              <div>
                <h3 className="font-semibold text-lg">Secure Transactions</h3>
                <p className="text-slate-400 text-sm">We protect your contact information and ensure transparency across all listings.</p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="bg-primary/20 p-3 rounded-full text-primary shrink-0"><AlertCircle className="w-6 h-6 border-none" /></div>
              <div>
                <h3 className="font-semibold text-lg">Premium Market Access</h3>
                <p className="text-slate-400 text-sm">Get 48-hour early access to rare and highly sought-after equipment.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
