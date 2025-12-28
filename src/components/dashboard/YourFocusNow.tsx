'use client'

/**
 * YOUR FOCUS NOW
 * 
 * Premium hero card showing the single highest priority item.
 * ONE primary action: "Open & Reply"
 * Calm, premium design with subtle indicators for SLA breaches.
 * Enhanced with focus mode, animations, and emotional polish.
 */

import { useState, useEffect } from 'react'
import { MessageSquare, Clock, DollarSign, AlertCircle, MoreVertical, CheckCircle2 } from 'lucide-react'
import { formatDistanceToNow, isToday, isYesterday, parseISO } from 'date-fns'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/ui/toast'

interface FocusItem {
  id: string
  leadId: number
  contactName: string
  serviceType?: string
  title: string
  reason: string
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'
  action: {
    type: 'reply' | 'call' | 'send_quote' | 'view' | 'follow_up'
    label: string
    url: string
  }
  dueAt?: string
  revenuePotential?: number
  channel?: string
  latestMessage?: string
  waitingTime?: string
}

export function YourFocusNow() {
  const [item, setItem] = useState<FocusItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [completed, setCompleted] = useState(false)
  const [entering, setEntering] = useState(true)
  const router = useRouter()
  const { showToast } = useToast()

  useEffect(() => {
    loadFocusItem()
    const interval = setInterval(loadFocusItem, 60000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    // Entrance animation
    if (item && !loading) {
      setEntering(true)
      const timer = setTimeout(() => setEntering(false), 200)
      return () => clearTimeout(timer)
    }
  }, [item, loading])

  async function loadFocusItem() {
    try {
      const res = await fetch('/api/dashboard/do-this-now')
      if (res.ok) {
        const data = await res.json()
        const items = data.items || []
        // Select highest priority item (first in sorted list)
        if (items.length > 0) {
          setItem(items[0])
        } else {
          setItem(null)
        }
      }
    } catch (error) {
      console.error('Failed to load focus item:', error)
    } finally {
      setLoading(false)
    }
  }

  function handleOpenAndReply() {
    if (!item) return
    // Store focus mode state in sessionStorage
    sessionStorage.setItem('focusMode', 'true')
    sessionStorage.setItem('focusItemId', item.id)
    router.push(item.action.url)
  }

  async function handleSnooze(minutes: number) {
    if (!item) return
    showToast(`Snoozed for ${minutes === 30 ? '30 minutes' : '24 hours'}`, 'info')
    // TODO: Implement snooze API if needed
    setItem(null)
    setTimeout(() => loadFocusItem(), minutes * 60 * 1000)
  }

  async function handleMarkDone() {
    if (!item) return
    setCompleted(true)
    showToast('Task completed', 'success')
    
    // Animate exit, then load next
    setTimeout(() => {
      setCompleted(false)
      loadFocusItem()
    }, 500)
  }

  function formatHumanTime(waitingTime?: string, dueAt?: string): string {
    if (waitingTime) {
      // Convert technical time to human language
      if (waitingTime.includes('overdue')) {
        const hours = waitingTime.match(/(\d+)h/)?.[1]
        if (hours) {
          const h = parseInt(hours)
          if (h >= 24) {
            const days = Math.floor(h / 24)
            return days === 1 ? 'Waiting since yesterday' : `Waiting since ${days} days ago`
          }
          return `Waiting since ${hours} hours ago`
        }
      }
      if (waitingTime.includes('waiting')) {
        const hours = waitingTime.match(/(\d+)h/)?.[1]
        if (hours) {
          const h = parseInt(hours)
          if (h >= 24) {
            const days = Math.floor(h / 24)
            return days === 1 ? 'Waiting since yesterday' : `Waiting since ${days} days ago`
          }
          return h === 1 ? 'Waiting since 1 hour ago' : `Waiting since ${hours} hours ago`
        }
      }
      return waitingTime
    }
    if (dueAt) {
      const due = parseISO(dueAt)
      if (isToday(due)) return 'Due today'
      if (isYesterday(due)) return 'Due yesterday'
      return `Due ${formatDistanceToNow(due, { addSuffix: true })}`
    }
    return 'Ready now'
  }

  if (loading) {
    return (
      <Card className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="h-32 bg-slate-100 dark:bg-slate-800 rounded-lg animate-pulse" />
      </Card>
    )
  }

  if (!item || completed) {
    return (
      <Card className={cn(
        "p-6 rounded-xl border border-slate-200 dark:border-slate-800",
        "bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/10 dark:to-emerald-900/5",
        "animate-in fade-in slide-in-from-bottom-4 duration-300"
      )}>
        <div className="text-center py-8">
          <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
          </div>
          <p className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">
            🎉 You're all caught up
          </p>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Enjoy the calm — we'll notify you if something comes up
          </p>
        </div>
      </Card>
    )
  }

  const isSlaBreached = item.priority === 'URGENT' && item.reason.includes('SLA')
  const isHighValue = item.revenuePotential && item.revenuePotential >= 10000
  const humanWaitingTime = formatHumanTime(item.waitingTime, item.dueAt)
  
  // Human-readable reason
  let humanReason = item.reason
  if (item.reason.includes('Reply due') || item.reason.includes('needs reply')) {
    humanReason = 'Needs your reply'
  } else if (item.reason.includes('Waiting on customer')) {
    humanReason = "Customer hasn't replied yet"
  } else if (item.reason.includes('SLA')) {
    humanReason = humanReason.replace(/SLA:?\s*\d+h/, 'Waiting since yesterday')
  }

  return (
    <Card 
      className={cn(
        "p-6 rounded-xl border transition-all duration-200",
        "border-slate-200 dark:border-slate-800",
        "bg-white dark:bg-slate-900",
        "hover:shadow-lg hover:border-slate-300 dark:hover:border-slate-700",
        "hover:-translate-y-0.5",
        entering && "animate-in fade-in slide-in-from-bottom-4 duration-200",
        completed && "animate-out fade-out slide-out-to-bottom-4 duration-300"
      )}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            {isSlaBreached && (
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                <Badge variant="destructive" className="text-xs px-2 py-0.5">
                  SLA breached
                </Badge>
              </div>
            )}
            {!isSlaBreached && item.priority === 'HIGH' && (
              <Badge className="bg-amber-500 text-white text-xs px-2 py-0.5">
                High priority
              </Badge>
            )}
            {item.serviceType && (
              <Badge variant="outline" className="text-xs">
                {item.serviceType}
              </Badge>
            )}
            {item.channel && (
              <Badge variant="outline" className="text-xs capitalize">
                {item.channel}
              </Badge>
            )}
          </div>
          
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">
            {item.contactName || 'Unknown WhatsApp User'}
          </h3>
          
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
            {humanReason}
          </p>

          {item.latestMessage && (
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 mb-3">
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Latest message:</p>
              <p className="text-sm text-slate-700 dark:text-slate-300 line-clamp-2">
                {item.latestMessage}
              </p>
            </div>
          )}

          <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
            <div className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              <span>{humanWaitingTime}</span>
            </div>
            {item.revenuePotential && (
              <div className="flex items-center gap-1.5">
                <DollarSign className="h-3.5 w-3.5" />
                <span className={cn(
                  isHighValue && "font-semibold text-amber-600 dark:text-amber-400"
                )}>
                  AED {item.revenuePotential.toLocaleString()}
                </span>
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <span className={cn(
                "w-2 h-2 rounded-full",
                isSlaBreached ? "bg-red-500" : item.priority === 'HIGH' ? "bg-amber-500" : "bg-green-500"
              )} />
              <span>
                {isSlaBreached ? 'Breached' : item.priority === 'HIGH' ? 'Warning' : 'Safe'}
              </span>
            </div>
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => handleSnooze(30)}>
              Snooze 30m
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleSnooze(1440)}>
              Snooze 24h
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleMarkDone}>
              Mark done
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex items-center gap-3 mt-4 pt-4 border-t border-slate-200 dark:border-slate-800">
        <Button
          onClick={handleOpenAndReply}
          className={cn(
            "flex-1 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold h-11",
            "transition-all duration-200 hover:shadow-md hover:-translate-y-0.5"
          )}
        >
          <MessageSquare className="h-4 w-4 mr-2" />
          Open & Reply
        </Button>
      </div>
    </Card>
  )
}

