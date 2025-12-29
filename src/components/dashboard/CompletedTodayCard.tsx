'use client'

/**
 * COMPLETED TODAY CARD
 * 
 * Shows 2-3 metrics with subtle celebration copy (no confetti)
 * e.g. "Nice — 7 tasks done today"
 */

import { memo } from 'react'
import { CheckCircle2, MessageSquare, FileText, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'

interface CompletedTodayCardProps {
  tasksDone: number
  messagesSent: number
  quotesSent: number
}

export const CompletedTodayCard = memo(function CompletedTodayCard({
  tasksDone,
  messagesSent,
  quotesSent,
}: CompletedTodayCardProps) {
  const hasActivity = tasksDone > 0 || messagesSent > 0 || quotesSent > 0

  if (!hasActivity) {
    return (
      <Card className="card-premium p-4">
        <div className="flex items-center gap-2 text-meta muted-text">
          <Sparkles className="h-4 w-4" />
          <span>Your completed work will appear here</span>
        </div>
      </Card>
    )
  }

  const total = tasksDone + messagesSent + quotesSent
  let celebrationText = ''
  if (total >= 10) {
    celebrationText = 'Great progress today!'
  } else if (total >= 5) {
    celebrationText = 'Nice work today'
  } else {
    celebrationText = 'Good start'
  }

  return (
    <Card className="card-premium p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-body font-semibold text-slate-900 dark:text-slate-100">
          Completed Today
        </h4>
        <span className="text-meta muted-text">{celebrationText}</span>
      </div>
      <div className="flex items-center gap-4 flex-wrap">
        {tasksDone > 0 && (
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
            <span className="text-body font-medium text-slate-900 dark:text-slate-100">
              {tasksDone}
            </span>
            <span className="text-meta muted-text">tasks</span>
          </div>
        )}
        {messagesSent > 0 && (
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <span className="text-body font-medium text-slate-900 dark:text-slate-100">
              {messagesSent}
            </span>
            <span className="text-meta muted-text">replies</span>
          </div>
        )}
        {quotesSent > 0 && (
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-purple-600 dark:text-purple-400" />
            <span className="text-body font-medium text-slate-900 dark:text-slate-100">
              {quotesSent}
            </span>
            <span className="text-meta muted-text">quotes</span>
          </div>
        )}
      </div>
    </Card>
  )
})

