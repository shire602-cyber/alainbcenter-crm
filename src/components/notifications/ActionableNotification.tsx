'use client'

/**
 * ACTIONABLE NOTIFICATION COMPONENT
 * Notifications must have CTA, be deduplicated, snoozable, and expire automatically
 */

import { useState } from 'react'
import { X, Clock, AlertCircle, MessageSquare, FileText, CheckCircle2, BellOff } from 'lucide-react'
import { format, formatDistanceToNow } from 'date-fns'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'

interface ActionableNotification {
  id: number
  type: 'sla_breach_imminent' | 'customer_reply' | 'quote_ready' | 'deadline_today'
  title: string
  message: string
  leadId?: number
  conversationId?: number
  actionUrl: string
  actionLabel: string
  createdAt: string
  isRead: boolean
}

interface ActionableNotificationProps {
  notification: ActionableNotification
  onDismiss: (id: number) => void
  onSnooze: (id: number, minutes: number) => void
  onAction: (url: string) => void
}

export function ActionableNotificationItem({
  notification,
  onDismiss,
  onSnooze,
  onAction,
}: ActionableNotificationProps) {
  const [snoozed, setSnoozed] = useState(false)

  function getIcon() {
    switch (notification.type) {
      case 'sla_breach_imminent':
        return <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
      case 'customer_reply':
        return <MessageSquare className="h-5 w-5 text-blue-600 dark:text-blue-400" />
      case 'quote_ready':
        return <FileText className="h-5 w-5 text-green-600 dark:text-green-400" />
      case 'deadline_today':
        return <Clock className="h-5 w-5 text-orange-600 dark:text-orange-400" />
      default:
        return <AlertCircle className="h-5 w-5 text-slate-400" />
    }
  }

  function getColorClass() {
    switch (notification.type) {
      case 'sla_breach_imminent':
        return 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20'
      case 'customer_reply':
        return 'border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20'
      case 'quote_ready':
        return 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20'
      case 'deadline_today':
        return 'border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-900/20'
      default:
        return 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50'
    }
  }

  if (snoozed) {
    return null
  }

  return (
    <Card className={cn("p-4 rounded-xl border-2 transition-all hover:shadow-md", getColorClass())}>
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5">
          {getIcon()}
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1">
                {notification.title}
              </h4>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                {notification.message}
              </p>
            </div>
            <button
              onClick={() => onDismiss(notification.id)}
              className="flex-shrink-0 p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            >
              <X className="h-4 w-4 text-slate-400" />
            </button>
          </div>

          <div className="flex items-center gap-2 mt-3">
            <Button
              size="sm"
              onClick={() => {
                onAction(notification.actionUrl)
                onDismiss(notification.id)
              }}
              className="rounded-lg flex-1"
            >
              {notification.actionLabel}
            </Button>
            
            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  onSnooze(notification.id, 30)
                  setSnoozed(true)
                }}
                className="p-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                title="Snooze 30 min"
              >
                <Clock className="h-4 w-4 text-slate-400" />
              </button>
              <button
                onClick={() => {
                  onSnooze(notification.id, 1440) // 24 hours
                  setSnoozed(true)
                }}
                className="p-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                title="Snooze 24h"
              >
                <BellOff className="h-4 w-4 text-slate-400" />
              </button>
            </div>
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
            {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
          </p>
        </div>
      </div>
    </Card>
  )
}

