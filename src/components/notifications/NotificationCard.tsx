'use client'

/**
 * NOTIFICATION CARD - PREMIUM ACTIONABLE
 * 
 * Beautiful, actionable notification card with:
 * - Clear title + 1 sentence context
 * - ONE primary CTA button
 * - Snooze dropdown (3 options)
 * - Dedupe badge count "(x3)"
 */

import { useState, memo } from 'react'
import { MessageSquare, FileText, AlertCircle, Clock, ChevronDown, X } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useRouter } from 'next/navigation'

interface NotificationCardProps {
  notification: {
    id: number
    type: string
    title: string
    message: string
    leadId?: number
    conversationId?: number
    actionUrl: string
    actionLabel: string
    createdAt: string
    isRead: boolean
    count?: number
  }
  onDismiss: (id: number) => void
  onSnooze: (id: number, minutes: number) => void
  onAction: (url: string) => void
}

export const NotificationCard = memo(function NotificationCard({
  notification,
  onDismiss,
  onSnooze,
  onAction,
}: NotificationCardProps) {
  const [snoozed, setSnoozed] = useState(false)
  const router = useRouter()

  function getIcon() {
    switch (notification.type) {
      case 'sla_breach_imminent':
        return <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
      case 'customer_reply':
        return <MessageSquare className="h-4 w-4 text-blue-600 dark:text-blue-400" />
      case 'quote_ready':
        return <FileText className="h-4 w-4 text-green-600 dark:text-green-400" />
      case 'deadline_today':
        return <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
      default:
        return <AlertCircle className="h-4 w-4 text-slate-500" />
    }
  }

  function handleSnooze(minutes: number) {
    setSnoozed(true)
    onSnooze(notification.id, minutes)
  }

  function handleAction() {
    onAction(notification.actionUrl)
    router.push(notification.actionUrl)
  }

  if (snoozed) {
    return (
      <Card className="card-premium p-4 opacity-60">
        <div className="flex items-center gap-2 text-meta muted-text">
          <Clock className="h-4 w-4" />
          <span>Snoozed</span>
        </div>
      </Card>
    )
  }

  const isUrgent = notification.type === 'sla_breach_imminent'

  return (
    <Card className={cn(
      "card-premium p-5",
      "hover:-translate-y-0.5 transition-all duration-200"
    )}>
      <div className="flex items-start gap-4">
        {/* Icon */}
        <div className={cn(
          "flex-shrink-0 w-10 h-10 rounded-[12px] flex items-center justify-center",
          isUrgent 
            ? "bg-red-50 dark:bg-red-900/20"
            : "bg-slate-100 dark:bg-slate-800"
        )}>
          {getIcon()}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3 mb-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1.5">
                <h4 className="text-body font-semibold text-slate-900 dark:text-slate-100">
                  {notification.title}
                </h4>
                {notification.count && notification.count > 1 && (
                  <Badge className="chip bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400">
                    (x{notification.count})
                  </Badge>
                )}
                {isUrgent && (
                  <div className="flex items-center gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
                    <span className="text-meta text-red-600 dark:text-red-400">Urgent</span>
                  </div>
                )}
              </div>
              <p className="text-body muted-text line-clamp-2">
                {notification.message}
              </p>
            </div>

            <button
              onClick={() => onDismiss(notification.id)}
              className="flex-shrink-0 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title="Dismiss"
            >
              <X className="h-4 w-4 text-slate-400" />
            </button>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between mt-4">
            <span className="text-meta muted-text">
              {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
            </span>
            <div className="flex items-center gap-2">
              <Button
                onClick={handleAction}
                size="sm"
                className={cn(
                  "h-9 px-4 rounded-[12px] font-semibold",
                  "bg-primary hover:bg-primary/90 text-primary-foreground",
                  "transition-all duration-200 hover:shadow-md active:scale-95"
                )}
              >
                {notification.actionLabel}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="outline" 
                    size="icon" 
                    className="h-9 w-9 rounded-[12px] border-slate-200/60 dark:border-slate-800/60"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="rounded-[12px]">
                  <DropdownMenuItem onClick={() => handleSnooze(30)}>
                    Snooze 30m
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleSnooze(1440)}>
                    Snooze 24h
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onDismiss(notification.id)}>
                    Mark as read
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </div>
    </Card>
  )
})
