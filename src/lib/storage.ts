import { createClient } from '@/lib/supabase/client'

/**
 * A working link to a file in a PRIVATE bucket.
 *
 * `pod-files` holds every signature, every delivery photo and every signed
 * invoice, and it has no public read policy — see 001_initial_schema.sql:420.
 * Five places still built links with getPublicUrl(), which does not ask the
 * bucket anything: it glues a URL together and hands it back. On a private
 * bucket that URL is simply dead, and if it ever were not dead the bucket would
 * be leaking signed customer paperwork to anyone with the address.
 *
 * So: store the PATH, and mint a short-lived signed URL at the moment somebody
 * actually opens it.
 *
 * Rows written before this change hold a full public URL instead of a path.
 * They are not migrated — the path is simply recovered from the URL, so old and
 * new rows both work and nothing has to be back-filled.
 */
export async function signedUrl(
  bucket: string,
  pathOrUrl: string | null | undefined,
  expiresInSeconds = 3600,
): Promise<string | null> {
  if (!pathOrUrl) return null

  const path = storagePath(bucket, pathOrUrl)
  if (!path) return null

  const supabase = createClient()
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresInSeconds)

  if (error) {
    console.error(`[storage] could not sign ${bucket}/${path}:`, error.message)
    return null
  }
  return data?.signedUrl ?? null
}

/**
 * The path inside the bucket, whether it was stored as a path or as one of the
 * old public URLs.
 */
export function storagePath(bucket: string, pathOrUrl: string): string | null {
  const value = pathOrUrl.trim()
  if (!value) return null
  if (!value.startsWith('http')) return value.replace(/^\/+/, '')

  // .../storage/v1/object/public/<bucket>/<path>  — the shape getPublicUrl made.
  const marker = `/${bucket}/`
  const at = value.indexOf(marker)
  if (at === -1) return null
  return decodeURIComponent(value.slice(at + marker.length).split('?')[0])
}

/**
 * Open a private file in a new tab.
 *
 * The tab is opened AFTER the signed URL comes back, never before: pre-opening
 * a blank tab and filling it in later freezes the page on iOS Safari, which is
 * the phone the delivery flow runs on.
 */
export async function openPrivateFile(
  bucket: string,
  pathOrUrl: string | null | undefined,
): Promise<boolean> {
  const url = await signedUrl(bucket, pathOrUrl)
  if (!url) return false
  window.location.href = url
  return true
}
