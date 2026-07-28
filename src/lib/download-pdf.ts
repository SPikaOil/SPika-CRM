import { Order, Quote } from '@/types'

function sanitize(str: string) {
  return str.replace(/[#/\\:*?"<>|]/g, '').trim()
}

// Strips only what a filesystem genuinely cannot take. The '#' is NOT stripped
// here — it belongs in the name (see documentFilename).
function stripIllegal(str: string) {
  return str.replace(/[/\\:*?"<>|]/g, '').trim()
}

// THE one name every order document carries when it leaves the app —
// download, share sheet, WhatsApp, e-mail attachment:
//
//     #729108 - Supermercado Luz.pdf
//
// The leading '#' is normalised, not copied: 45 order numbers are stored as
// '#729108' and 22 as '729132', so a raw copy gives two different formats.
// Strip whatever '#' is there, then always put exactly one back.
//
// NOT for storage paths. The signed PDFs in `pod-files/signed-notes/` are
// already saved under their own historic names and `signed_pdf_url` points at
// them — renaming that scheme would orphan every existing proof document.
export function documentFilename(
  orderNumber: string | null | undefined,
  customerName: string | null | undefined,
): string {
  const num = stripIllegal(orderNumber ?? '').replace(/^#+\s*/, '')
  const customer = stripIllegal(customerName ?? '')
  const base = num ? `#${num}` : ''
  if (base && customer) return `${base} - ${customer}.pdf`
  return `${base || customer || 'document'}.pdf`
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
export async function uploadAndOpenInViewer(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any, blob: Blob, filename: string,
): Promise<boolean> {
  const path = `generated/${filename}`
  const { error } = await supabase.storage.from('pod-files')
    .upload(path, blob, { upsert: true, contentType: 'application/pdf' })
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

export async function downloadDeliveryNotePDF(
  order: Order,
  showPrices = true,
  documentType: 'DELIVERY NOTE' | 'INVOICE' = 'DELIVERY NOTE'
) {
  const { pdf } = await import('@react-pdf/renderer')
  const React = await import('react')
  const { DeliveryNotePDF } = await import('@/components/pdf/delivery-note-pdf')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const element = React.createElement(DeliveryNotePDF as any, { order, showPrices, documentType })
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
