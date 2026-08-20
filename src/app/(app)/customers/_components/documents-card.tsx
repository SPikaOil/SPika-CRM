'use client'

import { useRef, useState } from 'react'
import { FileText, Upload, Trash2, Eye, EyeOff, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useAuth } from '@/contexts/auth-context'
import { openPrivateFile } from '@/lib/storage'
import {
  useCustomerDocuments, useUploadCustomerDocument, useSetDocumentVisible,
  useDeleteCustomerDocument, DOCUMENT_CATEGORIES, type CustomerDocument,
} from '@/hooks/use-customer-documents'

/**
 * The papers that belong to this customer.
 *
 * Danique, 2026-08-20: the consignment contract goes on the account, and the
 * reseller may look at their copy when they log in to the portal.
 *
 * Two decisions, deliberately separate. Adding a document puts it on the
 * account; the switch beside it decides whether the customer ever sees it. A
 * contract you are still negotiating and a contract you both signed live in the
 * same list and must not be published by the same click.
 */
function fmtSize(bytes: number | null) {
  if (!bytes) return null
  return bytes > 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.round(bytes / 1024)} kB`
}

export function DocumentsCard({ customerId }: { customerId: string }) {
  const { profile, isAdmin, can } = useAuth()
  const canManage = isAdmin || can('customers.edit')

  const { data: documents } = useCustomerDocuments(customerId)
  const upload = useUploadCustomerDocument()
  const setVisible = useSetDocumentVisible()
  const remove = useDeleteCustomerDocument()

  const fileRef = useRef<HTMLInputElement>(null)
  const [adding, setAdding] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [name, setName] = useState('')
  const [category, setCategory] = useState<CustomerDocument['category']>('contract')
  const [visible, setVisibleNow] = useState(false)
  const [opening, setOpening] = useState<string | null>(null)

  const list = documents ?? []

  async function open(doc: CustomerDocument) {
    setOpening(doc.id)
    // Says so when it fails. A dead link that silently does nothing is how
    // somebody concludes the contract was never uploaded.
    const ok = await openPrivateFile('pod-files', doc.file_url)
    if (!ok) toast.error('Could not open this file — it may have been moved')
    setOpening(null)
  }

  function submit() {
    if (!file) return
    upload.mutate(
      {
        customerId,
        file,
        name,
        category,
        visibleInPortal: visible,
        uploadedBy: profile?.id ?? null,
      },
      {
        onSuccess: () => {
          setFile(null); setName(''); setVisibleNow(false); setAdding(false)
          if (fileRef.current) fileRef.current.value = ''
        },
      },
    )
  }

  return (
    <Card size="sm" className="py-0">
      <CardHeader className="pt-3 pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <FileText className="h-4 w-4" />
          Documents
          {list.length > 0 && (
            <span className="ml-auto text-xs font-normal text-muted-foreground">
              {list.filter(d => d.visible_in_portal).length} of {list.length} in the portal
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 pb-4">
        {list.length === 0 && !adding && (
          <p className="text-xs text-muted-foreground">
            No documents yet. A consignment contract, a price agreement — anything
            that belongs to this account and nowhere else.
          </p>
        )}

        {list.map(doc => (
          <div key={doc.id} className="flex items-center gap-2 rounded-lg border px-2.5 py-1.5">
            <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <button
              onClick={() => open(doc)}
              className="flex-1 min-w-0 text-left hover:underline"
              disabled={opening === doc.id}
            >
              <p className="text-sm font-medium truncate">{doc.name}</p>
              <p className="text-xs text-muted-foreground truncate">
                {DOCUMENT_CATEGORIES.find(c => c.key === doc.category)?.label}
                {' · '}
                {new Date(doc.created_at).toLocaleDateString('en', {
                  day: 'numeric', month: 'short', year: 'numeric',
                })}
                {fmtSize(doc.file_size) ? ` · ${fmtSize(doc.file_size)}` : ''}
              </p>
            </button>

            {opening === doc.id && <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />}

            {doc.visible_in_portal ? (
              <Badge className="bg-green-100 text-green-700 text-[10px] px-1.5 shrink-0">
                In portal
              </Badge>
            ) : (
              <Badge className="bg-gray-100 text-gray-600 text-[10px] px-1.5 shrink-0">
                Internal
              </Badge>
            )}

            {canManage && (
              <>
                <button
                  onClick={() => setVisible.mutate({
                    id: doc.id, customerId, visible: !doc.visible_in_portal,
                  })}
                  className="text-muted-foreground hover:text-foreground shrink-0"
                  title={doc.visible_in_portal ? 'Hide from the portal' : 'Show in the portal'}
                >
                  {doc.visible_in_portal
                    ? <EyeOff className="h-3.5 w-3.5" />
                    : <Eye className="h-3.5 w-3.5" />}
                </button>
                <button
                  onClick={() => {
                    if (!confirm(`Take "${doc.name}" off this account?`)) return
                    remove.mutate({ id: doc.id, customerId })
                  }}
                  className="text-muted-foreground hover:text-red-600 shrink-0"
                  title="Remove"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </>
            )}
          </div>
        ))}

        {canManage && !adding && (
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5"
            onClick={() => setAdding(true)}>
            <Upload className="h-3 w-3" />
            Add document
          </Button>
        )}

        {adding && (
          <div className="rounded-lg border p-2.5 space-y-2">
            <div className="space-y-1">
              <Label className="text-xs">File</Label>
              <Input
                ref={fileRef}
                type="file"
                className="h-8 text-xs"
                onChange={e => {
                  const f = e.target.files?.[0] ?? null
                  setFile(f)
                  if (f && !name) setName(f.name.replace(/\.[^.]+$/, ''))
                }}
              />
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">Name</Label>
                <Input
                  className="h-8 text-xs"
                  placeholder="Consignment contract"
                  value={name}
                  onChange={e => setName(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Kind</Label>
                <Select value={category} onValueChange={v => v && setCategory(v as CustomerDocument['category'])}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DOCUMENT_CATEGORIES.map(c => (
                      <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Off unless you say so. Publishing a contract to the reseller is
                its own decision, not a side effect of filing it. */}
            <label className="flex items-start gap-2 text-xs">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-red-600"
                checked={visible}
                onChange={e => setVisibleNow(e.target.checked)}
              />
              <span>
                Show it to the customer in the portal
                <span className="block text-muted-foreground">
                  They see a copy under Documents when they log in. You can switch
                  this on or off afterwards.
                </span>
              </span>
            </label>

            <div className="flex items-center gap-2">
              <Button size="sm" className="h-7 text-xs bg-red-600 hover:bg-red-700"
                disabled={!file || upload.isPending} onClick={submit}>
                {upload.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                Add
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs"
                disabled={upload.isPending}
                onClick={() => { setAdding(false); setFile(null); setName('') }}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
