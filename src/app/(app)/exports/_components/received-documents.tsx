'use client'

import { useRef, useState } from 'react'
import { Inbox, Upload, Loader2, Trash2, FileText, Eye } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Transport } from '@/types'
import { openPrivateFile } from '@/lib/storage'
import {
  RECEIVED_DOC_TYPES,
  useTransportDocuments,
  useUploadTransportDocument,
  useDeleteTransportDocument,
} from '@/hooks/use-transport-documents'
import { toast } from 'sonner'

/**
 * The papers that come back stamped, kept with the transport they belong to.
 *
 * The documents we PRODUCE sit in the card above this one and are generated
 * fresh every time. These are the ones somebody else signs and hands back, and
 * there is only one copy — so they are filed here rather than living in a
 * mailbox nobody else can reach.
 */
export function ReceivedDocuments({ transport }: { transport: Transport }) {
  const { data: docs, isLoading } = useTransportDocuments(transport.id)
  const upload = useUploadTransportDocument()
  const remove = useDeleteTransportDocument()

  const [docType, setDocType] = useState<string>('signed_bl')
  const [opening, setOpening] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function pick(file: File | undefined) {
    if (!file) return
    await upload.mutateAsync({
      transportId: transport.id,
      transportNumber: transport.transport_number,
      file,
      documentType: docType,
    })
    if (fileRef.current) fileRef.current.value = ''
  }

  const label = (t: string) =>
    RECEIVED_DOC_TYPES.find(d => d.value === t)?.label ?? t

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Inbox className="h-4 w-4" />
          Received documents
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Papers that came back stamped — a signed B/L, a customs release. The
          documents we send out are generated in the card above.
        </p>

        <div className="flex gap-2 items-end flex-wrap">
          <div className="space-y-1">
            <Select value={docType} onValueChange={v => v && setDocType(v)}>
              <SelectTrigger className="h-8 text-xs px-2 w-44">
                <SelectValue>
                  {(v: string) => label(v)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {RECEIVED_DOC_TYPES.map(d => (
                  <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            accept="application/pdf,image/*"
            onChange={e => pick(e.target.files?.[0])}
          />
          <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5"
            disabled={upload.isPending}
            onClick={() => fileRef.current?.click()}>
            {upload.isPending
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Upload className="h-3.5 w-3.5" />}
            Upload
          </Button>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (docs ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing filed yet</p>
        ) : (
          <div className="space-y-1">
            {(docs ?? []).map(d => (
              <div key={d.id} className="flex items-center gap-2 rounded-lg border p-2">
                <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{d.file_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {label(d.document_type)} · {new Date(d.uploaded_at).toLocaleDateString('en', {
                      day: 'numeric', month: 'short', year: 'numeric',
                    })}
                  </p>
                </div>
                {/* The bucket is private, so the link is signed on the click. */}
                <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0"
                  disabled={opening === d.id}
                  onClick={async () => {
                    setOpening(d.id)
                    const ok = await openPrivateFile('export-documents', d.file_url)
                    if (!ok) toast.error('Could not open this document')
                    setOpening(null)
                  }}>
                  {opening === d.id
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <Eye className="h-3.5 w-3.5" />}
                </Button>
                <Button size="icon" variant="ghost"
                  className="h-7 w-7 shrink-0 text-muted-foreground hover:text-red-600"
                  title="Remove from this transport"
                  onClick={() => remove.mutate({ id: d.id, transportId: transport.id })}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
