import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

/**
 * The papers that belong to one customer (migration 104).
 *
 * Danique, 2026-08-20: the consignment contract goes on the account, and the
 * reseller may look at their copy in the portal. Which document they may see is
 * decided per document, not per customer — uploading and publishing are two
 * separate acts.
 *
 * `file_url` is a PATH inside `pod-files`. Never a public URL: that bucket has
 * no public read, so such a link is dead, and if it ever were not dead it would
 * be handing out signed paperwork to anyone with the address. Opened through
 * `openPrivateFile` in lib/storage.ts, which mints a short-lived signed URL.
 */
export interface CustomerDocument {
  id: string
  customer_id: string
  name: string
  category: 'contract' | 'agreement' | 'certificate' | 'other'
  file_url: string
  file_name: string
  file_size: number | null
  visible_in_portal: boolean
  notes: string
  uploaded_by: string | null
  created_at: string
}

export const DOCUMENT_CATEGORIES = [
  { key: 'contract',    label: 'Contract' },
  { key: 'agreement',   label: 'Agreement' },
  { key: 'certificate', label: 'Certificate' },
  { key: 'other',       label: 'Other' },
] as const

export function useCustomerDocuments(customerId: string | null | undefined) {
  const supabase = createClient()
  return useQuery({
    queryKey: ['customer_documents', customerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customer_documents')
        .select('*')
        .eq('customer_id', customerId!)
        .order('created_at', { ascending: false })
      // Before migration 104 the table does not exist. An empty list is the
      // honest answer and every screen already handles it.
      if (error) return [] as CustomerDocument[]
      return (data ?? []) as CustomerDocument[]
    },
    enabled: !!customerId,
  })
}

/**
 * Everything the signed-in reseller may see, for the portal.
 *
 * No customer id is passed: the database decides, from who is asking. A portal
 * account that tried to widen this would simply get its own rows back.
 */
export function useMyDocuments() {
  const supabase = createClient()
  return useQuery({
    queryKey: ['customer_documents', 'mine'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customer_documents')
        .select('*')
        .eq('visible_in_portal', true)
        .order('created_at', { ascending: false })
      if (error) return [] as CustomerDocument[]
      return (data ?? []) as CustomerDocument[]
    },
  })
}

/**
 * Put a document on a customer.
 *
 * A FRESH storage key every time. `pod-files` is effectively append-only — an
 * overwrite is refused — so a second version of a contract becomes a second
 * row rather than a replacement that silently failed. For a contract that is
 * the behaviour you want: you have to be able to see which version was in
 * force when.
 */
export function useUploadCustomerDocument() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ customerId, file, name, category, visibleInPortal, uploadedBy }: {
      customerId: string
      file: File
      name: string
      category: CustomerDocument['category']
      visibleInPortal: boolean
      uploadedBy: string | null
    }) => {
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `contracts/${customerId}/${crypto.randomUUID()}-${safe}`

      const { error: upErr } = await supabase.storage
        .from('pod-files')
        .upload(path, file, { contentType: file.type || 'application/octet-stream' })
      if (upErr) throw new Error(`Upload: ${upErr.message}`)

      const { error } = await supabase.from('customer_documents').insert({
        customer_id: customerId,
        name: name.trim() || file.name,
        category,
        file_url: path,
        file_name: file.name,
        file_size: file.size,
        visible_in_portal: visibleInPortal,
        uploaded_by: uploadedBy,
      })
      if (error) throw new Error(`Saving: ${error.message}`)
    },
    onSuccess: (_d, v) => {
      queryClient.invalidateQueries({ queryKey: ['customer_documents', v.customerId] })
      toast.success('Document added')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

/** Show it to the customer, or stop showing it. One switch, one document. */
export function useSetDocumentVisible() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, visible }: { id: string; customerId: string; visible: boolean }) => {
      const { error } = await supabase
        .from('customer_documents')
        .update({ visible_in_portal: visible })
        .eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: (_d, v) => {
      queryClient.invalidateQueries({ queryKey: ['customer_documents', v.customerId] })
      toast.success(v.visible ? 'Visible in the portal' : 'Hidden from the portal')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

/**
 * Take a document off the account.
 *
 * The ROW goes; the file stays. `pod-files` refuses deletes and returns success
 * while deleting nothing, so pretending otherwise would be a lie in the code.
 * The file becomes unreachable because nothing points at it any more, which is
 * the honest outcome for a bucket built to keep proof.
 */
export function useDeleteCustomerDocument() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id }: { id: string; customerId: string }) => {
      const { error } = await supabase.from('customer_documents').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: (_d, v) => {
      queryClient.invalidateQueries({ queryKey: ['customer_documents', v.customerId] })
      toast.success('Document removed')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}
