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

  // Show best metric first
  const metrics = [
    { value: tasksDone, label: 'tasks', icon: CheckCircle2, color: 'green' },
    { value: messagesSent, label: 'replies', icon: MessageSquare, color: 'blue' },
    { value: quotesSent, label: 'quotes', icon: FileText, color: 'purple' },
  ].filter(m => m.value > 0).sort((a, b) => b.value - a.value)

  return (
    <Card className="card-premium inset-card bg-gradient-to-br from-green-50/50 to-blue-50/50 dark:from-green-950/10 dark:to-blue-950/10 border-green-200/40 dark:border-green-800/40">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-h2 font-semibold text-slate-900 dark:text-slate-100">
          Completed Today
        </h4>
        <span className="text-meta muted-text font-medium">{celebrationText}</span>
      </div>
      <div className="flex items-center gap-4 flex-wrap">
        {metrics.map((metric, idx) => {
          const Icon = metric.icon
          return (
            <div key={idx} className="flex items-center gap-2">
              <Icon className={cn(
                "h-4 w-4",
                metric.color === 'green' && "text-green-600 dark:text-green-400",
                metric.color === 'blue' && "text-blue-600 dark:text-blue-400",
                metric.color === 'purple' && "text-purple-600 dark:text-purple-400"
              )} />
              <span className="text-body font-semibold text-slate-900 dark:text-slate-100">
                {metric.value}
              </span>
              <span className="text-meta muted-text">{metric.label}</span>
            </div>
          )
        })}
      </div>
    </Card>
  )
})

