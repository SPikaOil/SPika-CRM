'use client'

import { use, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, CheckCircle, Loader2, Trash2 } from 'lucide-react'
import SignaturePad from 'signature_pad'
import { toast } from 'sonner'
import { useCustomer, useUpdateCustomer } from '@/hooks/use-customers'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function OBSignPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const { data: customer, isLoading } = useCustomer(id)
  const updateCustomer = useUpdateCustomer()
  const router = useRouter()
  const supabase = createClient()

  // Editable form fields — pre-filled from customer
  const [company, setCompany] = useState('')
  const [address, setAddress] = useState('')
  const [coc, setCoc] = useState('')
  const [crib, setCrib] = useState('')
  const [signerName, setSignerName] = useState('')
  const [signerTitle, setSignerTitle] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sigPadRef = useRef<SignaturePad | null>(null)

  // Pre-fill from customer once loaded
  useEffect(() => {
    if (!customer) return
    setCompany(customer.company_name ?? '')
    const addr = customer.billing_address as any
    if (addr?.street) {
      setAddress(`${addr.street}, ${addr.city ?? ''} ${addr.zip ?? ''}`.trim().replace(/, $/, ''))
    }
    setCoc(customer.coc_number ?? '')
    setCrib(customer.vat_number ?? '')
  }, [customer])

  useEffect(() => {
    if (!canvasRef.current) return
    sigPadRef.current = new SignaturePad(canvasRef.current, {
      backgroundColor: 'rgba(255,255,255,0)',
      penColor: '#1a1a1a',
    })
    resizeCanvas()
    window.addEventListener('resize', resizeCanvas)
    return () => {
      window.removeEventListener('resize', resizeCanvas)
      sigPadRef.current?.off()
    }
  }, [])

  function resizeCanvas() {
    const canvas = canvasRef.current
    if (!canvas) return
    const ratio = window.devicePixelRatio || 1
    canvas.width = canvas.offsetWidth * ratio
    canvas.height = canvas.offsetHeight * ratio
    canvas.getContext('2d')?.scale(ratio, ratio)
    sigPadRef.current?.clear()
  }

  async function handleSubmit() {
    if (!company.trim()) return toast.error('Company name is required')
    if (!signerName.trim()) return toast.error('Signer name is required')
    if (!sigPadRef.current || sigPadRef.current.isEmpty()) return toast.error('Please provide a signature')
    if (!customer) return

    setSubmitting(true)
    try {
      const signatureDataUrl = sigPadRef.current.toDataURL('image/png')
      const signedAt = new Date().toISOString()

      const { pdf } = await import('@react-pdf/renderer')
      const React = await import('react')
      const { OBFormPDF } = await import('@/components/pdf/ob-form-pdf')

      const element = React.createElement(OBFormPDF as any, {
        company: company.trim(),
        address: address.trim(),
        coc: coc.trim(),
        crib: crib.trim(),
        signerName: signerName.trim(),
        signerTitle: signerTitle.trim(),
        signatureDataUrl,
        signedAt,
      })
      const blob = await (pdf as any)(element).toBlob()

      const path = `ob-forms/${id}/${Date.now()}-ob-form.pdf`
      const { error: uploadError } = await supabase.storage
        .from('pod-files')
        .upload(path, blob, { upsert: true, contentType: 'application/pdf' })
      if (uploadError) throw uploadError

      const displayName = signerTitle.trim()
        ? `${signerName.trim()} (${signerTitle.trim()})`
        : signerName.trim()

      await updateCustomer.mutateAsync({
        id,
        values: {
          ob_form_signed: true,
          ob_form_signed_at: signedAt,
          ob_form_signer_name: displayName,
          ob_form_signed_url: path,
        } as any,
      })

      toast.success('OB form signed and saved!')
      router.push(`/customers/${id}`)
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to save')
    } finally {
      setSubmitting(false)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-red-600" />
      </div>
    )
  }

  if (!customer) {
    return (
      <div className="p-4 flex flex-col items-center py-20 gap-3">
        <p>Customer not found</p>
        <Link href="/customers"><Button variant="outline">Back</Button></Link>
      </div>
    )
  }

  const today = new Date().toLocaleDateString('en', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b px-4 py-3">
        <div className="flex items-center gap-3 max-w-lg mx-auto">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <p className="font-bold text-sm">OB Declaratie Formulier 2026</p>
            <p className="text-xs text-muted-foreground">{customer.company_name}</p>
          </div>
        </div>
      </div>

      <div className="p-4 max-w-lg mx-auto space-y-4 pb-28">

        {/* ── Section 1: Company details ── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Company Details</CardTitle>
            <p className="text-xs text-muted-foreground">Pre-filled from customer — edit if needed</p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label>Company <span className="text-red-500">*</span></Label>
              <Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Company name" />
            </div>
            <div className="space-y-1.5">
              <Label>Address</Label>
              <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street, City ZIP" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Chamber of Commerce #</Label>
                <Input value={coc} onChange={(e) => setCoc(e.target.value)} placeholder="CoC number" />
              </div>
              <div className="space-y-1.5">
                <Label>Crib number</Label>
                <Input value={crib} onChange={(e) => setCrib(e.target.value)} placeholder="Crib number" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Section 2: Document preview ── */}
        <Card className="border-dashed">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-mono underline">OB DECLARATIE FORMULIER 2026</CardTitle>
          </CardHeader>
          <CardContent className="text-xs leading-relaxed space-y-3 text-foreground/80">
            <div className="text-right space-y-0.5 font-mono text-xs border-r-4 border-red-600 pr-3">
              <p>Company: <span className="underline">{company || '___________'}</span></p>
              <p>Address: <span className="underline">{address || '___________'}</span></p>
              <p>Chamber of Commerce: <span className="underline">{coc || '___________'}</span></p>
              <p>Crib number: <span className="underline">{crib || '___________'}</span></p>
              <p className="font-bold mt-1">Willemstad, Curaçao</p>
            </div>

            <p>
              Undersigned hereby declares that the goods produced by <strong>SPika Oil</strong> and delivered by <strong>Milsinc, SPika, Kaya Kiwa 3-a, Crib#102471812 &amp; CoC# 145141</strong> to <u>{company || '___'}</u> are purchased by <u>{company || '___'}</u> as goods intended for resale to the end consumer. <u>{company || '___'}</u> purchases <strong>SPika Oil</strong> produced and delivered by <strong>Milsinc – SPika</strong> and subsequently sells this <strong>SPika Oil</strong> on the retail location of <u>{company || '___'}</u> to the end consumer.
            </p>

            <p>
              Considering the foregoing, the sale of, the locally produced, <strong>SPika Oil</strong> by <strong>Milsinc -SPika</strong> to <u>{company || '___'}</u> is exempt from turnover tax based on article 7 paragraph 2 subparagraph A of the Curaçao Turnover Tax Ordinance 1999. This letter should be considered as the required declaration of <strong>Milsinc - SPika</strong> as meant in article 5 paragraph 1 under Ministerial Regulation on Turnover Tax.
            </p>

            <p>
              This Declaration refers to all deliveries of SPika Oil, which are locally produced and delivered by <strong>Milsinc – SPika (SPika Oil)</strong> to <u>{company || '___'}</u> starting <strong>1st of January 2026</strong> until <strong>31 December 2026.</strong>
            </p>

            <p className="text-muted-foreground">Date: {today}</p>

            <div className="grid grid-cols-2 gap-4 pt-1 border-t">
              <div>
                <p className="font-medium mb-2">On behalf of <strong>Milsinc-SPika</strong></p>
                <div className="border-b border-foreground/40 mb-1" />
                <p>Name: Danique L. Thijm</p>
                <p>Title: Owner</p>
              </div>
              <div>
                <p className="font-medium mb-2">On behalf of <u>{company || '___'}</u></p>
                <div className="border-b border-foreground/40 mb-1" />
                <p>Name: {signerName || '…………………'}</p>
                <p>Title: {signerTitle || '…………………'}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Section 3: Signer ── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Signer</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Name <span className="text-red-500">*</span></Label>
                <Input value={signerName} onChange={(e) => setSignerName(e.target.value)} placeholder="Full name" />
              </div>
              <div className="space-y-1.5">
                <Label>Title <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <Input value={signerTitle} onChange={(e) => setSignerTitle(e.target.value)} placeholder="e.g. Director" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Section 4: Signature ── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Signature <span className="text-red-500">*</span></CardTitle>
            <p className="text-xs text-muted-foreground">Sign in the box below</p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="border-2 border-dashed rounded-xl overflow-hidden bg-white">
              <canvas ref={canvasRef} className="w-full h-52 touch-none cursor-crosshair" />
            </div>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => sigPadRef.current?.clear()}>
              <Trash2 className="h-3.5 w-3.5" />
              Clear signature
            </Button>
          </CardContent>
        </Card>

        {/* ── Submit ── */}
        <Button
          className="w-full h-14 text-lg bg-green-600 hover:bg-green-700 gap-2"
          onClick={handleSubmit}
          disabled={submitting}
        >
          {submitting ? (
            <><Loader2 className="h-5 w-5 animate-spin" /> Generating PDF…</>
          ) : (
            <><CheckCircle className="h-5 w-5" /> Sign & Save Form</>
          )}
        </Button>
      </div>
    </div>
  )
}
