'use client'

/**
 * YOUR FOCUS NOW - PREMIUM HERO
 * 
 * Premium hero card with left-right layout:
 * Left: Title + message preview (2 lines)
 * Right: 1 CTA button "Open & Reply"
 * Metadata row: channel icon, waiting time, SLA risk dot
 */

import { useState, memo, useCallback } from 'react'
import { MessageSquare, Clock, DollarSign, AlertCircle, Phone, Mail, CheckCircle2, RefreshCw } from 'lucide-react'
import { formatDistanceToNow, isToday, isYesterday, parseISO } from 'date-fns'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/ui/toast'
import { useSmartPolling } from '@/hooks/useSmartPolling'

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

function ChannelIcon({ channel }: { channel?: string }) {
  const ch = channel?.toLowerCase() || 'whatsapp'
  if (ch.includes('whatsapp') || ch.includes('wa')) {
    return <MessageSquare className="h-4 w-4 text-green-700" />
  }
  if (ch.includes('phone') || ch.includes('call')) {
    return <Phone className="h-4 w-4 text-blue-700" />
  }
  if (ch.includes('email') || ch.includes('mail')) {
    return <Mail className="h-4 w-4 text-slate-700" />
  }
  return <MessageSquare className="h-4 w-4 text-slate-600" />
}

export const YourFocusNow = memo(function YourFocusNow() {
  const [item, setItem] = useState<FocusItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [completed, setCompleted] = useState(false)
  const router = useRouter()
  const { showToast } = useToast()

  const loadFocusItem = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard/do-this-now')
      if (res.ok) {
        const data = await res.json()
        const items = data.items || []
        setItem(items.length > 0 ? items[0] : null)
      }
    } catch (error) {
      console.error('Failed to load focus item:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  const { isPolling, manualRefresh } = useSmartPolling({
    fetcher: loadFocusItem,
    intervalMs: 60000, // 60s polling for dashboard
    enabled: true,
    pauseWhenHidden: true,
    onErrorBackoff: true,
  })

  function handleOpenAndReply() {
    if (!item) return
    sessionStorage.setItem('focusMode', 'true')
    sessionStorage.setItem('focusItemId', item.id)
    router.push(item.action.url)
  }

  function formatHumanTime(waitingTime?: string): string {
    if (!waitingTime) return ''
    const hours = waitingTime.match(/(\d+)h/)?.[1]
    if (hours) {
      const h = parseInt(hours)
      if (h >= 24) {
        const days = Math.floor(h / 24)
        return days === 1 ? 'Since yesterday' : `${days}d ago`
      }
      return `${h}h`
    }
    return waitingTime
  }

  if (loading) {
    return (
      <Card className="card-premium p-6">
        <div className="flex items-center gap-6">
          <div className="flex-1 space-y-3">
            <div className="h-6 w-3/4 bg-slate-200 rounded animate-pulse" />
            <div className="h-4 w-full bg-slate-200 rounded animate-pulse" />
            <div className="h-4 w-2/3 bg-slate-200 rounded animate-pulse" />
          </div>
          <div className="h-11 w-32 bg-slate-200 rounded-lg animate-pulse" />
        </div>
      </Card>
    )
  }

  if (!item || completed) {
    return (
      <Card className="card-premium p-8 text-center">
        <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="h-8 w-8 text-green-700" />
        </div>
        <p className="text-heading text-slate-900 mb-2 font-bold tracking-tight">
          All caught up
        </p>
        <p className="text-body text-slate-600 font-medium">
          Enjoy the calm — we'll notify you if something comes up
        </p>
      </Card>
    )
  }

  const isSlaBreached = item.priority === 'URGENT'
  const humanWaitingTime = formatHumanTime(item.waitingTime)
  const preview = item.latestMessage || item.reason
  const previewLines = preview.length > 80 ? preview.substring(0, 80) + '...' : preview

  return (
    <Card 
      className={cn(
        "card-premium p-6",
        "hover:-translate-y-1 transition-all duration-200",
        completed && "animate-out fade-out slide-out-to-bottom-4 duration-300"
      )}
    >
      <div className="flex items-start gap-6">
        {/* LEFT: Title + Preview */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              {item.serviceType && (
                <Badge className="chip">{item.serviceType}</Badge>
              )}
              {isSlaBreached && (
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
                  <span className="text-meta text-red-700 font-semibold">SLA breached</span>
                </div>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-[10px]"
              onClick={manualRefresh}
              disabled={isPolling}
            >
              <RefreshCw className={cn("h-4 w-4", isPolling && "animate-spin")} />
            </Button>
          </div>
          
          <h3 className="text-heading text-slate-900 mb-2 font-bold tracking-tight">
            {item.contactName || 'Unknown Contact'}
          </h3>
          
          <p className="text-body text-slate-700 line-clamp-2 mb-4 font-medium">
            {previewLines}
          </p>

          {/* METADATA ROW */}
          <div className="flex items-center gap-4 text-meta">
            <div className="flex items-center gap-1.5">
              <ChannelIcon channel={item.channel} />
              <span className="capitalize">{item.channel || 'WhatsApp'}</span>
            </div>
            {humanWaitingTime && (
              <div className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                <span>Waiting {humanWaitingTime}</span>
              </div>
            )}
            {item.revenuePotential && (
              <div className="flex items-center gap-1.5">
                <DollarSign className="h-3.5 w-3.5" />
                <span>AED {item.revenuePotential.toLocaleString()}</span>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: CTA */}
        <div className="flex-shrink-0">
          <Button
            onClick={handleOpenAndReply}
            className={cn(
              "h-12 px-6 bg-primary hover:bg-primary/90 text-primary-foreground",
              "font-semibold rounded-[14px] shadow-sm hover:shadow-md",
              "transition-all duration-200 hover:-translate-y-0.5"
            )}
          >
            <MessageSquare className="h-4 w-4 mr-2" />
            Open & Reply
          </Button>
        </div>
      </div>
    </Card>
  )
})
