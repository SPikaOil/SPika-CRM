import { createClient } from '@/lib/supabase/server'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Is this Drive file actually reachable WITHOUT a Google account?
 *
 * Why this route exists: her own browser is signed in to Google, so a file left
 * on "Restricted" opens perfectly for her and shows a Google sign-in to every
 * reseller. She would never see it. Proven on 2026-08-15 with a real file — the
 * folder looked fine and was closed. At thirty assets one will be forgotten.
 *
 * SECURITY — this route takes a FILE ID, never a URL. It builds the Google
 * address itself. An endpoint that fetches whatever URL you hand it is exactly
 * how /api/image-proxy turned into a hole (commit bb18abf, deleted); this one
 * cannot be aimed at anything but drive.google.com.
 */

const DRIVE_ID = /^[A-Za-z0-9_-]{20,}$/

export async function POST(request: NextRequest) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  // Only the people who may publish an asset may run this check.
  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (!['admin', 'marketing'].includes(profile?.role ?? '')) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  }

  const { fileId } = await request.json().catch(() => ({ fileId: null }))
  if (!fileId || !DRIVE_ID.test(String(fileId))) {
    return NextResponse.json({ status: 'invalid', message: 'That is not a Drive file id' }, { status: 400 })
  }

  // The thumbnail endpoint is the cheap probe: a real file answers with an
  // image, a closed one answers with the sign-in page as HTML. Asking for 64px
  // keeps it to a few kB instead of downloading a 100 MB clip.
  const probe = `https://drive.google.com/thumbnail?id=${fileId}&sz=w64`

  try {
    const res = await fetch(probe, {
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'SPika-CRM link check' },
    })
    const type = res.headers.get('content-type') ?? ''

    if (type.startsWith('image/')) {
      return NextResponse.json({ status: 'public' })
    }

    return NextResponse.json({
      status: 'private',
      message: 'This file is not set to "Anyone with the link". A reseller would see a Google sign-in instead of a download.',
    })
  } catch {
    // Could not reach Google — say so honestly rather than claiming it is fine
    // or claiming it is broken. The form lets a save through on this answer.
    return NextResponse.json({
      status: 'unknown',
      message: 'Could not reach Google to check this link.',
    })
  }
}
