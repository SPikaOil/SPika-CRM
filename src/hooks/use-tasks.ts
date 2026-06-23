import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Task } from '@/types'
import { toast } from 'sonner'

export function useTasks(customerId?: string, userId?: string, isAdmin?: boolean) {
  const supabase = createClient()

  return useQuery({
    queryKey: ['tasks', customerId, userId, isAdmin],
    queryFn: async () => {
      let query = supabase
        .from('tasks')
        .select('*, customer:customers(id, company_name), assigned_user:users!tasks_assigned_to_fkey(id, name)')
        .order('due_date', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: false })

      if (customerId) query = query.eq('customer_id', customerId)
      if (!isAdmin && userId) query = query.eq('assigned_to', userId)

      const { data, error } = await query
      if (error) throw error
      return data as Task[]
    },
    enabled: !!isAdmin || !!userId,
  })
}

export function useCreateTask() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (values: Partial<Task>) => {
      const { data, error } = await supabase
        .from('tasks')
        .insert(values)
        .select()
        .single()
      if (error) throw error
      return data as Task
    },
    onSuccess: (task) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      toast.success('Task created')
      // Notify assigned worker if one was set
      if (task.assigned_to) {
        fetch('/api/notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'task_assigned',
            payload: {
              taskTitle: task.title,
              assignedTo: task.assigned_to,
              dueDate: task.due_date
                ? new Date(task.due_date).toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' })
                : undefined,
            },
          }),
        }).catch(() => {})
      }
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useCompleteTask() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, completed }: { id: string; completed: boolean }) => {
      const { error } = await supabase
        .from('tasks')
        .update({ completed_at: completed ? new Date().toISOString() : null })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useDeleteTask() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('tasks').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      toast.success('Task deleted')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}
