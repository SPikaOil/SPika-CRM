import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // Public routes
  if (pathname.startsWith('/login') || pathname.startsWith('/auth')) {
    if (user) {
      const url = request.nextUrl.clone()
      url.pathname = '/dashboard'
      return NextResponse.redirect(url)
    }
    return supabaseResponse
  }

  // Portal and its public API routes are public
  if (pathname.startsWith('/portal') || pathname.startsWith('/api/portal')) {
    return supabaseResponse
  }

  // Public store locator (embedded on the website via iframe) + its data API
  if (pathname.startsWith('/storelocator') || pathname.startsWith('/api/storelocator')) {
    return supabaseResponse
  }

  // Every path listed under "crons" in vercel.json has to be here. A cron
  // request carries no cookies, and "cron jobs do not follow redirects":
  // Vercel treats the 307 to /login as the final response, so the route never
  // runs at all. That, not the header name, is why the scheduled reports had
  // never once produced a file.
  //
  // These routes authorise themselves — an admin or staff session, or the
  // Authorization: Bearer that Vercel Cron sends with CRON_SECRET. Adding a
  // cron to vercel.json without adding its path here silently does nothing.
  if (pathname.startsWith('/api/report') || pathname.startsWith('/api/fx')) {
    return supabaseResponse
  }

  // Protected routes — redirect to login if not authenticated
  if (!user) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
