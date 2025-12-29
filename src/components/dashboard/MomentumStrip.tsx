'use client'

/**
 * MOMENTUM STRIP - TODAY'S IMPACT
 * 
 * Premium metric pills that feel like a live cockpit but calm.
 * Each pill is pressable and navigates to filtered views.
 * 
 * UX RATIONALE:
 * - 4 pills max = scannable, not overwhelming
 * - Pressable = actionable, not just display
 * - Hover lift = feels alive
 * - Empty state = positive, not scary
 */

import { useState, useEffect, memo } from 'react'
import { MessageSquare, FileText, Calendar, TrendingUp, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import { useRouter } from 'next/navigation'
import { useSmartPolling } from '@/hooks/useSmartPolling'

interface MomentumMetrics {
  repliesToday: number
  quotesToday: number
  renewals7d: number
  revenuePotentialToday: number | null
}

function MetricPill({ 
  icon, 
  value, 
  label, 
  href,
  color = 'blue' 
}: { 
  icon: React.ReactNode
  value: number | string
  label: string
  href?: string
  color?: 'blue' | 'green' | 'purple' | 'amber'
}) {
  const router = useRouter()
  const [hovered, setHovered] = useState(false)

  const colorClasses = {
    blue: 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400 border-blue-200/60 dark:border-blue-800/60',
    green: 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400 border-green-200/60 dark:border-green-800/60',
    purple: 'bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400 border-purple-200/60 dark:border-purple-800/60',
    amber: 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 border-amber-200/60 dark:border-amber-800/60',
  }

  const handleClick = () => {
    if (href) {
      router.push(href)
    }
  }

  return (
    <div
      className={cn(
        "pill flex items-center gap-2 px-3 py-2 border transition-all duration-200",
        colorClasses[color],
        href && "cursor-pointer",
        hovered && href && "-translate-y-0.5 shadow-md",
        href && "active:scale-95"
      )}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={handleClick}
    >
      {icon}
      <span className="font-semibold text-body">{value}</span>
      <span className="text-meta opacity-80">{label}</span>
    </div>
  )
}

interface MomentumStripProps {
  momentum?: {
    repliesToday: number
    quotesToday: number
    renewalsNext7Days: number
    revenuePotentialToday: number | null
  }
}

export const MomentumStrip = memo(function MomentumStrip({ momentum: propMomentum }: MomentumStripProps) {
  const [metrics, setMetrics] = useState<MomentumMetrics>({
    repliesToday: 0,
    quotesToday: 0,
    renewals7d: 0,
    revenuePotentialToday: null,
  })
  const [loading, setLoading] = useState(!propMomentum)

  const loadMetrics = async () => {
    try {
      const res = await fetch('/api/dashboard/momentum')
      if (res.ok) {
        const data = await res.json()
        setMetrics({
          repliesToday: data.repliesToday,
          quotesToday: data.quotesToday,
          renewals7d: data.renewals7d,
          revenuePotentialToday: data.revenuePotentialToday,
        })
      }
    } catch (error) {
      console.error('Failed to load momentum metrics:', error)
    } finally {
      setLoading(false)
    }
  }

  const { isPolling } = useSmartPolling({
    fetcher: loadMetrics,
    intervalMs: 60000, // 60s polling
    enabled: !propMomentum, // Disable polling if momentum provided via props
    pauseWhenHidden: true,
    onErrorBackoff: true,
  })

  useEffect(() => {
    if (!propMomentum) {
      loadMetrics()
    }
  }, [propMomentum])

  // Use prop momentum if provided
  const displayMetrics = propMomentum ? {
    repliesToday: propMomentum.repliesToday,
    quotesToday: propMomentum.quotesToday,
    renewals7d: propMomentum.renewalsNext7Days,
    revenuePotentialToday: propMomentum.revenuePotentialToday,
  } : metrics

  if (loading) {
    return (
      <Card className="card-premium p-4">
        <div className="flex items-center gap-3 flex-wrap">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-10 w-28 bg-slate-200 dark:bg-slate-800 rounded-lg animate-pulse" />
          ))}
        </div>
      </Card>
    )
  }

  const hasMetrics = displayMetrics.repliesToday > 0 || 
                     displayMetrics.quotesToday > 0 || 
                     displayMetrics.renewals7d > 0 || 
                     (displayMetrics.revenuePotentialToday !== null && displayMetrics.revenuePotentialToday > 0)

  if (!hasMetrics) {
    return (
      <Card className="card-premium p-6 text-center">
        <div className="flex flex-col items-center gap-2">
          <Sparkles className="h-5 w-5 text-slate-400" />
          <p className="text-body font-medium text-slate-700 dark:text-slate-300">
            Getting started…
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
        {displayMetrics.repliesToday > 0 && (
          <MetricPill
            icon={<MessageSquare className="h-3.5 w-3.5" />}
            value={displayMetrics.repliesToday}
            label="replies"
            href="/inbox"
            color="blue"
          />
        )}
        {displayMetrics.quotesToday > 0 && (
          <MetricPill
            icon={<FileText className="h-3.5 w-3.5" />}
            value={displayMetrics.quotesToday}
            label="quotes"
            href="/leads?filter=quotes"
            color="purple"
          />
        )}
        {displayMetrics.renewals7d > 0 && (
          <MetricPill
            icon={<Calendar className="h-3.5 w-3.5" />}
            value={displayMetrics.renewals7d}
            label="renewals"
            href="/leads?filter=renewals"
            color="amber"
          />
        )}
        {displayMetrics.revenuePotentialToday !== null && displayMetrics.revenuePotentialToday > 0 && (
          <MetricPill
            icon={<TrendingUp className="h-3.5 w-3.5" />}
            value={`${(displayMetrics.revenuePotentialToday / 1000).toFixed(0)}k`}
            label="AED"
            href="/leads?filter=qualified"
            color="green"
          />
        )}
        {displayMetrics.revenuePotentialToday === null && (
          <MetricPill
            icon={<TrendingUp className="h-3.5 w-3.5" />}
            value="—"
            label="revenue"
            color="green"
          />
        )}
      </div>
    </Card>
  )
})
