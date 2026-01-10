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
      setLoading(true)
      const res = await fetch('/api/dashboard/command-center')
      if (res.ok) {
        const commandData = await res.json()
        setData(commandData)
      } else {
        console.error('Failed to load command center data: HTTP', res.status)
        // Set default empty data structure on error
        setData({
          focusNow: null,
          upNext: [],
          signals: {
            renewals: [],
            waiting: [],
            alerts: [],
            counts: { renewalsTotal: 0, waitingTotal: 0, alertsTotal: 0 },
          },
          momentum: {
            repliesToday: 0,
            quotesToday: 0,
            renewalsNext7Days: 0,
            revenuePotentialToday: null,
          },
          completedToday: {
            tasksDone: 0,
            messagesSent: 0,
            quotesSent: 0,
          },
          generatedAt: new Date().toISOString(),
        })
      }
    } catch (error) {
      console.error('Failed to load command center data:', error)
      // Set default empty data structure on error
      setData({
        focusNow: null,
        upNext: [],
        signals: {
          renewals: [],
          waiting: [],
          alerts: [],
          counts: { renewalsTotal: 0, waitingTotal: 0, alertsTotal: 0 },
        },
        momentum: {
          repliesToday: 0,
          quotesToday: 0,
          renewalsNext7Days: 0,
          revenuePotentialToday: null,
        },
        completedToday: {
          tasksDone: 0,
          messagesSent: 0,
          quotesSent: 0,
        },
        generatedAt: new Date().toISOString(),
      })
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

  // Ensure data exists (should always be set by loadData)
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

  // Check if dashboard is truly empty (no items, no activity)
  const hasAnyData = data.focusNow || 
    (data.upNext && data.upNext.length > 0) ||
    (data.signals && (
      (data.signals.renewals && data.signals.renewals.length > 0) ||
      (data.signals.waiting && data.signals.waiting.length > 0) ||
      (data.signals.alerts && data.signals.alerts.length > 0)
    )) ||
    (data.momentum && (
      data.momentum.repliesToday > 0 ||
      data.momentum.quotesToday > 0 ||
      data.momentum.renewalsNext7Days > 0
    )) ||
    (data.completedToday && (
      data.completedToday.tasksDone > 0 ||
      data.completedToday.messagesSent > 0 ||
      data.completedToday.quotesSent > 0
    ))

  if (!hasAnyData) {
    return (
      <div className="space-y-4">
        <EmptyState
          icon={BarChart3}
          title="Welcome to your Dashboard"
          description="Your dashboard will populate as you create leads, send messages, and complete tasks. Get started by creating your first lead!"
          action={
            <Button onClick={() => window.location.href = '/leads?action=create'} variant="default">
              Create First Lead
            </Button>
          }
        />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Hero: Focus Now */}
      {data.focusNow && (
        <FocusHeroCard
          item={data.focusNow}
          onRefresh={manualRefresh}
          isRefreshing={isPolling}
        />
      )}

      {/* Up Next (max 3) */}
      {data.upNext && data.upNext.length > 0 && (
        <UpNextList items={data.upNext} />
      )}

      {/* Right column / below fold: Signals + Momentum + Completed */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="space-y-4">
          {data.signals && <SignalsPanel signals={data.signals as SignalsData} />}
        </div>
        <div className="space-y-4">
          {data.momentum && <MomentumStrip momentum={data.momentum} />}
          <JoyStrip />
          {data.completedToday && (
            <CompletedTodayCard
              tasksDone={data.completedToday.tasksDone}
              messagesSent={data.completedToday.messagesSent}
              quotesSent={data.completedToday.quotesSent}
            />
          )}
        </div>
      </div>
    </div>
  )
})

