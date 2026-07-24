'use client'

import { useState } from 'react'
import { CheckCircle2, Circle, ClipboardList, Plus, Trash2, RefreshCw, Calendar } from 'lucide-react'
import { useTasks, useCreateTask, useCompleteTask, useDeleteTask } from '@/hooks/use-tasks'
import { useCustomers } from '@/hooks/use-customers'
import { useUsers } from '@/hooks/use-users'
import { useAuth } from '@/contexts/auth-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { TaskFrequency } from '@/types'

const FREQUENCY_LABELS: Record<TaskFrequency, string> = {
  once: 'One-time',
  weekly: 'Weekly',
  monthly: 'Monthly',
}

const FREQUENCY_COLORS: Record<TaskFrequency, string> = {
  once: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  weekly: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  monthly: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
}

export default function TasksPage() {
  const { profile, isAdmin } = useAuth()
  const { data: tasks, isLoading } = useTasks(undefined, profile?.id, isAdmin)
  const { data: customers } = useCustomers()
  const { data: users } = useUsers()
  const createTask = useCreateTask()
  const completeTask = useCompleteTask()
  const deleteTask = useDeleteTask()

  const [showForm, setShowForm] = useState(false)
  const [filterCustomer, setFilterCustomer] = useState('all')
  const [showCompleted, setShowCompleted] = useState(false)

  // New task form state
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [customerId, setCustomerId] = useState('')
  const [assignedTo, setAssignedTo] = useState('')
  const [frequency, setFrequency] = useState<TaskFrequency>('once')
  const [dueDate, setDueDate] = useState('')

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    await createTask.mutateAsync({
      title: title.trim(),
      description: description.trim(),
      customer_id: customerId || null,
      assigned_to: assignedTo || null,
      frequency,
      due_date: dueDate || null,
      created_by: profile?.id!,
    })
    setTitle('')
    setDescription('')
    setCustomerId('')
    setAssignedTo('')
    setFrequency('once')
    setDueDate('')
    setShowForm(false)
  }

  const filtered = (tasks ?? []).filter((t) => {
    if (filterCustomer !== 'all' && t.customer_id !== filterCustomer) return false
    if (!showCompleted && t.completed_at) return false
    return true
  })

  const pending = filtered.filter((t) => !t.completed_at)
  const completed = filtered.filter((t) => !!t.completed_at)

  return (
    <div className="p-4 lg:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Tasks</h1>
          <p className="text-muted-foreground text-sm">{pending.length} pending</p>
        </div>
        {isAdmin && (
          <Button
            className="bg-red-600 hover:bg-red-700"
            onClick={() => setShowForm((v) => !v)}
          >
            <Plus className="h-4 w-4 mr-2" />
            New Task
          </Button>
        )}
      </div>

      {/* New Task Form */}
      {showForm && (
        <Card className="border-red-200 dark:border-red-900">
          <CardHeader><CardTitle className="text-base">New Task</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="space-y-3">
              <div className="space-y-1.5">
                <Label>Title *</Label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Check stock placement in shelves"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>Description</Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Any extra details..."
                  rows={2}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Customer</Label>
                  <Select value={customerId} onValueChange={(v) => setCustomerId(v ?? '')}>
                    <SelectTrigger><SelectValue placeholder="No specific customer" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">No specific customer</SelectItem>
                      {customers?.map((c) => (
                        <SelectItem key={c.id} value={c.id} label={c.company_name}>{c.company_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Assign to Worker</Label>
                  <Select value={assignedTo} onValueChange={(v) => setAssignedTo(v ?? '')}>
                    <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Unassigned</SelectItem>
                      {users?.filter(u => u.is_active !== false).map((u) => (
                        <SelectItem key={u.id} value={u.id} label={u.name}>{u.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Frequency</Label>
                  <Select value={frequency} onValueChange={(v) => v && setFrequency(v as TaskFrequency)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="once">One-time</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Due Date</Label>
                  <Input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                  />
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <Button
                  type="submit"
                  className="bg-red-600 hover:bg-red-700"
                  disabled={createTask.isPending}
                >
                  Create Task
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <Select value={filterCustomer} onValueChange={(v) => setFilterCustomer(v ?? 'all')}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All customers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All customers</SelectItem>
            {customers?.map((c) => (
              <SelectItem key={c.id} value={c.id} label={c.company_name}>{c.company_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant={showCompleted ? 'default' : 'outline'}
          size="sm"
          onClick={() => setShowCompleted((v) => !v)}
          className="text-sm"
        >
          Show completed
        </Button>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      )}

      {/* Pending tasks */}
      {!isLoading && pending.length === 0 && completed.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
          <ClipboardList className="h-12 w-12 opacity-20" />
          <p className="font-medium">No tasks yet</p>
          <p className="text-sm">Create a task to keep track of recurring work per customer</p>
        </div>
      )}

      {pending.length > 0 && (
        <div className="space-y-2">
          {pending.map((task) => (
            <div
              key={task.id}
              className="flex items-start gap-3 px-3 py-1.5 leading-tight rounded-xl border bg-card"
            >
              <button
                onClick={() => completeTask.mutate({ id: task.id, completed: true, task })}
                className="mt-0.5 shrink-0 text-muted-foreground hover:text-green-600 transition-colors"
              >
                <Circle className="h-5 w-5" />
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-0.5">
                  <p className="font-medium text-sm">{task.title}</p>
                  <Badge variant="secondary" className={`text-xs ${FREQUENCY_COLORS[task.frequency]}`}>
                    {task.frequency === 'weekly' && <RefreshCw className="h-2.5 w-2.5 mr-1" />}
                    {task.frequency === 'monthly' && <RefreshCw className="h-2.5 w-2.5 mr-1" />}
                    {FREQUENCY_LABELS[task.frequency]}
                  </Badge>
                </div>
                {task.description && (
                  <p className="text-sm text-muted-foreground">{task.description}</p>
                )}
                <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-muted-foreground">
                  {(task.customer as any)?.company_name && (
                    <span className="font-medium text-foreground">{(task.customer as any).company_name}</span>
                  )}
                  {(task.assigned_user as any)?.name && (
                    <span>→ {(task.assigned_user as any).name}</span>
                  )}
                  {task.due_date && (
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      Due {new Date(task.due_date).toLocaleDateString('en', { day: 'numeric', month: 'short' })}
                    </span>
                  )}
                </div>
              </div>
              {isAdmin && (
                <button
                  onClick={() => deleteTask.mutate(task.id)}
                  className="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Completed tasks */}
      {showCompleted && completed.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Completed</p>
          <div className="space-y-2">
            {completed.map((task) => (
              <div
                key={task.id}
                className="flex items-start gap-3 px-3 py-1.5 leading-tight rounded-xl border bg-card opacity-60"
              >
                <button
                  onClick={() => completeTask.mutate({ id: task.id, completed: false })}
                  className="mt-0.5 shrink-0 text-green-600"
                >
                  <CheckCircle2 className="h-5 w-5" />
                </button>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm line-through">{task.title}</p>
                  {(task.customer as any)?.company_name && (
                    <p className="text-xs text-muted-foreground mt-0.5">{(task.customer as any).company_name}</p>
                  )}
                </div>
                {isAdmin && (
                  <button
                    onClick={() => deleteTask.mutate(task.id)}
                    className="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
