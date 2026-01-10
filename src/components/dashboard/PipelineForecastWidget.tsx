'use client'

/**
 * Pipeline by Stage Forecast Widget
 * Shows count and expected revenue by stage
 */

import { BentoCard } from './BentoCard'
import { Badge } from '@/components/ui/badge'
import { TrendingUp, Loader2, ArrowRight } from 'lucide-react'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

interface PipelineStage {
  stage: string
  count: number
  expectedRevenue: number
}

const STAGE_LABELS: Record<string, string> = {
  'NEW': 'New',
  'CONTACTED': 'Contacted',
  'ENGAGED': 'Engaged',
  'QUALIFIED': 'Qualified',
  'PROPOSAL_SENT': 'Proposal',
  'IN_PROGRESS': 'In Progress',
  'ON_HOLD': 'On Hold',
}

const STAGE_COLORS: Record<string, string> = {
  'NEW': 'bg-gray-100 text-gray-800',
  'CONTACTED': 'bg-blue-100 text-blue-800',
  'ENGAGED': 'bg-purple-100 text-purple-800',
  'QUALIFIED': 'bg-yellow-100 text-yellow-800',
  'PROPOSAL_SENT': 'bg-orange-100 text-orange-800',
  'IN_PROGRESS': 'bg-indigo-100 text-indigo-800',
  'ON_HOLD': 'bg-slate-100 text-slate-800',
}

export function PipelineForecastWidget() {
  const [pipeline, setPipeline] = useState<PipelineStage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadPipeline()
  }, [])

  async function loadPipeline() {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch('/api/analytics/forecast-metrics')
      if (res.ok) {
        const data = await res.json()
        setPipeline(data.pipelineByStage || [])
      } else {
        setError('Failed to load pipeline')
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load pipeline')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <BentoCard title="Pipeline Forecast" colSpan={2}>
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </BentoCard>
    )
  }

  if (error || pipeline.length === 0) {
    return (
      <BentoCard title="Pipeline Forecast" colSpan={2}>
        <div className="text-center py-4 text-sm text-muted-foreground">
          {error || 'No pipeline data available'}
        </div>
      </BentoCard>
    )
  }

  const totalRevenue = pipeline.reduce((sum, stage) => sum + stage.expectedRevenue, 0)

  return (
    <BentoCard
      title="Pipeline Forecast"
      colSpan={2}
      action={
        <Link href="/leads" className="text-xs text-slate-600 hover:text-primary transition-colors">
          View all →
        </Link>
      }
    >
      <div className="space-y-2">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {pipeline.map((stage) => {
            const label = STAGE_LABELS[stage.stage] || stage.stage
            const color = STAGE_COLORS[stage.stage] || 'bg-slate-100 text-slate-800'
            const revenuePercent = totalRevenue > 0 ? (stage.expectedRevenue / totalRevenue) * 100 : 0

            return (
              <Link
                key={stage.stage}
                href={`/leads?stage=${stage.stage}`}
                className="p-3 rounded-lg border border-slate-200 hover:bg-slate-100:bg-slate-800/50 hover:border-slate-300:border-slate-700 transition-all group"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-slate-600">{label}</span>
                  <Badge variant="outline" className="text-xs">
                    {stage.count}
                  </Badge>
                </div>
                <div className="text-lg font-semibold text-slate-900 group-hover:text-primary transition-colors">
                  {stage.expectedRevenue.toLocaleString()} <span className="text-xs font-normal text-slate-500">AED</span>
                </div>
                <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden mt-2">
                  <div
                    className={cn('h-full transition-all duration-300', color)}
                    style={{ width: `${revenuePercent}%` }}
                  />
                </div>
              </Link>
            )
          })}
        </div>
        <div className="flex items-center justify-between pt-2 border-t border-slate-200">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-slate-500" />
            <span className="text-xs text-slate-600">Total Pipeline Value</span>
          </div>
          <span className="text-sm font-semibold text-slate-900">
            {totalRevenue.toLocaleString()} AED
          </span>
        </div>
      </div>
    </BentoCard>
  )
}

