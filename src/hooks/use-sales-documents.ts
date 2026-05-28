import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

export interface SalesDocFolder {
  id: string
  name: string
  created_by: string | null
  created_at: string
}

export interface SalesDocument {
  id: string
  name: string
  description: string | null
  category: string
  folder_id: string | null
  file_url: string
  file_name: string
  file_size: number | null
  uploaded_by: string | null
  created_at: string
}

export const SALES_DOC_CATEGORIES = [
  { value: 'price_list',     label: 'Price List' },
  { value: 'brochure',       label: 'Brochure' },
  { value: 'presentation',   label: 'Presentation' },
  { value: 'product_sheet',  label: 'Product Sheet' },
  { value: 'contract',       label: 'Contract' },
  { value: 'other',          label: 'Other' },
] as const

export type SalesDocCategory = typeof SALES_DOC_CATEGORIES[number]['value']

// --- Folders ---

export function useSalesFolders() {
  const supabase = createClient()
  return useQuery({
    queryKey: ['sales_document_folders'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sales_document_folders')
        .select('*')
        .order('name', { ascending: true })
      if (error) throw error
      return data as SalesDocFolder[]
    },
  })
}

export function useCreateSalesFolder() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (name: string) => {
      const { data, error } = await supabase
        .from('sales_document_folders')
        .insert({ name })
        .select()
        .single()
      if (error) throw error
      return data as SalesDocFolder
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales_document_folders'] })
      toast.success('Folder created')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useDeleteSalesFolder() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('sales_document_folders').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales_document_folders'] })
      queryClient.invalidateQueries({ queryKey: ['sales_documents'] })
      toast.success('Folder deleted')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useRenameSalesFolder() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase.from('sales_document_folders').update({ name }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales_document_folders'] })
      toast.success('Folder renamed')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

// --- Documents ---

export function useSalesDocuments() {
  const supabase = createClient()
  return useQuery({
    queryKey: ['sales_documents'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sales_documents')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as SalesDocument[]
    },
  })
}

export function useUploadSalesDocument() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      file,
      name,
      description,
      category,
      folderId,
    }: {
      file: File
      name: string
      description: string
      category: string
      folderId: string | null
    }) => {
      const path = `${Date.now()}_${file.name}`
      const { error: uploadError } = await supabase.storage
        .from('sales-documents')
        .upload(path, file, { upsert: true })
      if (uploadError) throw uploadError

      const { data: urlData } = supabase.storage
        .from('sales-documents')
        .getPublicUrl(path)

      const { data, error } = await supabase
        .from('sales_documents')
        .insert({
          name,
          description: description || null,
          category,
          folder_id: folderId,
          file_url: urlData.publicUrl,
          file_name: file.name,
          file_size: file.size,
        })
        .select()
        .single()
      if (error) throw error
      return data as SalesDocument
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['sales_documents'] })
      toast.success('Document uploaded')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useMoveDocument() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, folderId }: { id: string; folderId: string | null }) => {
      const { error } = await supabase
        .from('sales_documents')
        .update({ folder_id: folderId })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales_documents'] })
      toast.success('Document moved')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useDeleteSalesDocument() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('sales_documents').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales_documents'] })
      toast.success('Document deleted')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}
