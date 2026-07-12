import { NextRequest, NextResponse } from 'next/server'

// Turn any image URL into a data: URL for embedding in a client-generated PDF.
// Delivery photos (pod_file_url) are stored as ".../object/public/pod-files/…"
// but the pod-files bucket is PRIVATE, so that public URL 400s. For Supabase
// Storage URLs we therefore download through the authenticated object endpoint
// with the service-role key; other (external) URLs are fetched directly.
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url')
  if (!url) return NextResponse.json({ error: 'Missing url' }, { status: 400 })

  try {
    let fetchUrl = url
    let headers: Record<string, string> = {}

    const marker = '/storage/v1/object/'
    const idx = url.indexOf(marker)
    if (idx !== -1) {
      // Strip the public/ | sign/ | authenticated/ prefix to get "<bucket>/<path>"
      let rest = url.slice(idx + marker.length).replace(/^(public|sign|authenticated)\//, '')
      // Drop any query string (e.g. an old signed token)
      rest = rest.split('?')[0]
      const base = process.env.NEXT_PUBLIC_SUPABASE_URL
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
      if (base && serviceKey) {
        fetchUrl = `${base}/storage/v1/object/${rest}`
        headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }
      }
    }

    const res = await fetch(fetchUrl, { headers })
    if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`)
    const buffer = await res.arrayBuffer()
    const base64 = Buffer.from(buffer).toString('base64')
    const contentType = res.headers.get('content-type') ?? 'image/png'
    return NextResponse.json({ dataUrl: `data:${contentType};base64,${base64}` })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
