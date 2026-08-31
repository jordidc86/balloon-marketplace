import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'
import { getSafeRedirectPath } from '@/utils/navigation.mjs'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const next = getSafeRedirectPath(requestUrl.searchParams.get('next'))

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) {
      const recovery = next === '/reset-password'
      const destination = recovery ? '/forgot-password' : '/login'
      return NextResponse.redirect(new URL(`${destination}?error=${encodeURIComponent('This secure link is invalid or has expired. Request a new one.')}`, request.url))
    }
  } else {
    return NextResponse.redirect(new URL('/login?error=' + encodeURIComponent('The secure sign-in link is incomplete.'), request.url))
  }

  // URL to redirect to after sign in process completes
  return NextResponse.redirect(new URL(next, request.url))
}
