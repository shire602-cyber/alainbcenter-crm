'use client'

/**
 * SIGNALS PANEL - CONTROL TOWER
 * 
 * Premium "Control Tower" that makes staff feel on top of everything:
 * - Renewals (expiry-driven revenue engine)
 * - Waiting on Customer (stalled conversations)
 * - Alerts (SLA risk, unassigned, missing data, quote pending)
 * 
 * UX RATIONALE:
 * - 3 stacked modules = clear separation, scannable in <5 seconds
 * - Empty states = "All clear ✅" (positive, not scary)
 * - Compact rows = more info, less scrolling
 * - Premium micro-interactions = feels alive, not dead UI
 */

import { useState, memo } from 'react'
import { Calendar, Hourglass, AlertTriangle, ChevronRight, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { SignalRow, SignalRowProps } from './SignalRow'
import { useSmartPolling } from '@/hooks/useSmartPolling'

interface SignalsData {
  renewals: SignalRowProps[]
  waiting: SignalRowProps[]
  alerts: SignalRowProps[]
  counts: {
    renewalsTotal: number
    waitingTotal: number
    alertsTotal: number
  }
}

function SignalModule({
  title,
  icon: Icon,
  items,
  count,
  total,
  emptyMessage,
  iconType,
  onRefresh,
  isRefreshing,
}: {
  title: string
  icon: React.ComponentType<{ className?: string }>
  items: SignalRowProps[]
  count: number
  total: number
  emptyMessage: string
  iconType: 'renewal' | 'waiting' | 'alert'
  onRefresh?: () => void
  isRefreshing?: boolean
}) {
  if (items.length === 0) {
    return (
      <Card className="card-premium p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-slate-400" />
            <h4 className="text-body font-semibold text-slate-900 dark:text-slate-100">
              {title}
            </h4>
          </div>
          {onRefresh && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-[10px]"
              onClick={onRefresh}
              disabled={isRefreshing}
            >
              <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
            </Button>
          )}
        </div>
        <div className="py-6 text-center">
          <p className="text-body muted-text">
            {emptyMessage}
          </p>
        </div>
      </Card>
    )
  }

  return (
    <Card className="card-premium p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          <h4 className="text-body font-semibold text-slate-900 dark:text-slate-100">
            {title}
          </h4>
          <Badge className="chip">
            {count}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {onRefresh && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-[10px]"
              onClick={onRefresh}
              disabled={isRefreshing}
            >
              <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
            </Button>
          )}
          {total > count && (
            <Link
              href={`/leads?filter=${iconType}`}
              className="text-meta text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
            >
              View all ({total})
              <ChevronRight className="h-3 w-3" />
            </Link>
          )}
        </div>
      </div>
      <div className="space-y-1.5">
        {items.map((item) => (
          <SignalRow
            key={`${iconType}-${item.leadId}`}
            {...item}
            icon={iconType}
          />
        ))}
      </div>
    </Card>
  )
}

export const SignalsPanel = memo(function SignalsPanel() {
  const [data, setData] = useState<SignalsData>({
    renewals: [],
    waiting: [],
    alerts: [],
    counts: { renewalsTotal: 0, waitingTotal: 0, alertsTotal: 0 },
  })
  const [loading, setLoading] = useState(true)

  async function loadData() {
    try {
      const res = await fetch('/api/dashboard/signals')
      if (res.ok) {
        const signalsData = await res.json()
        setData(signalsData)
      }
    } catch (error) {
      console.error('Failed to load signals:', error)
    } finally {
      setLoading(false)
    }
  }

  const { isPolling, manualRefresh } = useSmartPolling({
    fetcher: loadData,
    intervalMs: 60000, // 60s polling for dashboard
    enabled: true,
    pauseWhenHidden: true,
    onErrorBackoff: true,
  })

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="card-premium p-4">
            <div className="h-24 bg-slate-200 dark:bg-slate-800 rounded-[10px] animate-pulse" />
          </Card>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Renewals */}
      <SignalModule
        title="Renewals Coming Up"
        icon={Calendar}
        items={data.renewals}
        count={data.renewals.length}
        total={data.counts.renewalsTotal}
        emptyMessage="All clear ✅ No renewals in the next 90 days"
        iconType="renewal"
        onRefresh={manualRefresh}
        isRefreshing={isPolling}
      />

      {/* Waiting on Customer */}
      <SignalModule
        title="Customer hasn't replied yet"
        icon={Hourglass}
        items={data.waiting}
        count={data.waiting.length}
        total={data.counts.waitingTotal}
        emptyMessage="All clear ✅ All customers have replied"
        iconType="waiting"
        onRefresh={manualRefresh}
        isRefreshing={isPolling}
      />

      {/* Alerts */}
      <SignalModule
        title="System Alerts"
        icon={AlertTriangle}
        items={data.alerts}
        count={data.alerts.length}
        total={data.counts.alertsTotal}
        emptyMessage="All clear ✅ No alerts"
        iconType="alert"
        onRefresh={manualRefresh}
        isRefreshing={isPolling}
      />
    </div>
  )
})
