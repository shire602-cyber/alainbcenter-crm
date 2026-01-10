'use client'

/**
 * COMMAND CENTER COMPONENT
 * 
 * Premium, actionable command center with grouped sections:
 * - URGENT: Must handle today
 * - REVENUE NOW: Ready for quote, follow-ups
 * - OPERATIONS: Expiring items, docs pending
 * - QUIET WINS: Completed today
 */

import { useState, useEffect, memo } from 'react'
import { AlertCircle, DollarSign, FileText, CheckCircle2, ArrowRight, Clock, Zap } from 'lucide-react'
import { format, formatDistanceToNow } from 'date-fns'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'

interface CommandCenterItem {
  id: string
  leadId: number
  contactName: string
  serviceType?: string
  title: string
  reason: string
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'
  action: {
    type: 'reply' | 'call' | 'send_quote' | 'view' | 'follow_up'
    label: string
    url: string
  }
  dueDate?: string
  revenuePotential?: number
  owner?: string
}

interface QuietWins {
  id: string
  type: 'summary'
  tasksCompleted: number
  messagesSent: number
}

interface CommandCenterData {
  urgent: CommandCenterItem[]
  revenueNow: CommandCenterItem[]
  operations: CommandCenterItem[]
  quietWins: QuietWins[]
  counts: {
    urgent: number
    revenueNow: number
    operations: number
  }
}

const CommandCenterItemCard = memo(({ item }: { item: CommandCenterItem }) => {
  const isHighValue = item.revenuePotential && item.revenuePotential >= 10000
  const isUrgent = item.priority === 'URGENT'
  
  const priorityStyles = {
    URGENT: {
      card: 'border-red-300 bg-gradient-to-br from-red-50 to-red-100',
      button: 'bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-500/20',
    },
    HIGH: {
      card: isHighValue 
        ? 'border-orange-300 bg-gradient-to-br from-orange-50 to-amber-50 ring-2 ring-orange-200'
        : 'border-orange-200 bg-orange-50',
      button: 'bg-orange-600 hover:bg-orange-700 text-white',
    },
    NORMAL: {
      card: isHighValue
        ? 'border-blue-300 bg-gradient-to-br from-blue-50 to-indigo-50 ring-2 ring-blue-200'
        : 'border-blue-200 bg-blue-50',
      button: 'bg-blue-600 hover:bg-blue-700 text-white',
    },
    LOW: {
      card: 'border-slate-200 bg-slate-50',
      button: 'bg-slate-600 hover:bg-slate-700 text-white',
    },
  }

  const styles = priorityStyles[item.priority]

  return (
    <Card className={cn("p-4 rounded-xl border-2 transition-all hover:shadow-lg", styles.card)}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            {isUrgent && (
              <AlertCircle className="h-4 w-4 text-red-700 flex-shrink-0 animate-pulse" />
            )}
            {isHighValue && (
              <Zap className="h-4 w-4 text-amber-700 flex-shrink-0" />
            )}
            <h4 className="text-sm font-bold text-slate-900 truncate tracking-tight">
              {item.title}
            </h4>
            {isHighValue && (
              <Badge className="bg-amber-500 text-white text-xs px-2 py-0.5">
                High Value
              </Badge>
            )}
            {item.serviceType && (
              <Badge variant="outline" className="text-xs">
                {item.serviceType}
              </Badge>
            )}
          </div>
          <p className="text-xs text-slate-600 mb-2 font-medium">
            {item.reason}
          </p>
          {item.dueDate && (
            <div className="flex items-center gap-1.5 mb-3">
              <Clock className="h-3 w-3 text-slate-500" />
              <span className="text-xs text-slate-600 font-medium">
                Due {item.dueDate}
              </span>
            </div>
          )}
          <Link href={item.action.url}>
            <Button
              size="sm"
              className={cn("w-full rounded-lg font-semibold h-9", styles.button)}
            >
              {item.action.label}
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </Link>
        </div>
        {item.revenuePotential && (
          <div className="flex-shrink-0 text-right">
            <div className="flex items-center gap-1 justify-end mb-1">
              <DollarSign className={cn(
                "h-3.5 w-3.5",
                isHighValue ? "text-amber-700" : "text-slate-500"
              )} />
              <p className={cn(
                "text-xs font-semibold",
                isHighValue ? "text-amber-700" : "text-slate-600"
              )}>
                Potential
              </p>
            </div>
            <p className={cn(
              "text-base font-bold",
              isHighValue ? "text-amber-800" : "text-slate-900"
            )}>
              AED {item.revenuePotential.toLocaleString()}
            </p>
          </div>
        )}
      </div>
    </Card>
  )
})

CommandCenterItemCard.displayName = 'CommandCenterItemCard'

export function CommandCenter() {
  const [data, setData] = useState<CommandCenterData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
    const interval = setInterval(loadData, 60000) // Refresh every minute
    return () => clearInterval(interval)
  }, [])

  async function loadData() {
    try {
      const res = await fetch('/api/dashboard/command-center')
      if (res.ok) {
        const json = await res.json()
        setData(json)
      }
    } catch (error) {
      console.error('Failed to load command center:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-32 bg-slate-200 rounded-xl animate-pulse" />
        ))}
      </div>
    )
  }

  if (!data) {
    return (
      <div className="p-12 text-center rounded-2xl bg-slate-50 border-2 border-slate-200/60">
        <p className="text-sm text-slate-600 font-medium">
          Failed to load command center
        </p>
      </div>
    )
  }

  const hasItems = data.urgent.length > 0 || data.revenueNow.length > 0 || data.operations.length > 0

  return (
    <div className="space-y-6">
      {/* URGENT Section */}
      {data.urgent.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-red-700" />
              <h2 className="text-lg font-bold text-slate-900 tracking-tight">
                URGENT
              </h2>
              <Badge variant="destructive" className="text-xs">
                {data.counts.urgent}
              </Badge>
            </div>
            {data.counts.urgent > 5 && (
              <Link href="/leads?filter=urgent">
                <Button variant="ghost" size="sm" className="text-xs">
                  View all
                  <ArrowRight className="h-3 w-3 ml-1" />
                </Button>
              </Link>
            )}
          </div>
          <div className="space-y-3">
            {data.urgent.map((item) => (
              <CommandCenterItemCard key={item.id} item={item} />
            ))}
          </div>
        </div>
      )}

      {/* REVENUE NOW Section */}
      {data.revenueNow.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-green-700" />
              <h2 className="text-lg font-bold text-slate-900 tracking-tight">
                REVENUE NOW
              </h2>
              <Badge className="bg-green-600 text-white text-xs">
                {data.counts.revenueNow}
              </Badge>
            </div>
            {data.counts.revenueNow > 5 && (
              <Link href="/leads?filter=qualified">
                <Button variant="ghost" size="sm" className="text-xs">
                  View all
                  <ArrowRight className="h-3 w-3 ml-1" />
                </Button>
              </Link>
            )}
          </div>
          <div className="space-y-3">
            {data.revenueNow.map((item) => (
              <CommandCenterItemCard key={item.id} item={item} />
            ))}
          </div>
        </div>
      )}

      {/* OPERATIONS Section */}
      {data.operations.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-blue-700" />
              <h2 className="text-lg font-bold text-slate-900 tracking-tight">
                OPERATIONS
              </h2>
              <Badge className="bg-blue-600 text-white text-xs">
                {data.counts.operations}
              </Badge>
            </div>
            {data.counts.operations > 5 && (
              <Link href="/renewals">
                <Button variant="ghost" size="sm" className="text-xs">
                  View all
                  <ArrowRight className="h-3 w-3 ml-1" />
                </Button>
              </Link>
            )}
          </div>
          <div className="space-y-3">
            {data.operations.map((item) => (
              <CommandCenterItemCard key={item.id} item={item} />
            ))}
          </div>
        </div>
      )}

      {/* QUIET WINS Section */}
      {data.quietWins.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 className="h-5 w-5 text-green-700" />
            <h2 className="text-lg font-bold text-slate-900 tracking-tight">
              QUIET WINS
            </h2>
          </div>
          <Card className="p-6 rounded-xl border-2 border-green-200/60 bg-gradient-to-br from-green-50 to-emerald-50">
            <div className="grid grid-cols-2 gap-4">
              {data.quietWins[0]?.tasksCompleted > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-600 mb-1">
                    Tasks Completed
                  </p>
                  <p className="text-2xl font-bold text-green-800">
                    {data.quietWins[0].tasksCompleted}
                  </p>
                </div>
              )}
              {data.quietWins[0]?.messagesSent > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-600 mb-1">
                    Messages Sent
                  </p>
                  <p className="text-2xl font-bold text-green-800">
                    {data.quietWins[0].messagesSent}
                  </p>
                </div>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* Empty State */}
      {!hasItems && data.quietWins.length === 0 && (
        <div className="p-12 text-center rounded-2xl bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-200/60">
          <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-green-500/10">
            <span className="text-4xl">🎉</span>
          </div>
          <p className="text-lg font-bold text-slate-900 mb-2 tracking-tight">
            All caught up!
          </p>
          <p className="text-sm text-slate-600 font-medium">
            No urgent priorities right now. Great work!
          </p>
        </div>
      )}
    </div>
  )
}

