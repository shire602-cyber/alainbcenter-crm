'use client'

/**
 * MOMENTUM STRIP
 * 
 * Lightweight metrics row showing positive progress.
 * Calm, positive tone with animations and micro copy.
 */

import { useState, useEffect, useRef } from 'react'
import { CheckCircle2, MessageSquare, FileText, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'

interface MomentumMetrics {
  tasksCompleted?: number
  messagesSent?: number
  quotesSent?: number
  revenueClosed?: number
}

function AnimatedNumber({ value, previousValue }: { value: number; previousValue: number }) {
  const [displayValue, setDisplayValue] = useState(previousValue)
  const [animating, setAnimating] = useState(false)

  useEffect(() => {
    if (value !== previousValue) {
      setAnimating(true)
      const start = previousValue
      const end = value
      const duration = 300
      const startTime = Date.now()

      const animate = () => {
        const now = Date.now()
        const elapsed = now - startTime
        const progress = Math.min(elapsed / duration, 1)
        const current = Math.floor(start + (end - start) * progress)
        setDisplayValue(current)

        if (progress < 1) {
          requestAnimationFrame(animate)
        } else {
          setAnimating(false)
        }
      }

      requestAnimationFrame(animate)
    }
  }, [value, previousValue])

  return (
    <span className={cn(
      "transition-all duration-300",
      animating && "scale-110 font-semibold"
    )}>
      {displayValue}
    </span>
  )
}

export function MomentumStrip() {
  const [metrics, setMetrics] = useState<MomentumMetrics>({})
  const [previousMetrics, setPreviousMetrics] = useState<MomentumMetrics>({})
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
        const newMetrics = data.metrics || {}
        setPreviousMetrics(metrics)
        setMetrics(newMetrics)
      }
    } catch (error) {
      console.error('Failed to load momentum metrics:', error)
    } finally {
      setLoading(false)
    }
  }

  function getMomentumCopy(): string {
    const total = (metrics.tasksCompleted || 0) + (metrics.messagesSent || 0) + (metrics.quotesSent || 0)
    if (total === 0) return ''
    if (total >= 10) return "You're on top of things"
    if (total >= 5) return "Good progress today"
    return "Building momentum"
  }

  if (loading) {
    return (
      <Card className="p-4 rounded-xl border border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-8 w-20 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
          ))}
        </div>
      </Card>
    )
  }

  const hasMetrics = (metrics.tasksCompleted || 0) > 0 || 
                     (metrics.messagesSent || 0) > 0 || 
                     (metrics.quotesSent || 0) > 0

  if (!hasMetrics) {
    return null
  }

  const momentumCopy = getMomentumCopy()

  return (
    <Card className={cn(
      "p-4 rounded-xl border border-slate-200 dark:border-slate-800",
      "bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/10 dark:to-emerald-900/5",
      "animate-in fade-in slide-in-from-bottom-2 duration-200"
    )}>
      <div className="flex items-center gap-6 flex-wrap">
        {(metrics.tasksCompleted || 0) > 0 && (
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
            <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
              <AnimatedNumber 
                value={metrics.tasksCompleted || 0} 
                previousValue={previousMetrics.tasksCompleted || 0} 
              />{' '}
              task{(metrics.tasksCompleted || 0) !== 1 ? 's' : ''} completed
            </span>
          </div>
        )}
        {(metrics.messagesSent || 0) > 0 && (
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
              <AnimatedNumber 
                value={metrics.messagesSent || 0} 
                previousValue={previousMetrics.messagesSent || 0} 
              />{' '}
              message{(metrics.messagesSent || 0) !== 1 ? 's' : ''} sent
            </span>
          </div>
        )}
        {(metrics.quotesSent || 0) > 0 && (
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-purple-600 dark:text-purple-400" />
            <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
              <AnimatedNumber 
                value={metrics.quotesSent || 0} 
                previousValue={previousMetrics.quotesSent || 0} 
              />{' '}
              quote{(metrics.quotesSent || 0) !== 1 ? 's' : ''} sent
            </span>
          </div>
        )}
        {(metrics.revenueClosed || 0) > 0 && (
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-green-600 dark:text-green-400" />
            <span className="text-sm font-medium text-green-700 dark:text-green-300">
              AED {(metrics.revenueClosed || 0).toLocaleString()} closed
            </span>
          </div>
        )}
        {momentumCopy && (
          <div className="ml-auto">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-400 italic">
              {momentumCopy}
            </span>
          </div>
        )}
      </div>
    </Card>
  )
}

