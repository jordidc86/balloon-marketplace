import { login, signup } from './actions'
import { AlertCircle } from 'lucide-react'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const params = await searchParams
  const error = params.error

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background">
      <div className="w-full max-w-md p-8 bg-card rounded-2xl shadow-sm border">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">AeroTrade Pilot Log In</h1>
          <p className="text-sm text-muted-foreground mt-2">Enter your email and password to access the marketplace.</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-destructive/10 border border-destructive/20 rounded-lg flex items-start gap-3 text-destructive">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <p className="text-sm">{error}</p>
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

          <div className="pt-4 grid grid-cols-2 gap-4">
            <button
              formAction={login}
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2.5 rounded-lg font-medium transition-colors"
            >
              Log in
            </button>
            <button
              formAction={signup}
              className="w-full bg-secondary text-secondary-foreground hover:bg-secondary/80 px-4 py-2.5 rounded-lg font-medium transition-colors"
            >
              Sign up
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
