import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Export, ExportDocument, Carrier } from '@/types'
import { toast } from 'sonner'

export function useExports() {
  const supabase = createClient()
  return useQuery({
    queryKey: ['exports'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('exports')
        .select('*, order:orders(order_number, customer:customers(company_name)), carrier:carriers(*)')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as Export[]
    },
  })
}

export function useExport(id: string) {
  const supabase = createClient()
  return useQuery({
    queryKey: ['exports', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('exports')
        .select('*, order:orders(*, customer:customers(*)), carrier:carriers(*)')
        .eq('id', id)
        .single()
      if (error) throw error
      return data as Export
    },
    enabled: !!id,
  })
}

export function useExportDocuments(exportId: string) {
  const supabase = createClient()
  return useQuery({
    queryKey: ['export_documents', exportId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('export_documents')
        .select('*')
        .eq('export_id', exportId)
        .order('uploaded_at', { ascending: true })
      if (error) throw error
      return data as ExportDocument[]
    },
    enabled: !!exportId,
  })
}

export function useCarriers() {
  const supabase = createClient()
  return useQuery({
    queryKey: ['carriers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('carriers')
        .select('*')
        .order('name')
      if (error) throw error
      return data as Carrier[]
    },
  })
}

export function useCreateExport() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (values: Partial<Export>) => {
      const { data, error } = await supabase
        .from('exports')
        .insert(values)
        .select()
        .single()
      if (error) throw error
      return data as Export
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exports'] })
      toast.success('Export created')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useUpdateExport() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, values }: { id: string; values: Partial<Export> }) => {
      const { data, error } = await supabase
        .from('exports')
        .update({ ...values, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data as Export
    },
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['exports'] })
      queryClient.invalidateQueries({ queryKey: ['exports', id] })
      toast.success('Export updated')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useDeleteExport() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('exports').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exports'] })
      toast.success('Export deleted')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useUploadExportDocument() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      exportId,
      file,
      documentType,
    }: {
      exportId: string
      file: File
      documentType: string
    }) => {
      const path = `${exportId}/${Date.now()}_${file.name}`
      const { error: uploadError } = await supabase.storage
        .from('export-documents')
        .upload(path, file, { upsert: true })
      if (uploadError) throw uploadError

      const { data: urlData } = supabase.storage
        .from('export-documents')
        .getPublicUrl(path)

      const { data, error } = await supabase
        .from('export_documents')
        .insert({
          export_id: exportId,
          document_type: documentType,
          file_url: urlData.publicUrl,
          file_name: file.name,
        })
        .select()
        .single()
      if (error) throw error
      return data as ExportDocument
    },
    onSuccess: (_data, { exportId }) => {
      queryClient.invalidateQueries({ queryKey: ['export_documents', exportId] })
      toast.success('Document uploaded')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useDeleteExportDocument() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, exportId }: { id: string; exportId: string }) => {
      const { error } = await supabase.from('export_documents').delete().eq('id', id)
      if (error) throw error
      return exportId
    },
    onSuccess: (exportId) => {
      queryClient.invalidateQueries({ queryKey: ['export_documents', exportId] })
      toast.success('Document removed')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}
