'use client'

import { useState } from 'react'
import { FileText, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { openPrivateFile } from '@/lib/storage'
import {
  useMyDocuments, DOCUMENT_CATEGORIES, type CustomerDocument,
} from '@/hooks/use-customer-documents'

/**
 * Your papers, for the reseller.
 *
 * Danique, 2026-08-20: "ook dat als ze inloggen op portal dat ze ook daar kopie
 * kunnen inzien" — starting with La Bandera's consignment contract.
 *
 * Read-only, and deliberately its own page rather than a corner of Account: a
 * contract is not a setting. Which documents appear here is decided per
 * document in the CRM, and the DATABASE enforces it — this page asks for no
 * customer id at all, so an account that tried to widen the request would get
 * its own rows back and nothing else.
 */
function fmtDate(value: string) {
  return new Date(value).toLocaleDateString('en', {
    day: 'numeric', month: 'long', year: 'numeric',
  })
}

export default function PortalDocumentsPage() {
  const { data: documents, isLoading } = useMyDocuments()
  const [opening, setOpening] = useState<string | null>(null)

  async function open(doc: CustomerDocument) {
    setOpening(doc.id)
    // A link that silently does nothing reads as "the file is gone". It says so
    // instead.
    const ok = await openPrivateFile('pod-files', doc.file_url)
    if (!ok) toast.error('Could not open this document — please let us know')
    setOpening(null)
  }

  const list = documents ?? []

  return (
    <div className="p-4 lg:p-6 space-y-4 max-w-3xl mx-auto w-full">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FileText className="h-6 w-6 text-red-600" />
          Documents
        </h1>
        <p className="text-sm text-muted-foreground">
          Your agreements with SPika Oil
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1].map(i => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </div>
      ) : list.length === 0 ? (
        <Card size="sm">
          <CardContent className="py-10 text-center space-y-2">
            <FileText className="h-8 w-8 mx-auto opacity-20" />
            <p className="text-sm text-muted-foreground">No documents yet</p>
            <p className="text-xs text-muted-foreground">
              Anything we share with you — a contract, an agreement — appears here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {list.map(doc => (
            <Card key={doc.id} size="sm">
              <CardContent className="py-3">
                <button
                  onClick={() => open(doc)}
                  disabled={opening === doc.id}
                  className="w-full flex items-center gap-3 text-left"
                >
                  <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{doc.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {DOCUMENT_CATEGORIES.find(c => c.key === doc.category)?.label}
                      {' · '}
                      {fmtDate(doc.created_at)}
                    </p>
                  </div>
                  {opening === doc.id ? (
                    <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                  ) : (
                    <span className="text-xs text-red-600 shrink-0">Open →</span>
                  )}
                </button>
                {doc.notes && (
                  <p className="text-xs text-muted-foreground mt-1.5">{doc.notes}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
