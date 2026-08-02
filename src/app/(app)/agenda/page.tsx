'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Truck, ClipboardList, RefreshCw, CalendarDays, FileSpreadsheet } from 'lucide-react'
import { downloadCsv } from '@/lib/csv-export'
import { orderXcg, fmtXcg } from '@/lib/utils'
import { useMyOrders } from '@/hooks/use-orders'
import { useTasks } from '@/hooks/use-tasks'
import { useAuth } from '@/contexts/auth-context'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'

type ViewRange = 'week' | 'month'

interface AgendaEvent {
  date: string // YYYY-MM-DD
  type: 'delivery' | 'task'
  title: string
  subtitle: string
  href: string
  badge?: string
  recurring?: boolean
}

function formatDateLabel(dateStr: string): string {
  const date = new Date(dateStr + 'T12:00:00')
  const today = new Date()
  const tomorrow = new Date()
  tomorrow.setDate(today.getDate() + 1)

  const isToday = date.toDateString() === today.toDateString()
  const isTomorrow = date.toDateString() === tomorrow.toDateString()

  if (isToday) return 'Today'
  if (isTomorrow) return 'Tomorrow'
  return date.toLocaleDateString('en', { weekday: 'long', day: 'numeric', month: 'short' })
}

function isDateInRange(dateStr: string, days: number): boolean {
  const date = new Date(dateStr + 'T12:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const end = new Date(today)
  end.setDate(today.getDate() + days)
  return date >= today && date < end
}

export default function AgendaPage() {
  const [range, setRange] = useState<ViewRange>('week')
  const days = range === 'week' ? 7 : 31

  const { profile, isAdmin } = useAuth()
  const { data: orders, isLoading: ordersLoading } = useMyOrders(profile?.id, isAdmin)
  const { data: tasks, isLoading: tasksLoading } = useTasks(undefined, profile?.id, isAdmin)
  const isLoading = ordersLoading || tasksLoading

  const events = useMemo<AgendaEvent[]>(() => {
    const result: AgendaEvent[] = []

    // Planned deliveries
    for (const order of orders ?? []) {
      if (!order.planned_date) continue
      if (!isDateInRange(order.planned_date, days)) continue
      result.push({
        date: order.planned_date,
        type: 'delivery',
        title: order.customer?.company_name ?? 'Unknown customer',
        subtitle: `${order.order_number} · ${fmtXcg(orderXcg(order))}`,
        // Sales members work orders via the delivery-notes screen, not the admin order page
        href: isAdmin ? `/orders/${order.id}` : `/delivery-notes/${order.id}`,
        badge: order.status.replace(/_/g, ' '),
      })
    }

    // Tasks with due dates — tasks are an admin concept
    for (const task of (isAdmin ? tasks : []) ?? []) {
      if (!task.due_date || task.completed_at) continue
      if (!isDateInRange(task.due_date, days)) continue
      result.push({
        date: task.due_date,
        type: 'task',
        title: task.title,
        subtitle: (task.customer as any)?.company_name ?? 'General task',
        href: '/tasks',
        badge: task.frequency !== 'once' ? task.frequency : undefined,
        recurring: task.frequency !== 'once',
      })
    }

    return result.sort((a, b) => a.date.localeCompare(b.date))
  }, [orders, tasks, days])

  // Group by date
  const grouped = useMemo(() => {
    const map = new Map<string, AgendaEvent[]>()
    for (const event of events) {
      if (!map.has(event.date)) map.set(event.date, [])
      map.get(event.date)!.push(event)
    }
    return Array.from(map.entries())
  }, [events])

  return (
    <div className="p-4 lg:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Agenda</h1>
          <p className="text-muted-foreground text-sm">
            {events.length} {events.length === 1 ? 'item' : 'items'} coming up
          </p>
        </div>
        <Button variant="outline" size="icon" title="Export CSV" className="ml-auto"
          disabled={!events.length}
          onClick={() => downloadCsv(
            'agenda',
            ['Date', 'Type', 'Title', 'Details', 'Status', 'Recurring'],
            events.map(e => [e.date, e.type, e.title, e.subtitle, e.badge ?? '', e.recurring ? 'yes' : 'no'])
          )}>
          <FileSpreadsheet className="h-4 w-4" />
        </Button>
        <div className="flex gap-1 p-1 rounded-lg bg-muted">
          <Button
            size="sm"
            variant={range === 'week' ? 'default' : 'ghost'}
            className={range === 'week' ? 'bg-background shadow-sm' : ''}
            onClick={() => setRange('week')}
          >
            Week
          </Button>
          <Button
            size="sm"
            variant={range === 'month' ? 'default' : 'ghost'}
            className={range === 'month' ? 'bg-background shadow-sm' : ''}
            onClick={() => setRange('month')}
          >
            Month
          </Button>
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i}>
              <Skeleton className="h-4 w-24 mb-2" />
              <Skeleton className="h-16 rounded-xl" />
            </div>
          ))}
        </div>
      )}

      {/* Empty */}
      {!isLoading && grouped.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
          <CalendarDays className="h-12 w-12 opacity-20" />
          <p className="font-medium">Nothing planned for the coming {range === 'week' ? 'week' : 'month'}</p>
          {isAdmin ? (
            <>
              <p className="text-sm text-center">Set a planned date on an order, or add a due date to a task</p>
              <div className="flex gap-2 mt-1">
                <Link href="/orders"><Button variant="outline" size="sm">Go to Orders</Button></Link>
                <Link href="/tasks"><Button variant="outline" size="sm">Go to Tasks</Button></Link>
              </div>
            </>
          ) : (
            <p className="text-sm text-center">Your planned deliveries will show up here</p>
          )}
        </div>
      )}

      {/* Timeline */}
      {!isLoading && grouped.map(([date, dayEvents]) => (
        <div key={date}>
          {/* Date label */}
          <div className="flex items-center gap-2 mb-2">
            <p className="text-sm font-semibold">
              {formatDateLabel(date)}
            </p>
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted-foreground">{dayEvents.length}</span>
          </div>

          {/* Events */}
          <div className="space-y-2 mb-4">
            {dayEvents.map((event, i) => (
              <Link key={i} href={event.href}>
                <div className="flex items-center gap-3 px-3 py-0.5 leading-tight rounded-xl border bg-card hover:bg-accent transition-colors">
                  {/* Icon */}
                  <div className={`shrink-0 h-9 w-9 rounded-lg flex items-center justify-center ${
                    event.type === 'delivery'
                      ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                      : 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300'
                  }`}>
                    {event.type === 'delivery'
                      ? <Truck className="h-4 w-4" />
                      : <ClipboardList className="h-4 w-4" />
                    }
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-sm truncate">{event.title}</p>
                      {event.badge && (
                        <Badge variant="secondary" className="text-xs capitalize shrink-0">
                          {event.recurring && <RefreshCw className="h-2.5 w-2.5 mr-1" />}
                          {event.badge}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{event.subtitle}</p>
                  </div>

                  {/* Type label */}
                  <span className="text-xs text-muted-foreground shrink-0 hidden sm:block">
                    {event.type === 'delivery' ? 'Delivery' : 'Task'}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
