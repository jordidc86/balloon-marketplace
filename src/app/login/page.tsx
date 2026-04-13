import { login, signup } from './actions'
import { AlertCircle, CheckCircle } from 'lucide-react'
import Link from 'next/link'
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Log In | AeroTrade Marketplace',
  description: 'Log in to your AeroTrade pilot account to buy and sell hot air balloon equipment.',
}

export default async function LoginPage({

  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const params = await searchParams
  const error = params.error
  const message = params.message


  return (
    <div className="flex min-h-screen bg-background">
      {/* Left side: Login Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8">
        <div className="w-full max-w-md p-8 bg-card rounded-2xl shadow-sm border">
          <div className="mb-8 text-center text-balance">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">AeroTrade Pilot Log In</h1>
          <p className="text-sm text-muted-foreground mt-2">Enter your email and password to access the marketplace.</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-destructive/10 border border-destructive/20 rounded-lg flex items-start gap-3 text-destructive">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        {message && (
          <div className="mb-6 p-4 bg-green-500/10 border border-green-500/20 rounded-lg flex items-start gap-3 text-green-600 dark:text-green-500">
            <CheckCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <p className="text-sm">{message}</p>
          </div>
        )}


        <form className="space-y-4">
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

          <div className="pt-4">
            <button
              formAction={login}
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2.5 rounded-lg font-medium transition-colors"
            >
              Log in
            </button>
          </div>

          <div className="text-center mt-4">
            <p className="text-sm text-muted-foreground">
              Don't have an account?{' '}
              <Link href="/signup" className="text-primary hover:underline">
                Sign up
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
              <div className="bg-primary/20 p-3 rounded-full text-primary shrink-0"><CheckCircle className="w-6 h-6" /></div>
              <div>
                <h3 className="font-semibold text-lg">Verified Sellers & Buyers</h3>
                <p className="text-slate-400 text-sm">Join a trusted community of hot air balloon professionals and enthusiasts.</p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="bg-primary/20 p-3 rounded-full text-primary shrink-0"><CheckCircle className="w-6 h-6" /></div>
              <div>
                <h3 className="font-semibold text-lg">Secure Transactions</h3>
                <p className="text-slate-400 text-sm">We protect your contact information and ensure transparency across all listings.</p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="bg-primary/20 p-3 rounded-full text-primary shrink-0"><CheckCircle className="w-6 h-6" /></div>
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
