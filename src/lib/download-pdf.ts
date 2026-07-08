import { Order, Quote } from '@/types'

function sanitize(str: string) {
  return str.replace(/[#/\\:*?"<>|]/g, '').trim()
}

// iosTab must be opened synchronously before any await, then passed here.
// This avoids mobile popup blocking caused by async gaps after the user gesture.
export function triggerDownload(blob: Blob, filename: string, iosTab?: Window | null) {
  const file = new File([blob], filename, { type: blob.type || 'application/pdf' })
  const url = URL.createObjectURL(file)

  const isMobile = /Android|iPad|iPhone|iPod/.test(navigator.userAgent)
  if (isMobile) {
    // Use Web Share API when available — opens the share sheet (WhatsApp, Mail,
    // Save to Files, …) and preserves the filename
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: filename })
        .then(() => { try { iosTab?.close() } catch { /* ignore */ } })
        .catch(() => {
          // User cancelled or share failed — fall back to tab open
          const tab = iosTab && !iosTab.closed ? iosTab : window.open('', '_blank')
          if (tab) tab.location.href = url
          setTimeout(() => URL.revokeObjectURL(url), 30000)
        })
      return
    }
    // Fallback for browsers without file sharing
    const tab = iosTab && !iosTab.closed ? iosTab : window.open('', '_blank')
    if (tab) {
      tab.location.href = url
    }
    setTimeout(() => URL.revokeObjectURL(url), 30000)
    return
  }

  // Desktop: regular download to the Downloads folder
  try { iosTab?.close() } catch { /* ignore */ }
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 10000)
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
