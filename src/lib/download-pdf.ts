import { Order, Quote } from '@/types'

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
  const url = URL.createObjectURL(blob)

  const filename = `${documentType === 'INVOICE' ? 'invoice' : 'delivery-note'}-${order.order_number || order.id.slice(0, 8)}.pdf`

  // iOS Safari and most mobile browsers don't support the download attribute on blob URLs.
  // Open in a new tab instead — the user can then use the share sheet to save/print.
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent)

  if (isMobile || isSafari) {
    window.open(url, '_blank')
    // Don't revoke immediately — the new tab needs time to load the blob
    setTimeout(() => URL.revokeObjectURL(url), 60000)
  } else {
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 5000)
  }
}

export async function downloadQuotationPDF(quote: Quote) {
  const { pdf } = await import('@react-pdf/renderer')
  const React = await import('react')
  const { QuotationPDF } = await import('@/components/pdf/quotation-pdf')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const element = React.createElement(QuotationPDF as any, { quote })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const blob = await (pdf as any)(element).toBlob()
  const filename = `quotation-${quote.quote_number || quote.id.slice(0, 8)}.pdf`

  // Force download using a named file blob URL — works on all modern browsers including Safari 14+
  const file = new File([blob], filename, { type: 'application/pdf' })
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}
