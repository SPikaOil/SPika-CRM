import { Order, Quote } from '@/types'

function sanitize(str: string) {
  return str.replace(/[#/\\:*?"<>|]/g, '').trim()
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

  const file = new File([blob], filename, { type: blob.type || 'application/pdf' })
  const isMobile = /Android|iPad|iPhone|iPod/.test(navigator.userAgent)

  if (isMobile && navigator.canShare && navigator.canShare({ files: [file] })) {
    // Share sheet: WhatsApp / Mail / Save to Files, filename preserved
    navigator.share({ files: [file], title: filename }).catch((err) => {
      // AbortError = user closed the sheet on purpose — not a failure
      if (err?.name !== 'AbortError') anchorDownload(file, filename)
    })
    return
  }

  // Desktop and mobile-without-share: direct download (iOS 13+ supports this)
  anchorDownload(file, filename)
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

  const orderNum = sanitize(order.order_number ?? order.id.slice(0, 8))
  const customerName = sanitize(order.customer?.company_name ?? '')
  const filename = customerName
    ? `${orderNum} - ${customerName}.pdf`
    : `${orderNum}.pdf`

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
