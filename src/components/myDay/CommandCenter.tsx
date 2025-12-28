'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  MessageSquare,
  Phone,
  FileText,
  TrendingUp,
  ArrowRight,
  Zap,
  Hourglass,
  CheckCheck,
} from 'lucide-react'
import { format, formatDistanceToNow } from 'date-fns'
import { cn } from '@/lib/utils'

interface CommandCenterItem {
  id: string
  leadId: number
  contactName: string
  serviceType?: string
  title: string
  reason: string
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'
  category: 'ACTION_REQUIRED' | 'QUICK_WIN' | 'WAITING_ON_CUSTOMER'
  action: {
    type: 'reply' | 'call' | 'send_quote' | 'view' | 'follow_up'
    label: string
    url: string
    estimatedMinutes?: number
  }
  dueAt?: string
  revenuePotential?: number
}

interface CommandCenter {
  actionRequired: CommandCenterItem[]
  quickWins: CommandCenterItem[]
  waitingOnCustomer: CommandCenterItem[]
  summary: {
    totalItems: number
    urgentCount: number
    estimatedTimeMinutes: number
  }
}

export function CommandCenter() {
  const [data, setData] = useState<CommandCenter | null>(null)
  const [loading, setLoading] = useState(true)
  const [showEndDayModal, setShowEndDayModal] = useState(false)

  useEffect(() => {
    loadCommandCenter()
    // Refresh every 60 seconds
    const interval = setInterval(loadCommandCenter, 60000)
    return () => clearInterval(interval)
  }, [])

  async function loadCommandCenter() {
    try {
      const res = await fetch('/api/my-day')
      if (res.ok) {
        const data = await res.json()
        setData(data)
      }
    } catch (error) {
      console.error('Failed to load command center:', error)
    } finally {
      setLoading(false)
    }
  }

  function getPriorityColor(priority: string) {
    switch (priority) {
      case 'URGENT':
        return 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400 border-red-200 dark:border-red-800'
      case 'HIGH':
        return 'bg-orange-100 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400 border-orange-200 dark:border-orange-800'
      case 'NORMAL':
        return 'bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400 border-blue-200 dark:border-blue-800'
      default:
        return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700'
    }
  }

  function getActionIcon(actionType: string) {
    switch (actionType) {
      case 'reply':
        return <MessageSquare className="h-4 w-4" />
      case 'call':
        return <Phone className="h-4 w-4" />
      case 'send_quote':
        return <FileText className="h-4 w-4" />
      case 'follow_up':
        return <TrendingUp className="h-4 w-4" />
      default:
        return <ArrowRight className="h-4 w-4" />
    }
  }

  function renderItem(item: CommandCenterItem) {
    return (
      <Link
        key={item.id}
        href={item.action.url}
        className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:border-slate-300 dark:hover:border-slate-700 transition-all group"
      >
        <div className={cn(
          "flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center",
          item.priority === 'URGENT' && "bg-red-100 dark:bg-red-900/20",
          item.priority === 'HIGH' && "bg-orange-100 dark:bg-orange-900/20",
          item.priority === 'NORMAL' && "bg-blue-100 dark:bg-blue-900/20",
          item.priority === 'LOW' && "bg-slate-100 dark:bg-slate-800",
        )}>
          {getActionIcon(item.action.type)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate group-hover:text-primary transition-colors">
                {item.title}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {item.reason}
              </p>
              {item.serviceType && (
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                  {item.serviceType}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {item.dueAt && (
                <span className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                  {formatDistanceToNow(new Date(item.dueAt), { addSuffix: true })}
                </span>
              )}
              <span className={cn(
                "px-2 py-0.5 rounded text-xs font-medium border",
                getPriorityColor(item.priority)
              )}>
                {item.priority}
              </span>
            </div>
          </div>
          {item.revenuePotential && (
            <div className="mt-2 flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
              <span>Revenue: AED {item.revenuePotential.toLocaleString()}</span>
              {item.action.estimatedMinutes && (
                <span>Est. {item.action.estimatedMinutes} min</span>
              )}
            </div>
          )}
        </div>
        <div className="flex-shrink-0">
          <div className="px-3 py-1.5 rounded-md bg-primary/10 text-primary text-xs font-medium group-hover:bg-primary/20 transition-colors">
            {item.action.label}
          </div>
        </div>
      </Link>
    )
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-32 bg-slate-100 dark:bg-slate-800 rounded-lg animate-pulse" />
        <div className="h-32 bg-slate-100 dark:bg-slate-800 rounded-lg animate-pulse" />
        <div className="h-32 bg-slate-100 dark:bg-slate-800 rounded-lg animate-pulse" />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="text-center py-8">
        <p className="text-slate-500 dark:text-slate-400">Failed to load command center</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Summary Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">My Day</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {data.summary.totalItems} items · {data.summary.urgentCount} urgent · ~{Math.round(data.summary.estimatedTimeMinutes / 60)}h estimated
          </p>
        </div>
        <button
          onClick={() => setShowEndDayModal(true)}
          className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
        >
          End My Day
        </button>
      </div>

      {/* ACTION REQUIRED */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Action Required
          </h3>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            ({data.actionRequired.length}/3)
          </span>
        </div>
        {data.actionRequired.length === 0 ? (
          <div className="p-6 text-center border border-slate-200 dark:border-slate-800 rounded-lg bg-slate-50 dark:bg-slate-900/50">
            <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400 mx-auto mb-2" />
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">No urgent actions</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Great work!</p>
          </div>
        ) : (
          <div className="space-y-2">
            {data.actionRequired.map(renderItem)}
          </div>
        )}
      </div>

      {/* QUICK WINS */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Zap className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Quick Wins
          </h3>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            ({data.quickWins.length})
          </span>
        </div>
        {data.quickWins.length === 0 ? (
          <div className="p-4 text-center border border-slate-200 dark:border-slate-800 rounded-lg bg-slate-50 dark:bg-slate-900/50">
            <p className="text-sm text-slate-500 dark:text-slate-400">No quick wins available</p>
          </div>
        ) : (
          <div className="space-y-2">
            {data.quickWins.map(renderItem)}
          </div>
        )}
      </div>

      {/* WAITING ON CUSTOMER */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Hourglass className="h-5 w-5 text-orange-600 dark:text-orange-400" />
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Waiting on Customer
          </h3>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            ({data.waitingOnCustomer.length})
          </span>
        </div>
        {data.waitingOnCustomer.length === 0 ? (
          <div className="p-4 text-center border border-slate-200 dark:border-slate-800 rounded-lg bg-slate-50 dark:bg-slate-900/50">
            <p className="text-sm text-slate-500 dark:text-slate-400">No items waiting</p>
          </div>
        ) : (
          <div className="space-y-2">
            {data.waitingOnCustomer.map(renderItem)}
          </div>
        )}
      </div>

      {/* End My Day Modal */}
      {showEndDayModal && (
        <EndDayModal
          data={data}
          onClose={() => setShowEndDayModal(false)}
        />
      )}
    </div>
  )
}

function EndDayModal({ data, onClose }: { data: CommandCenter; onClose: () => void }) {
  const completed = data.actionRequired.filter(item => item.priority === 'LOW' || item.priority === 'NORMAL').length
  const pending = data.actionRequired.filter(item => item.priority === 'HIGH' || item.priority === 'URGENT').length

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 rounded-lg p-6 max-w-md w-full mx-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">
          End My Day Summary
        </h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
            <span className="text-sm text-slate-600 dark:text-slate-400">Total Items</span>
            <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{data.summary.totalItems}</span>
          </div>
          <div className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
            <span className="text-sm text-green-700 dark:text-green-400">Completed</span>
            <span className="text-sm font-semibold text-green-700 dark:text-green-400">{completed}</span>
          </div>
          <div className="flex items-center justify-between p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
            <span className="text-sm text-orange-700 dark:text-orange-400">Pending Urgent</span>
            <span className="text-sm font-semibold text-orange-700 dark:text-orange-400">{pending}</span>
          </div>
          <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <span className="text-sm text-blue-700 dark:text-blue-400">Time Spent</span>
            <span className="text-sm font-semibold text-blue-700 dark:text-blue-400">
              ~{Math.round(data.summary.estimatedTimeMinutes / 60)}h
            </span>
          </div>
        </div>
        <div className="mt-6 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
          >
            Close
          </button>
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90 transition-colors"
          >
            End Day
          </button>
        </div>
      </div>
    </div>
  )
}

