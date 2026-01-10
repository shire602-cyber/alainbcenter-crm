'use client'

/**
 * WINS TODAY SECTION
 * Metrics + positive feedback
 * Celebrating achievements
 */

import { useState, useEffect } from 'react'
import { CheckCircle2, DollarSign, MessageSquare, Sparkles } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export function WinsToday() {
  const [metrics, setMetrics] = useState<{
    tasksCompleted?: number
    revenueClosed?: number
    messagesSent?: number
    quotesSent?: number
  }>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadMetrics()
    const interval = setInterval(loadMetrics, 60000)
    return () => clearInterval(interval)
  }, [])

  async function loadMetrics() {
    try {
      const res = await fetch('/api/dashboard/wins-today')
      if (res.ok) {
        const data = await res.json()
        setMetrics(data.metrics || {})
      }
    } catch (error) {
      console.error('Failed to load wins:', error)
    } finally {
      setLoading(false)
    }
  }

  // Hide section if no metrics available yet
  if (loading || (!metrics.tasksCompleted && !metrics.messagesSent && !metrics.quotesSent)) {
    return (
      <div className="p-8 text-center rounded-2xl bg-slate-50 border border-slate-200">
        <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center mx-auto mb-4">
          <Sparkles className="h-8 w-8 text-blue-600" />
        </div>
        <p className="text-sm font-semibold text-slate-900 mb-1">
          Wins Today
        </p>
        <p className="text-xs text-slate-500">
          Track your achievements here
        </p>
      </div>
    )
  }
  const wins = [
    {
      icon: CheckCircle2,
      label: 'Tasks Completed',
      value: metrics.tasksCompleted || 0,
      color: 'text-green-600',
      bgColor: 'bg-green-100',
    },
    {
      icon: MessageSquare,
      label: 'Messages Sent',
      value: metrics.messagesSent || 0,
      color: 'text-purple-600',
      bgColor: 'bg-purple-100',
    },
    {
      icon: Sparkles,
      label: 'Quotes Sent',
      value: metrics.quotesSent || 0,
      color: 'text-orange-600',
      bgColor: 'bg-orange-100',
    },
  ].filter(win => win.value > 0) // Only show wins with value > 0

  if (wins.length === 0) {
    return (
      <div className="p-8 text-center rounded-2xl bg-slate-50 border border-slate-200">
        <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center mx-auto mb-4">
          <Sparkles className="h-8 w-8 text-blue-600" />
        </div>
        <p className="text-sm font-semibold text-slate-900 mb-1">
          Wins Today
        </p>
        <p className="text-xs text-slate-500">
          Track your achievements here
        </p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-4">
      {wins.map((win, idx) => {
        const Icon = win.icon
        return (
          <Card
            key={idx}
            className="p-6 rounded-2xl border-2 border-slate-200 bg-gradient-to-br from-slate-50 to-slate-100"
          >
            <div className="flex items-center gap-4">
              <div className={cn(
                "w-12 h-12 rounded-xl flex items-center justify-center",
                win.bgColor
              )}>
                <Icon className={cn("h-6 w-6", win.color)} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-slate-500 mb-1">
                  {win.label}
                </p>
                <p className={cn("text-2xl font-bold", win.color)}>
                  {win.value}
                </p>
              </div>
            </div>
          </Card>
        )
      })}
    </div>
  )
}

