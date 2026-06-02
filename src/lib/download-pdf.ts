import { Order, Quote } from '@/types'

function sanitize(str: string) {
  return str.replace(/[#/\\:*?"<>|]/g, '').trim()
}

export function triggerDownload(blob: Blob, filename: string) {
  // Wrap in a File with explicit MIME type — fixes iOS opening blob as HTML
  const file = new File([blob], filename, { type: 'application/pdf' })
  const url = URL.createObjectURL(file)
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
