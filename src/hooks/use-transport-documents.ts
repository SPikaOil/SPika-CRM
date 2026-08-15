import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { TransportDocument } from '@/types'
import { toast } from 'sonner'

/**
 * The papers that come BACK for a transport.
 *
 * Not the documents we produce — those are generated on the spot from the order
 * (commercial invoice, packing list, B/L, labels). These are the ones somebody
 * else stamps and hands back: a signed bill of lading, a customs release. There
 * is nowhere else to keep them, and at a customs check or a claim "we had it
 * somewhere" is the same as not having it.
 *
 * The table has existed since migration 054 with the right policies. It simply
 * never got a screen: the upload button lived on the old export record and did
 * not come across when transports replaced it.
 *
 * file_url holds the storage PATH, never a public URL — the bucket is private
 * and such a link would be dead. See lib/storage.ts.
 */

export const RECEIVED_DOC_TYPES = [
  { value: 'signed_bl',      label: 'Signed B/L' },
  { value: 'customs_release', label: 'Customs release' },
  { value: 'proof_of_delivery', label: 'Proof of delivery' },
  { value: 'invoice_carrier', label: 'Carrier invoice' },
  { value: 'other',          label: 'Other' },
] as const

export function useTransportDocuments(transportId: string | null | undefined) {
  const supabase = createClient()
  return useQuery({
    queryKey: ['transport_documents', transportId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('transport_documents')
        .select('*')
        .eq('transport_id', transportId!)
        .order('uploaded_at', { ascending: false })
      if (error) throw error
      return data as TransportDocument[]
    },
    enabled: !!transportId,
  })
}

export function useUploadTransportDocument() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ transportId, transportNumber, file, documentType }: {
      transportId: string
      transportNumber: string
      file: File
      documentType: string
    }) => {
      // Timestamped, so uploading a corrected version never silently overwrites
      // the first one. Both stay, newest at the top.
      const safe = file.name.replace(/[^\w.\-]+/g, '_')
      const path = `transports/${transportNumber}/${Date.now()}_${safe}`

      const { error: upErr } = await supabase.storage
        .from('export-documents')
        .upload(path, file, { contentType: file.type || 'application/octet-stream' })
      if (upErr) throw upErr

      const { error } = await supabase.from('transport_documents').insert({
        transport_id: transportId,
        document_type: documentType,
        file_url: path,
        file_name: file.name,
      })
      if (error) throw error
    },
    onSuccess: (_d, v) => {
      queryClient.invalidateQueries({ queryKey: ['transport_documents', v.transportId] })
      toast.success('Document saved')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

/**
 * Remove a document that was filed by mistake.
 *
 * The database row goes; the FILE stays in the bucket. That bucket has read and
 * insert policies and no delete policy — customs paperwork is append-only on
 * purpose, so nothing that was once filed can be made to disappear.
 */
export function useDeleteTransportDocument() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id }: { id: string; transportId: string }) => {
      const { error } = await supabase.from('transport_documents').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: (_d, v) => {
      queryClient.invalidateQueries({ queryKey: ['transport_documents', v.transportId] })
      toast.success('Document removed from this transport')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}
