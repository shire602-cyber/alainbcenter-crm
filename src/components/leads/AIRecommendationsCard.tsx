'use client'

/**
 * AI Recommendations Card
 * 
 * Displays AI score, summary, and next best action task
 * Replaces/upgrades the existing Recommended section
 */

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Flame, TrendingUp, Snowflake, CheckCircle2, RefreshCw, Sparkles } from 'lucide-react'
import { format, formatDistanceToNow } from 'date-fns'
import { cn } from '@/lib/utils'
import { getAiScoreCategory } from '@/lib/constants'

interface AIRecommendationsCardProps {
  leadId: number
  lead: {
    aiScore: number | null
    aiNotes: string | null
    stage?: string | null
  }
  task?: {
    id: number
    title: string
    dueAt: string | Date | null
    status: string
  } | null
  onRescore?: () => void
  onTaskDone?: () => void
}

export function AIRecommendationsCard({
  leadId,
  lead,
  task,
  onRescore,
  onTaskDone,
}: AIRecommendationsCardProps) {
  const [rescoring, setRescoring] = useState(false)
  const [markingDone, setMarkingDone] = useState(false)

  const scoreCategory = getAiScoreCategory(lead.aiScore)
  const hasOpenTask = task && task.status === 'OPEN'

  const handleRescore = async () => {
    try {
      setRescoring(true)
      const res = await fetch('/api/ai/lead-score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId, trigger: 'manual' }),
      })

      if (!res.ok) {
        throw new Error('Failed to rescore lead')
      }

      // Reload page to show updated score
      if (onRescore) {
        onRescore()
      } else {
        window.location.reload()
      }
    } catch (error) {
      console.error('Error rescoring lead:', error)
      alert('Failed to rescore lead. Please try again.')
    } finally {
      setRescoring(false)
    }
  }

  const handleMarkDone = async () => {
    if (!task) return

    try {
      setMarkingDone(true)
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'DONE', doneAt: 'now' }),
      })

      if (!res.ok) {
        throw new Error('Failed to mark task as done')
      }

      // Reload page to show updated task
      if (onTaskDone) {
        onTaskDone()
      } else {
        window.location.reload()
      }
    } catch (error) {
      console.error('Error marking task as done:', error)
      alert('Failed to mark task as done. Please try again.')
    } finally {
      setMarkingDone(false)
    }
  }

  return (
    <Card className="rounded-xl border-slate-200">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            AI Recommendations
          </CardTitle>
          {lead.aiScore !== null && (
            <Badge
              variant={scoreCategory}
              className="flex items-center gap-1 text-xs font-medium"
            >
              {scoreCategory === 'hot' && <Flame className="h-3 w-3" />}
              {scoreCategory === 'warm' && <TrendingUp className="h-3 w-3" />}
              {scoreCategory === 'cold' && <Snowflake className="h-3 w-3" />}
              <span className="capitalize">{scoreCategory}</span>
              <span className="text-xs opacity-75">({lead.aiScore})</span>
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary */}
        {lead.aiNotes ? (
          <div>
            <p className="text-sm text-slate-700 leading-relaxed">
              {lead.aiNotes}
            </p>
          </div>
        ) : (
          <p className="text-sm text-slate-500 italic">
            No AI summary available. Click "Rescore" to generate recommendations.
          </p>
        )}

        {/* Next Best Action Task */}
        {hasOpenTask && (
          <div className="pt-3 border-t border-slate-200">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-slate-600 mb-1">
                  Next Best Action
                </p>
                <p className="text-sm font-medium text-slate-900 mb-1">
                  {task.title}
                </p>
                {task.dueAt && (
                  <p className="text-xs text-slate-500">
                    Due {formatDistanceToNow(new Date(task.dueAt), { addSuffix: true })}
                    {' '}
                    ({format(new Date(task.dueAt), 'MMM d, h:mm a')})
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleMarkDone}
                  disabled={markingDone}
                  className="h-8 text-xs"
                >
                  {markingDone ? (
                    <>
                      <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                      Marking...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Mark done
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 pt-2 border-t border-slate-200">
          <Button
            size="sm"
            variant="outline"
            onClick={handleRescore}
            disabled={rescoring}
            className="h-8 text-xs flex-1"
          >
            {rescoring ? (
              <>
                <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                Rescoring...
              </>
            ) : (
              <>
                <RefreshCw className="h-3 w-3 mr-1" />
                Rescore
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

