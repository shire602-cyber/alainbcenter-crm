'use client'

/**
 * MOMENTUM STRIP - TODAY'S IMPACT
 * 
 * Premium metric pills with subtle celebration
 * Empty state: "All caught up" (positive, not empty)
 */

import { useState, useEffect, memo } from 'react'
import { CheckCircle2, MessageSquare, FileText, TrendingUp, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'

interface MomentumMetrics {
  tasksCompleted?: number
  messagesSent?: number
  quotesSent?: number
  revenueClosed?: number
}

function MetricPill({ 
  icon, 
  value, 
  label, 
  color = 'blue' 
}: { 
  icon: React.ReactNode
  value: number
  label: string
  color?: 'blue' | 'green' | 'purple'
}) {
  const colorClasses = {
    blue: 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400',
    green: 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400',
    purple: 'bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400',
  }

  return (
    <div className={cn(
      "pill flex items-center gap-2",
      colorClasses[color]
    )}>
      {icon}
      <span className="font-semibold">{value}</span>
      <span className="text-[11px] opacity-80">{label}</span>
    </div>
  )
}

export const MomentumStrip = memo(function MomentumStrip() {
  const [metrics, setMetrics] = useState<MomentumMetrics>({})
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
      console.error('Failed to load momentum metrics:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <Card className="card-premium p-4">
        <div className="flex items-center gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-8 w-24 bg-slate-200 dark:bg-slate-800 rounded-lg animate-pulse" />
          ))}
        </div>
      </Card>
    )
  }

  const tasks = metrics.tasksCompleted || 0
  const messages = metrics.messagesSent || 0
  const quotes = metrics.quotesSent || 0
  const revenue = metrics.revenueClosed || 0
  const hasMetrics = tasks > 0 || messages > 0 || quotes > 0 || revenue > 0

  if (!hasMetrics) {
    return (
      <Card className="card-premium p-6 text-center">
        <div className="flex flex-col items-center gap-2">
          <Sparkles className="h-5 w-5 text-slate-400" />
          <p className="text-body font-medium text-slate-700 dark:text-slate-300">
            All caught up
          </p>
          <p className="text-meta muted-text">
            Your impact today will appear here
          </p>
        </div>
      </Card>
    )
  }

  return (
    <Card className="card-premium p-4">
      <div className="flex items-center gap-3 flex-wrap">
        {tasks > 0 && (
          <MetricPill
            icon={<CheckCircle2 className="h-3.5 w-3.5" />}
            value={tasks}
            label="tasks"
            color="green"
          />
        )}
        {messages > 0 && (
          <MetricPill
            icon={<MessageSquare className="h-3.5 w-3.5" />}
            value={messages}
            label="messages"
            color="blue"
          />
        )}
        {quotes > 0 && (
          <MetricPill
            icon={<FileText className="h-3.5 w-3.5" />}
            value={quotes}
            label="quotes"
            color="purple"
          />
        )}
        {revenue > 0 && (
          <MetricPill
            icon={<TrendingUp className="h-3.5 w-3.5" />}
            value={revenue}
            label="AED"
            color="green"
          />
        )}
      </div>
    </Card>
  )
})
