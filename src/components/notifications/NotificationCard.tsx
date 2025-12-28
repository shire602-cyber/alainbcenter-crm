'use client'

/**
 * NOTIFICATION CARD
 * 
 * Reusable notification card component with:
 * - Single primary CTA button
 * - Snooze menu (30m, 24h)
 * - Visual confirmation for snoozed state
 * - Deduplication count badge
 */

import { useState } from 'react'
import { MessageSquare, FileText, AlertCircle, Clock, MoreVertical, CheckCircle2 } from 'lucide-react'
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
    count?: number // For deduplication
  }
  onDismiss: (id: number) => void
  onSnooze: (id: number, minutes: number) => void
  onAction: (url: string) => void
}

export function NotificationCard({
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
      case 'customer_reply':
        return <MessageSquare className="h-4 w-4" />
      case 'quote_ready':
        return <FileText className="h-4 w-4" />
      case 'deadline_today':
        return <AlertCircle className="h-4 w-4" />
      default:
        return <AlertCircle className="h-4 w-4" />
    }
  }

  function getPrimaryAction() {
    if (notification.type === 'sla_breach_imminent' || notification.type === 'customer_reply') {
      return 'Reply'
    }
    if (notification.type === 'quote_ready') {
      return 'Create Quote'
    }
    return 'Open Lead'
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
      <Card className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 opacity-60">
        <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          <Clock className="h-4 w-4" />
          <span>Snoozed</span>
        </div>
      </Card>
    )
  }

  return (
    <Card className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:shadow-md transition-smooth">
      <div className="flex items-start gap-3">
        <div className={cn(
          "flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center",
          notification.type === 'sla_breach_imminent' 
            ? "bg-red-100 dark:bg-red-900/20"
            : notification.type === 'customer_reply'
            ? "bg-blue-100 dark:bg-blue-900/20"
            : "bg-slate-100 dark:bg-slate-800"
        )}>
          <div className={cn(
            notification.type === 'sla_breach_imminent' 
              ? "text-red-600 dark:text-red-400"
              : notification.type === 'customer_reply'
              ? "text-blue-600 dark:text-blue-400"
              : "text-slate-600 dark:text-slate-400"
          )}>
            {getIcon()}
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {notification.title}
                </h4>
                {notification.count && notification.count > 1 && (
                  <Badge variant="secondary" className="text-xs">
                    {notification.count}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2">
                {notification.message}
              </p>
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7">
                  <MoreVertical className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
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

          <div className="flex items-center justify-between mt-3">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
            </span>
            <Button
              onClick={handleAction}
              size="sm"
              className="h-8 text-xs font-semibold"
            >
              {getPrimaryAction()}
            </Button>
          </div>
        </div>
      </div>
    </Card>
  )
}

