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
      card: 'border-red-300 dark:border-red-700 bg-gradient-to-br from-red-50 to-red-100 dark:from-red-900/30 dark:to-red-800/20',
      button: 'bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-500/20',
    },
    HIGH: {
      card: isHighValue 
        ? 'border-orange-300 dark:border-orange-700 bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-900/30 dark:to-amber-900/20 ring-2 ring-orange-200 dark:ring-orange-800'
        : 'border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-900/20',
      button: 'bg-orange-600 hover:bg-orange-700 text-white',
    },
    NORMAL: {
      card: isHighValue
        ? 'border-blue-300 dark:border-blue-700 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/30 dark:to-indigo-900/20 ring-2 ring-blue-200 dark:ring-blue-800'
        : 'border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20',
      button: 'bg-blue-600 hover:bg-blue-700 text-white',
    },
    LOW: {
      card: 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50',
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
              <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400 flex-shrink-0 animate-pulse" />
            )}
            {isHighValue && (
              <Zap className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
            )}
            <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
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
          <p className="text-xs text-slate-600 dark:text-slate-400 mb-2">
            {item.reason}
          </p>
          {item.dueDate && (
            <div className="flex items-center gap-1.5 mb-3">
              <Clock className="h-3 w-3 text-slate-400" />
              <span className="text-xs text-slate-500 dark:text-slate-400">
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
                isHighValue ? "text-amber-600 dark:text-amber-400" : "text-slate-400"
              )} />
              <p className={cn(
                "text-xs font-medium",
                isHighValue ? "text-amber-600 dark:text-amber-400" : "text-slate-500 dark:text-slate-400"
              )}>
                Potential
              </p>
            </div>
            <p className={cn(
              "text-base font-bold",
              isHighValue ? "text-amber-700 dark:text-amber-300" : "text-slate-900 dark:text-slate-100"
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
          <div key={i} className="h-32 bg-slate-100 dark:bg-slate-800 rounded-xl animate-pulse" />
        ))}
      </div>
    )
  }

  if (!data) {
    return (
      <div className="p-12 text-center rounded-2xl bg-slate-50 dark:bg-slate-900/50 border-2 border-slate-200 dark:border-slate-800">
        <p className="text-sm text-slate-600 dark:text-slate-400">
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
              <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
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
              <DollarSign className="h-5 w-5 text-green-600 dark:text-green-400" />
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
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
              <FileText className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
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
            <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              QUIET WINS
            </h2>
          </div>
          <Card className="p-6 rounded-xl border-2 border-green-200 dark:border-green-800 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/10">
            <div className="grid grid-cols-2 gap-4">
              {data.quietWins[0]?.tasksCompleted > 0 && (
                <div>
                  <p className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Tasks Completed
                  </p>
                  <p className="text-2xl font-bold text-green-700 dark:text-green-300">
                    {data.quietWins[0].tasksCompleted}
                  </p>
                </div>
              )}
              {data.quietWins[0]?.messagesSent > 0 && (
                <div>
                  <p className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Messages Sent
                  </p>
                  <p className="text-2xl font-bold text-green-700 dark:text-green-300">
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
        <div className="p-12 text-center rounded-2xl bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/10 border-2 border-green-200 dark:border-green-800">
          <div className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-green-500/10">
            <span className="text-4xl">🎉</span>
          </div>
          <p className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-2">
            All caught up!
          </p>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            No urgent priorities right now. Great work!
          </p>
        </div>
      )}
    </div>
  )
}

