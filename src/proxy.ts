import { type NextRequest } from 'next/server'
import { updateSession } from '@/utils/supabase/middleware'

export async function proxy(request: NextRequest) {
  const response = await updateSession(request)
  if (request.nextUrl.pathname === '/inquiry/status' || request.nextUrl.pathname === '/inquiry/respond' || request.nextUrl.pathname === '/newsletter/unsubscribe' || request.nextUrl.pathname === '/newsletter/subscribe' || request.nextUrl.pathname === '/seller/availability' || request.nextUrl.pathname === '/forgot-password' || request.nextUrl.pathname === '/reset-password') {
    response.headers.set('Cache-Control', 'private, no-store, max-age=0')
    response.headers.set('Referrer-Policy', 'no-referrer')
    response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet')
  }
  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
