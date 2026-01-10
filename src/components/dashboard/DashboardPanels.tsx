'use client'

/**
 * Dashboard Panels Wrapper
 * 
 * Client component wrapper for dashboard panels with feature flag support.
 * Uses dynamic imports to avoid build issues when DISABLE_DASHBOARD_SIGNALS=true
 */

import dynamic from 'next/dynamic'
import { Card } from '@/components/ui/card'
import { useEffect, useState } from 'react'

// Dynamic imports with SSR disabled to avoid build issues
const YourFocusNow = dynamic(
  () => import('./YourFocusNow').then(mod => ({ default: mod.YourFocusNow })),
  { ssr: false }
)

const SignalsPanel = dynamic(
  () => import('./SignalsPanel').then(mod => ({ default: mod.SignalsPanel })),
  { ssr: false }
)

export function DashboardPanels() {
  const [disabled, setDisabled] = useState(false)

  useEffect(() => {
    // Check feature flag from server-side env (passed via data attribute or window)
    // For now, we'll check if the components fail to load
    const checkFlag = () => {
      // Check if NEXT_PUBLIC_DISABLE_DASHBOARD_SIGNALS is set
      const envFlag = process.env.NEXT_PUBLIC_DISABLE_DASHBOARD_SIGNALS === 'true'
      setDisabled(envFlag)
    }
    checkFlag()
  }, [])

  if (disabled) {
    return (
      <Card className="p-6">
        <h3 className="text-heading text-slate-900 mb-2 font-bold tracking-tight">
          Dashboard upgrade in progress
        </h3>
        <p className="text-body text-slate-700 font-medium">
          This panel is temporarily disabled while we deploy reliability fixes.
        </p>
      </Card>
    )
  }

  return <YourFocusNow />
}

export function DashboardSignalsPanel() {
  const [disabled, setDisabled] = useState(false)

  useEffect(() => {
    const checkFlag = () => {
      const envFlag = process.env.NEXT_PUBLIC_DISABLE_DASHBOARD_SIGNALS === 'true'
      setDisabled(envFlag)
    }
    checkFlag()
  }, [])

  if (disabled) {
    return (
      <Card className="p-6">
        <h3 className="text-heading text-slate-900 mb-2 font-bold tracking-tight">
          Dashboard upgrade in progress
        </h3>
        <p className="text-body text-slate-700 font-medium">
          This panel is temporarily disabled while we deploy reliability fixes.
        </p>
      </Card>
    )
  }

  return <SignalsPanel />
}
