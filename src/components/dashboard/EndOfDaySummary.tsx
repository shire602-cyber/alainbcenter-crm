'use client'

/**
 * END-OF-DAY SUMMARY
 * Shows completed actions and potential revenue created
 * Mission control summary view
 */

import { useState, useEffect } from 'react'
import { CheckCircle2, DollarSign, TrendingUp, Target, Calendar, Sparkles } from 'lucide-react'
import { format } from 'date-fns'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

interface EndOfDaySummaryData {
  tasksCompleted: number
  messagesSent: number
  quotesSent: number
  revenueCreated?: number
  potentialRevenue?: number
  topActions: Array<{
    type: string
    label: string
    count: number
  }>
}

export function EndOfDaySummary() {
  const [summary, setSummary] = useState<EndOfDaySummaryData | null>(null)
  const [loading, setLoading] = useState(true)
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    loadSummary()
  }, [])

  async function loadSummary() {
    try {
      const res = await fetch('/api/dashboard/wins-today')
      if (res.ok) {
        const data = await res.json()
        const metrics = data.metrics || {}
        
        // Calculate potential revenue from completed quotes
        const potentialRevenue = metrics.quotesSent 
          ? metrics.quotesSent * 5000 // Estimate 5k per quote
          : 0

        setSummary({
          tasksCompleted: metrics.tasksCompleted || 0,
          messagesSent: metrics.messagesSent || 0,
          quotesSent: metrics.quotesSent || 0,
          revenueCreated: metrics.revenueClosed || 0,
          potentialRevenue,
          topActions: [
            { type: 'task', label: 'Tasks Completed', count: metrics.tasksCompleted || 0 },
            { type: 'message', label: 'Messages Sent', count: metrics.messagesSent || 0 },
            { type: 'quote', label: 'Quotes Delivered', count: metrics.quotesSent || 0 },
          ].filter(a => a.count > 0),
        })
      }
    } catch (error) {
      console.error('Failed to load summary:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading || !summary) {
    return null
  }

  const totalActions = summary.tasksCompleted + summary.messagesSent + summary.quotesSent
  const hasImpact = totalActions > 0

  if (!hasImpact) {
    return null
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className="w-full rounded-xl h-12 border-2 border-slate-300 dark:border-slate-700 hover:border-primary hover:bg-primary/5 transition-all"
        >
          <div className="flex items-center gap-3 w-full">
            <div className="w-10 h-10 rounded-lg bg-primary/10 dark:bg-primary/20 flex items-center justify-center">
              <Target className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 text-left">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                End-of-Day Summary
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {totalActions} action{totalActions !== 1 ? 's' : ''} completed today
              </p>
            </div>
            <TrendingUp className="h-5 w-5 text-primary" />
          </div>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">Today's Mission Summary</DialogTitle>
          <DialogDescription>
            {format(new Date(), 'EEEE, MMMM d, yyyy')}
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6 mt-4">
          {/* Completed Actions */}
          <div>
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              Completed Actions
            </h3>
            <div className="grid grid-cols-3 gap-3">
              {summary.topActions.map((action, idx) => (
                <Card key={idx} className="p-4 text-center border-2 border-slate-200 dark:border-slate-800">
                  <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-1">
                    {action.count}
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    {action.label}
                  </p>
                </Card>
              ))}
            </div>
          </div>

          {/* Revenue Impact */}
          {(summary.revenueCreated || summary.potentialRevenue) && (
            <div>
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-green-600" />
                Revenue Impact
              </h3>
              <div className="grid grid-cols-2 gap-3">
                {summary.revenueCreated && summary.revenueCreated > 0 && (
                  <Card className="p-5 border-2 border-green-200 dark:border-green-800 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/10">
                    <p className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
                      Revenue Created
                    </p>
                    <p className="text-3xl font-bold text-green-700 dark:text-green-300">
                      AED {summary.revenueCreated.toLocaleString()}
                    </p>
                  </Card>
                )}
                {summary.potentialRevenue && summary.potentialRevenue > 0 && (
                  <Card className="p-5 border-2 border-blue-200 dark:border-blue-800 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/10">
                    <p className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
                      Potential Revenue
                    </p>
                    <p className="text-3xl font-bold text-blue-700 dark:text-blue-300">
                      AED {summary.potentialRevenue.toLocaleString()}
                    </p>
                  </Card>
                )}
              </div>
            </div>
          )}

          {/* Positive Reinforcement */}
          <Card className="p-6 border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10 dark:from-primary/10 dark:to-primary/5">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
                <Sparkles className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1">
                  Great work today! 🎉
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  You've completed {totalActions} action{totalActions !== 1 ? 's' : ''} and moved the needle forward.
                </p>
              </div>
            </div>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  )
}

