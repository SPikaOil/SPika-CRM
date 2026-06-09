import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as 'magiclink' | 'email' | 'recovery' | null
  const next = searchParams.get('next') ?? '/portal'

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )

  let error = null

  if (code) {
    // PKCE flow
    const result = await supabase.auth.exchangeCodeForSession(code)
    error = result.error
  } else if (token_hash && type) {
    // OTP / magic link flow
    const result = await supabase.auth.verifyOtp({ token_hash, type })
    error = result.error
  }

  if (!error) {
    // Use x-forwarded-host on Vercel to get the real hostname
    const forwardedHost = request.headers.get('x-forwarded-host')
    const redirectBase = forwardedHost
      ? `https://${forwardedHost}`
      : origin
    return NextResponse.redirect(`${redirectBase}${next}`)
  }

  // Auth failed — back to portal login
  return NextResponse.redirect(`${origin}/portal`)
}
