import { Order, Quote } from '@/types'

function sanitize(str: string) {
  return str.replace(/[#/\\:*?"<>|]/g, '').trim()
}

// Reduces a name to plain ASCII that every phone, share extension and storage
// key can carry: accents lose their marks (Curaçao -> Curacao), curly quotes
// become straight ones, and anything still outside printable ASCII is dropped.
// '#' goes too — in a URL it starts the fragment, so a name containing one can
// be silently truncated by whatever handles the file downstream.
function toPlainAscii(str: string) {
  return str
    // NFD splits an accented letter into the plain letter + a combining mark,
    // so the ASCII filter below keeps the letter and drops only the mark.
    .normalize('NFD')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[#/\\:*?"<>|]/g, '')
    .replace(/[^ -~]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// THE one name every order document carries when it leaves the app —
// download, share sheet, WhatsApp, e-mail attachment:
//
//     729108 - Supermercado Luz.pdf
//
// The order number is normalised, not copied: 45 are stored as '#729108' and
// 22 as '729132'. The '#' is deliberately NOT kept (the user asked for it, then
// released it while chasing the iOS share failure) because the same string is
// also used as a Supabase storage key in the share fallback, where a '#' would
// cut the URL in half.
//
// NOT for the signed-note storage paths. Those files are already saved under
// their historic names and `orders.signed_pdf_url` points at them — renaming
// that scheme would orphan every existing proof document.
export function documentFilename(
  orderNumber: string | null | undefined,
  customerName: string | null | undefined,
): string {
  const num = toPlainAscii(orderNumber ?? '').replace(/^#+\s*/, '')
  const customer = toPlainAscii(customerName ?? '')
  if (num && customer) return `${num} - ${customer}.pdf`
  return `${num || customer || 'document'}.pdf`
}

/**
 * The filename for an order's own documents.
 *
 * A cash sale drops the customer name: the invoice itself says "Cash Payment",
 * so leaving the buyer in the filename would hand over on the file system
 * exactly what the document deliberately leaves out. One helper for all six
 * download paths, because a rule that lives in six places is a rule that will
 * be forgotten in one of them.
 */
export function orderDocumentFilename(
  order: { order_number?: string | null; cash_invoice?: boolean | null; customer?: { company_name?: string | null } | null } | null | undefined,
  fallbackNumber?: string,
): string {
  const number = order?.order_number ?? fallbackNumber
  if (order?.cash_invoice) return documentFilename(number, null)
  return documentFilename(number, order?.customer?.company_name)
}

export function isMobileDevice() {
  return typeof navigator !== 'undefined' && /Android|iPad|iPhone|iPod/.test(navigator.userAgent)
}

// Open a stored PDF in the phone's own viewer via a real, correctly-named URL.
// The `download` option makes Supabase serve Content-Disposition: attachment
// with the given filename, so iOS treats it as a FILE: the native Share sheet
// then shares the PDF itself (with the real name) instead of tagging the long
// signed URL along as message text. Avoids navigator.share ("Cannot Send
// Message") and blob: URLs ("blob" filename). Same-tab navigation opens it on
// screen; the back button returns to the CRM.
export async function openStoredPdfInViewer(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any, storagePath: string, downloadName?: string,
): Promise<boolean> {
  const { data, error } = await supabase.storage
    .from('pod-files')
    .createSignedUrl(storagePath, 600, downloadName ? { download: downloadName } : undefined)
  if (error || !data?.signedUrl) return false
  window.location.href = data.signedUrl
  return true
}

// Upload an ephemeral generated PDF under a real name, then open it in the
// viewer (used for Invoice / Delivery Note which aren't stored otherwise).
// A UNIQUE key per attempt, deliberately. `pod-files` has an insert policy but
// no update policy, so re-uploading an existing key is rejected by RLS with
// "new row violates row-level security policy" — writing to `generated/<name>`
// therefore worked exactly once per document and failed silently ever after.
// The name the user sees does not come from this key anyway: it comes from the
// signed URL's `download` option below.
export async function uploadAndOpenInViewer(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any, blob: Blob, filename: string,
): Promise<boolean> {
  const key = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const path = `generated/${key}.pdf`
  const { error } = await supabase.storage.from('pod-files')
    .upload(path, blob, { contentType: 'application/pdf' })
  if (error) return false
  return openStoredPdfInViewer(supabase, path, filename)
}

function anchorDownload(file: File, filename: string) {
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 30000)
}

// IMPORTANT: never open a tab/window before calling this. On iOS Safari,
// window.open() switches to the new tab and FREEZES the calling page, so the
// PDF that was still being generated never finishes — the user stares at a
// permanently blank tab. Generate first (page stays foreground), then hand
// the finished file over here.
export function triggerDownload(blob: Blob, filename: string, legacyTab?: Window | null) {
  // Close any tab a legacy caller still opened — it would otherwise stay blank
  try { legacyTab?.close() } catch { /* ignore */ }
  // Plain save. Sharing is handled by the in-app viewer's Share button
  // (navigator.share of the file) — never here, to avoid the "Cannot Send
  // Message" failure that title+files sharing caused on iOS.
  anchorDownload(new File([blob], filename, { type: blob.type || 'application/pdf' }), filename)
}

// Hand a finished PDF to the phone, best route first, and NEVER swallow a
// failure: the old version silently fell back to a download when the share
// sheet errored, so the only thing the user ever saw was "cannot send" with no
// clue why. Every problem is reported through `onProblem` before the next
// route is tried.
export async function sharePdfFile(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  file: File,
  onProblem: (message: string) => void,
): Promise<void> {
  // 1. Native share sheet with the file attached — this is what drops the PDF
  //    straight into WhatsApp when the device plays along.
  const canShareFile =
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [file] })

  if (canShareFile) {
    try {
      await navigator.share({ files: [file] })
      return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      // The user closing the sheet is not a failure.
      if (err?.name === 'AbortError') return
      onProblem(`Share sheet failed (${err?.name ?? 'unknown'}: ${err?.message ?? '-'}). Opening the file instead.`)
    }
  } else {
    onProblem('This device cannot send the file through the share button. Opening the file instead.')
  }

  // 2. Put it on a real https URL under its real name and open that. iOS then
  //    treats it as a proper document and its OWN share button sends it to
  //    WhatsApp — the Web Share API is not involved at all.
  try {
    if (await uploadAndOpenInViewer(supabase, file, file.name)) return
    onProblem('Could not stage the file for viewing. Downloading it instead.')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (err: any) {
    onProblem(`Could not stage the file (${err?.message ?? 'unknown error'}). Downloading it instead.`)
  }

  // 3. Last resort: a plain download.
  triggerDownload(file, file.name)
}

export async function downloadDeliveryNotePDF(
  order: Order,
  showPrices = true,
  documentType: 'DELIVERY NOTE' | 'INVOICE' = 'DELIVERY NOTE'
) {
  const { pdf } = await import('@react-pdf/renderer')
  const React = await import('react')
  const { DeliveryNotePDF } = await import('@/components/pdf/delivery-note-pdf')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  // Batch numbers come from the stock movements, not from the order: one order
  // can be picked from two batches. Missing batches simply print nothing.
  const { fetchOrderBatches } = await import('@/lib/order-batches')
  const batches = await fetchOrderBatches(order.id)
  const element = React.createElement(DeliveryNotePDF as any, { order, showPrices, documentType, batches })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const blob = await (pdf as any)(element).toBlob()

  const filename = documentFilename(
    order.order_number ?? order.id.slice(0, 8),
    order.customer?.company_name,
  )

  triggerDownload(blob, filename)
}

export async function downloadQuotationPDF(quote: Quote) {
  const { pdf } = await import('@react-pdf/renderer')
  const React = await import('react')
  const { QuotationPDF } = await import('@/components/pdf/quotation-pdf')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const element = React.createElement(QuotationPDF as any, { quote })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const blob = await (pdf as any)(element).toBlob()

  const quoteNum = sanitize(quote.quote_number ?? quote.id.slice(0, 8))
  const customerName = sanitize(quote.customer?.company_name ?? '')
  const filename = customerName
    ? `${quoteNum} - ${customerName}.pdf`
    : `${quoteNum}.pdf`

  triggerDownload(blob, filename)
}
