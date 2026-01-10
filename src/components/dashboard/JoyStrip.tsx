'use client'

/**
 * JOY STRIP - STAFF HAPPINESS METRICS
 * 
 * Subtle, premium metrics that make staff feel rewarded:
 * - Time-to-first-reply (TTFR)
 * - Tasks done
 * - Leads advanced
 * - Saved from SLA
 * - Revenue actions
 * - Streak
 * 
 * UX RATIONALE:
 * - Always positive framing (never guilt)
 * - Calm, premium design (not childish)
 * - Encouragement based on data (deterministic)
 */

import { useState, useEffect, memo } from 'react'
import { Clock, CheckCircle2, TrendingUp, Shield, DollarSign, Flame } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useSmartPolling } from '@/hooks/useSmartPolling'

interface JoyMetrics {
  ttfrMedianMinutes: number | null
  tasksDone: number
  leadsAdvanced: number
  savedFromSla: number
  revenueActions: number
  streak: {
    daysActive: number
    todayDone: boolean
  }
  friction?: {
    highTtfr: boolean
    overdueTasks: number
    waitingLong: number
  }
}

function getEncouragementText(metrics: JoyMetrics): string {
  if (metrics.streak.daysActive >= 7) {
    return '🔥 Great streak!'
  }
  if (metrics.tasksDone >= 5) {
    return 'Nice progress today'
  }
  if (metrics.savedFromSla > 0) {
    return 'Saved from SLA breach'
  }
  if (metrics.revenueActions > 0) {
    return 'Revenue actions taken'
  }
  if (metrics.leadsAdvanced > 0) {
    return 'Leads moving forward'
  }
  if (metrics.tasksDone > 0) {
    return 'Good start'
  }
  return 'Ready to make an impact'
}

function formatTTFR(minutes: number | null): string {
  if (minutes === null) return '—'
  if (minutes < 60) return `${Math.round(minutes)}m`
  const hours = Math.floor(minutes / 60)
  const mins = Math.round(minutes % 60)
  return `${hours}h ${mins}m`
}

export const JoyStrip = memo(function JoyStrip() {
  const [metrics, setMetrics] = useState<JoyMetrics | null>(null)
  const [loading, setLoading] = useState(true)

  const loadMetrics = async () => {
    try {
      const res = await fetch('/api/dashboard/joy')
      if (res.ok) {
        const data = await res.json()
        setMetrics(data)
      }
    } catch (error) {
      console.error('Failed to load joy metrics:', error)
    } finally {
      setLoading(false)
    }
  }

  const { isPolling } = useSmartPolling({
    fetcher: loadMetrics,
    intervalMs: 60000, // 60s polling
    enabled: true,
    pauseWhenHidden: true,
    onErrorBackoff: true,
  })

  useEffect(() => {
    loadMetrics()
  }, [])

  if (loading) {
    return (
      <Card className="card-premium inset-card">
        <div className="flex items-center gap-3 flex-wrap">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-10 w-28 bg-slate-200 rounded-lg animate-pulse" />
          ))}
        </div>
      </Card>
    )
  }

  if (!metrics) {
    return null
  }

  const encouragement = getEncouragementText(metrics)
  const hasActivity = metrics.tasksDone > 0 || metrics.leadsAdvanced > 0 || metrics.revenueActions > 0

  return (
    <div className="space-y-3">
      {/* Joy Metrics */}
      <Card className="card-premium inset-card">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-h2 font-bold text-slate-900 tracking-tight">
            Today's Impact
          </h4>
          <span className="text-meta text-slate-600 font-semibold">{encouragement}</span>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {metrics.ttfrMedianMinutes !== null && (
            <div className="flex items-center gap-2 pill bg-blue-50 text-blue-700 border-blue-200/60 px-3 py-2 rounded-lg">
              <Clock className="h-3.5 w-3.5" />
              <span className="text-body font-bold">{formatTTFR(metrics.ttfrMedianMinutes)}</span>
              <span className="text-meta opacity-80 font-medium">avg reply</span>
            </div>
          )}
          {metrics.tasksDone > 0 && (
            <div className="flex items-center gap-2 pill bg-green-50 text-green-700 border-green-200/60 px-3 py-2 rounded-lg">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span className="text-body font-bold">{metrics.tasksDone}</span>
              <span className="text-meta opacity-80 font-medium">tasks</span>
            </div>
          )}
          {metrics.leadsAdvanced > 0 && (
            <div className="flex items-center gap-2 pill bg-purple-50 text-purple-700 border-purple-200/60 px-3 py-2 rounded-lg">
              <TrendingUp className="h-3.5 w-3.5" />
              <span className="text-body font-bold">{metrics.leadsAdvanced}</span>
              <span className="text-meta opacity-80 font-medium">advanced</span>
            </div>
          )}
          {metrics.savedFromSla > 0 && (
            <div className="flex items-center gap-2 pill bg-amber-50 text-amber-700 border-amber-200/60 px-3 py-2 rounded-lg">
              <Shield className="h-3.5 w-3.5" />
              <span className="text-body font-bold">{metrics.savedFromSla}</span>
              <span className="text-meta opacity-80 font-medium">saved</span>
            </div>
          )}
          {metrics.revenueActions > 0 && (
            <div className="flex items-center gap-2 pill bg-emerald-50 text-emerald-700 border-emerald-200/60 px-3 py-2 rounded-lg">
              <DollarSign className="h-3.5 w-3.5" />
              <span className="text-body font-bold">{metrics.revenueActions}</span>
              <span className="text-meta opacity-80 font-medium">revenue</span>
            </div>
          )}
          {metrics.streak.daysActive > 0 && (
            <div className="flex items-center gap-2 pill bg-orange-50 text-orange-700 border-orange-200/60 px-3 py-2 rounded-lg">
              <Flame className="h-3.5 w-3.5" />
              <span className="text-body font-bold">{metrics.streak.daysActive}</span>
              <span className="text-meta opacity-80 font-medium">day streak</span>
            </div>
          )}
          {!hasActivity && (
            <div className="flex items-center gap-2 text-meta muted-text">
              <span>Ready to make an impact today</span>
            </div>
          )}
        </div>
      </Card>

      {/* Friction Alerts (quiet, subtle) */}
      {metrics.friction && (
        (metrics.friction.highTtfr || metrics.friction.overdueTasks > 0 || metrics.friction.waitingLong > 0) && (
          <Card className="card-premium inset-card bg-slate-50 border-slate-200/60">
            <div className="flex items-center gap-2 text-meta text-slate-600">
              <span className="font-semibold">Friction:</span>
              {metrics.friction.highTtfr && (
                <Badge className="chip bg-slate-100 text-slate-700 font-semibold">
                  High reply time
                </Badge>
              )}
              {metrics.friction.overdueTasks > 0 && (
                <Badge className="chip bg-slate-100 text-slate-700 font-semibold">
                  {metrics.friction.overdueTasks} overdue
                </Badge>
              )}
              {metrics.friction.waitingLong > 0 && (
                <Badge className="chip bg-slate-100 text-slate-700 font-semibold">
                  {metrics.friction.waitingLong} waiting
                </Badge>
              )}
            </div>
          </Card>
        )
      )}
    </div>
  )
})











