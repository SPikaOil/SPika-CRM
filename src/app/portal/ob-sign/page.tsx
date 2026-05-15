'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle, Loader2, Trash2, FileSignature } from 'lucide-react'
import SignaturePad from 'signature_pad'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/auth-context'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Customer } from '@/types'

export default function PortalOBSignPage() {
  const { profile } = useAuth()
  const router = useRouter()
  const supabase = createClient()

  const [customer, setCustomer] = useState<Customer | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Editable fields
  const [company, setCompany] = useState('')
  const [address, setAddress] = useState('')
  const [coc, setCoc] = useState('')
  const [crib, setCrib] = useState('')
  const [signerName, setSignerName] = useState('')
  const [signerTitle, setSignerTitle] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sigPadRef = useRef<SignaturePad | null>(null)

  useEffect(() => {
    if (!profile?.customer_id) return
    supabase.from('customers').select('*').eq('id', profile.customer_id).single()
      .then(({ data }) => {
        const c = data as Customer
        setCustomer(c)
        if (c) {
          setCompany(c.company_name ?? '')
          const addr = c.billing_address as any
          if (addr?.street) {
            setAddress(`${addr.street}, ${addr.city ?? ''} ${addr.zip ?? ''}`.trim().replace(/, $/, ''))
          }
          setCoc(c.coc_number ?? '')
          setCrib(c.vat_number ?? '')
          // If already signed, send to new-order
          if (c.ob_form_signed) router.replace('/portal/new-order')
        }
        setIsLoading(false)
      })
  }, [profile?.customer_id])

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
    if (!signerName.trim()) return toast.error('Your name is required')
    if (!sigPadRef.current || sigPadRef.current.isEmpty()) return toast.error('Please provide your signature')
    if (!customer || !profile?.customer_id) return

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

      const path = `ob-forms/${profile.customer_id}/${Date.now()}-ob-form.pdf`
      const { error: uploadError } = await supabase.storage
        .from('pod-files')
        .upload(path, blob, { upsert: true, contentType: 'application/pdf' })
      if (uploadError) throw uploadError

      const displayName = signerTitle.trim()
        ? `${signerName.trim()} (${signerTitle.trim()})`
        : signerName.trim()

      const { error: updateError } = await supabase.from('customers').update({
        ob_form_signed: true,
        ob_form_signed_at: signedAt,
        ob_form_signer_name: displayName,
        ob_form_signed_url: path,
      }).eq('id', profile.customer_id)
      if (updateError) throw updateError

      toast.success('Form signed! You can now place orders.')
      router.replace('/portal/new-order')
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to save')
    } finally {
      setSubmitting(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-red-600" />
      </div>
    )
  }

  const today = new Date().toLocaleDateString('en', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
          <FileSignature className="h-5 w-5 text-red-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold">OB Declaratie Formulier 2026</h1>
          <p className="text-sm text-muted-foreground">Required before placing orders</p>
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-800">
        This form prevents double OB tax on the same product. It confirms you&apos;re selling SPika Oil to end consumers — we&apos;re the producer, you&apos;re the final seller.
      </div>

      {/* Company details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your Company Details</CardTitle>
          <p className="text-xs text-muted-foreground">Check and correct if needed</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label>Company name <span className="text-red-500">*</span></Label>
            <Input value={company} onChange={e => setCompany(e.target.value)} placeholder="Company name" />
          </div>
          <div className="space-y-1.5">
            <Label>Address</Label>
            <Input value={address} onChange={e => setAddress(e.target.value)} placeholder="Street, City ZIP" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Chamber of Commerce #</Label>
              <Input value={coc} onChange={e => setCoc(e.target.value)} placeholder="CoC number" />
            </div>
            <div className="space-y-1.5">
              <Label>Crib number</Label>
              <Input value={crib} onChange={e => setCrib(e.target.value)} placeholder="Crib number" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Legal text preview */}
      <Card className="border-dashed">
        <CardContent className="pt-4 text-xs leading-relaxed space-y-2 text-foreground/70">
          <p className="font-bold text-foreground underline">OB DECLARATIE FORMULIER 2026</p>
          <p>
            Undersigned hereby declares that the goods produced by <strong>SPika Oil</strong> and delivered by{' '}
            <strong>Milsinc, SPika, Kaya Kiwa 3-a, Crib#102471812 &amp; CoC# 145141</strong> to{' '}
            <u>{company || '___'}</u> are purchased by <u>{company || '___'}</u> as goods intended for
            resale to the end consumer. <u>{company || '___'}</u> purchases <strong>SPika Oil</strong> and
            subsequently sells it on the retail location of <u>{company || '___'}</u> to the end consumer.
          </p>
          <p>
            This Declaration refers to all deliveries of SPika Oil by{' '}
            <strong>Milsinc – SPika (SPika Oil)</strong> to <u>{company || '___'}</u> starting{' '}
            <strong>1st of January 2026</strong> until <strong>31 December 2026.</strong>
          </p>
          <p className="text-muted-foreground">Date: {today}</p>
        </CardContent>
      </Card>

      {/* Signer */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Your name <span className="text-red-500">*</span></Label>
              <Input value={signerName} onChange={e => setSignerName(e.target.value)} placeholder="Full name" />
            </div>
            <div className="space-y-1.5">
              <Label>Your title <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Input value={signerTitle} onChange={e => setSignerTitle(e.target.value)} placeholder="e.g. Director" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Signature */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your Signature <span className="text-red-500">*</span></CardTitle>
          <p className="text-xs text-muted-foreground">Sign in the box below with your finger or mouse</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="border-2 border-dashed rounded-xl overflow-hidden bg-white">
            <canvas ref={canvasRef} className="w-full h-48 touch-none cursor-crosshair" />
          </div>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => sigPadRef.current?.clear()}>
            <Trash2 className="h-3.5 w-3.5" />
            Clear
          </Button>
        </CardContent>
      </Card>

      <Button
        className="w-full h-14 text-base bg-green-600 hover:bg-green-700 gap-2"
        onClick={handleSubmit}
        disabled={submitting}
      >
        {submitting ? (
          <><Loader2 className="h-5 w-5 animate-spin" /> Saving…</>
        ) : (
          <><CheckCircle className="h-5 w-5" /> Sign &amp; Continue to Order</>
        )}
      </Button>
    </div>
  )
}
