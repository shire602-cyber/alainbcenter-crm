'use client'

/**
 * REPLY SUCCESS BANNER
 * 
 * Shows after sending a reply with option to mark task complete.
 * "✅ Reply sent — mark this task complete?"
 * Buttons: [Mark Complete] [Keep Open]
 */

import { useState } from 'react'
import { CheckCircle2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

interface ReplySuccessBannerProps {
  onMarkComplete?: () => void
  onKeepOpen?: () => void
}

export function ReplySuccessBanner({ onMarkComplete, onKeepOpen }: ReplySuccessBannerProps) {
  const [visible, setVisible] = useState(true)

  if (!visible) return null

  function handleMarkComplete() {
    setVisible(false)
    if (onMarkComplete) onMarkComplete()
  }

  function handleKeepOpen() {
    setVisible(false)
    if (onKeepOpen) onKeepOpen()
  }

  return (
    <div className={cn(
      "bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800",
      "rounded-xl p-4 mb-4",
      "animate-in slide-in-from-top-4 fade-in duration-300"
    )}>
      <div className="flex items-start gap-3">
        <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-green-900 dark:text-green-100 mb-2">
            ✅ Reply sent — mark this task complete?
          </p>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={handleMarkComplete}
              className="bg-green-600 hover:bg-green-700 text-white h-8 text-xs"
            >
              Mark Complete
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleKeepOpen}
              className="h-8 text-xs border-green-300 dark:border-green-700 text-green-700 dark:text-green-300"
            >
              Keep Open
            </Button>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setVisible(false)}
          className="h-6 w-6 p-0 flex-shrink-0"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

