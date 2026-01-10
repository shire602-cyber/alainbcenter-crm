'use client'

/**
 * TODAY'S IMPACT SECTION
 * Shows completed actions and potential revenue created
 * Mission control summary view
 */

import { useState, useEffect } from 'react'
import { CheckCircle2, MessageSquare, Sparkles, DollarSign, TrendingUp, Target } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export function TodaysImpact() {
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
      console.error('Failed to load impact metrics:', error)
    } finally {
      setLoading(false)
    }
  }

  // Hide section if no metrics available yet
  if (loading || (!metrics.tasksCompleted && !metrics.messagesSent && !metrics.quotesSent)) {
    return (
      <div className="p-12 text-center rounded-2xl bg-gradient-to-br from-slate-50 to-slate-100 border-2 border-slate-200">
        <div className="w-20 h-20 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-slate-500/10">
          <Target className="h-10 w-10 text-slate-400" />
        </div>
        <p className="text-lg font-bold text-slate-900 mb-2">
          Today's Impact
        </p>
        <p className="text-sm text-slate-600">
          Your achievements will appear here
        </p>
      </div>
    )
  }

  const impactMetrics = [
    {
      icon: CheckCircle2,
      label: 'Actions Completed',
      value: metrics.tasksCompleted || 0,
      color: 'text-green-600',
      bgColor: 'bg-green-100',
      description: 'Tasks finished today',
    },
    {
      icon: MessageSquare,
      label: 'Messages Sent',
      value: metrics.messagesSent || 0,
      color: 'text-purple-600',
      bgColor: 'bg-purple-100',
      description: 'Customer conversations',
    },
    {
      icon: Sparkles,
      label: 'Quotes Delivered',
      value: metrics.quotesSent || 0,
      color: 'text-orange-600',
      bgColor: 'bg-orange-100',
      description: 'Proposals sent',
    },
  ].filter(metric => metric.value > 0)

  if (impactMetrics.length === 0) {
    return (
      <div className="p-12 text-center rounded-2xl bg-gradient-to-br from-slate-50 to-slate-100 border-2 border-slate-200">
        <div className="w-20 h-20 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-slate-500/10">
          <Target className="h-10 w-10 text-slate-400" />
        </div>
        <p className="text-lg font-bold text-slate-900 mb-2">
          Ready to make an impact
        </p>
        <p className="text-sm text-slate-600">
          Complete actions to see your progress here
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        {impactMetrics.map((metric, idx) => {
          const Icon = metric.icon
          return (
            <Card
              key={idx}
              className="p-5 rounded-xl border-2 border-slate-200 bg-gradient-to-br from-white to-slate-50 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex items-center gap-3 mb-2">
                <div className={cn(
                  "w-10 h-10 rounded-lg flex items-center justify-center",
                  metric.bgColor
                )}>
                  <Icon className={cn("h-5 w-5", metric.color)} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-slate-600 mb-0.5">
                    {metric.label}
                  </p>
                  <p className={cn("text-2xl font-bold", metric.color)}>
                    {metric.value}
                  </p>
                </div>
              </div>
              <p className="text-xs text-slate-500">
                {metric.description}
              </p>
            </Card>
          )
        })}
      </div>
      
      {metrics.revenueClosed && metrics.revenueClosed > 0 && (
        <Card className="p-5 rounded-xl border-2 border-green-200 bg-gradient-to-br from-green-50 to-emerald-50">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg bg-green-100 flex items-center justify-center">
              <DollarSign className="h-6 w-6 text-green-600" />
            </div>
            <div className="flex-1">
              <p className="text-xs font-medium text-slate-600 mb-1">
                Revenue Created Today
              </p>
              <p className="text-2xl font-bold text-green-700">
                AED {metrics.revenueClosed.toLocaleString()}
              </p>
            </div>
            <TrendingUp className="h-6 w-6 text-green-600" />
          </div>
        </Card>
      )}
    </div>
  )
}

