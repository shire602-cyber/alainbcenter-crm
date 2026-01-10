'use client'

/**
 * COMMAND CENTER DASHBOARD
 * 
 * Personal Command Center that makes staff excited to work here
 * Uses single endpoint: /api/dashboard/command-center
 */

import { useState, useEffect, memo, useCallback } from 'react'
import { FocusHeroCard, FocusHeroCardSkeleton } from './FocusHeroCard'
import { UpNextList } from './UpNextList'
import { SignalsPanel } from './SignalsPanel'
import { MomentumStrip } from './MomentumStrip'
import { CompletedTodayCard } from './CompletedTodayCard'
import { JoyStrip } from './JoyStrip'
import { useSmartPolling } from '@/hooks/useSmartPolling'
import type { CommandCenterData } from '@/lib/dashboard/commandCenterTypes'
import type { SignalsData } from '@/lib/dashboard/signals'
import { EmptyState } from '@/components/ui/empty-state'
import { Button } from '@/components/ui/button'
import { RefreshCw, BarChart3 } from 'lucide-react'

export const CommandCenterDashboard = memo(function CommandCenterDashboard() {
  const [data, setData] = useState<CommandCenterData | null>(null)
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard/command-center')
      if (res.ok) {
        const commandData = await res.json()
        setData(commandData)
      }
    } catch (error) {
      console.error('Failed to load command center data:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  const { isPolling, manualRefresh } = useSmartPolling({
    fetcher: loadData,
    intervalMs: 60000, // 60s polling
    enabled: true,
    pauseWhenHidden: true,
    onErrorBackoff: true,
  })

  useEffect(() => {
    loadData()
  }, [loadData])

  if (loading) {
    return (
      <div className="space-y-4">
        <FocusHeroCardSkeleton />
        <div className="h-32 bg-slate-200 rounded-xl animate-pulse" />
        <div className="grid md:grid-cols-2 gap-4">
          <div className="h-64 bg-slate-200 rounded-xl animate-pulse" />
          <div className="h-32 bg-slate-200 rounded-xl animate-pulse" />
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="space-y-4">
        <EmptyState
          icon={BarChart3}
          title="No Dashboard Data"
          description="We couldn't load your dashboard data. Please refresh the page or check your connection."
          action={
            <Button onClick={() => loadData()} variant="default">
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          }
        />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Hero: Focus Now */}
      <FocusHeroCard
        item={data.focusNow}
        onRefresh={manualRefresh}
        isRefreshing={isPolling}
      />

      {/* Up Next (max 3) */}
      {data.upNext.length > 0 && (
        <UpNextList items={data.upNext} />
      )}

      {/* Right column / below fold: Signals + Momentum + Completed */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="space-y-4">
          <SignalsPanel signals={data.signals as SignalsData} />
        </div>
        <div className="space-y-4">
          <MomentumStrip momentum={data.momentum} />
          <JoyStrip />
          <CompletedTodayCard
            tasksDone={data.completedToday.tasksDone}
            messagesSent={data.completedToday.messagesSent}
            quotesSent={data.completedToday.quotesSent}
          />
        </div>
      </div>
    </div>
  )
})

