'use client'

/**
 * Total Expected Revenue Widget
 * Shows sum of all expected revenue from active leads
 */

import { BentoCard } from './BentoCard'
import { Badge } from '@/components/ui/badge'
import { DollarSign, TrendingUp, Loader2 } from 'lucide-react'
import { useState, useEffect } from 'react'
import Link from 'next/link'

interface ForecastMetrics {
  totalExpectedRevenue: number
  totalActiveLeads: number
}

export function ForecastRevenueWidget() {
  const [metrics, setMetrics] = useState<ForecastMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadMetrics()
  }, [])

  async function loadMetrics() {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch('/api/analytics/forecast-metrics')
      if (res.ok) {
        const data = await res.json()
        setMetrics({
          totalExpectedRevenue: data.totalExpectedRevenue || 0,
          totalActiveLeads: data.totalActiveLeads || 0,
        })
      } else {
        setError('Failed to load metrics')
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load metrics')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <BentoCard title="Expected Revenue">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </BentoCard>
    )
  }

  if (error || !metrics) {
    return (
      <BentoCard title="Expected Revenue">
        <div className="text-center py-4 text-sm text-muted-foreground">
          {error || 'No data available'}
        </div>
      </BentoCard>
    )
  }

  const formattedRevenue = metrics.totalExpectedRevenue.toLocaleString()

  return (
    <BentoCard
      title="Expected Revenue"
      action={
        <Link href="/leads" className="text-xs text-slate-600 hover:text-primary transition-colors">
          View leads →
        </Link>
      }
    >
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-green-100">
            <DollarSign className="h-5 w-5 text-green-600" />
          </div>
          <div className="flex-1">
            <div className="text-2xl font-bold text-slate-900">
              {formattedRevenue} <span className="text-sm font-normal text-slate-500">AED</span>
            </div>
            <div className="text-xs text-slate-500 mt-0.5">
              From {metrics.totalActiveLeads} active leads
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 pt-2 border-t border-slate-200">
          <TrendingUp className="h-4 w-4 text-green-600" />
          <span className="text-xs text-slate-600">
            Weighted by deal probability
          </span>
        </div>
      </div>
    </BentoCard>
  )
}

