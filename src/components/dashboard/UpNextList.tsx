'use client'

/**
 * UP NEXT LIST - PREMIUM TASK ITEMS
 * 
 * Modern task items with channel icon, preview snippet, waiting badge.
 * Hover reveals "Open" action (not primary CTA).
 */

import { useState, memo } from 'react'
import { Clock, MessageSquare, Phone, Mail, ChevronRight, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useRouter } from 'next/navigation'
import { useSmartPolling } from '@/hooks/useSmartPolling'

interface UpNextItem {
  id: string
  leadId: number
  contactName: string
  serviceType?: string
  reason: string
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'
  waitingTime?: string
  channel?: string
  latestMessage?: string
}

function ChannelIcon({ channel }: { channel?: string }) {
  const ch = channel?.toLowerCase() || 'whatsapp'
  if (ch.includes('whatsapp') || ch.includes('wa')) {
    return <MessageSquare className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
  }
  if (ch.includes('phone') || ch.includes('call')) {
    return <Phone className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
  }
  if (ch.includes('email') || ch.includes('mail')) {
    return <Mail className="h-3.5 w-3.5 text-slate-500" />
  }
  return <MessageSquare className="h-3.5 w-3.5 text-slate-500" />
}

const UpNextItemRow = memo(function UpNextItemRow({ item }: { item: UpNextItem }) {
  const router = useRouter()
  const [hovered, setHovered] = useState(false)
  const preview = item.latestMessage || item.reason
  const previewText = preview.length > 60 ? preview.substring(0, 60) + '...' : preview
  const waitingTime = item.waitingTime?.match(/(\d+[hd])/)?.[0] || '—'

  return (
    <div
      className={cn(
        "group flex items-center gap-3 p-3 rounded-[12px]",
        "bg-card-muted border border-slate-200/60 dark:border-slate-800/60",
        "hover:bg-card hover:border-slate-300 dark:hover:border-slate-700",
        "hover:shadow-sm transition-all duration-200 cursor-pointer"
      )}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => router.push(`/leads/${item.leadId}`)}
    >
      <ChannelIcon channel={item.channel} />
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <p className="text-body font-medium text-slate-900 dark:text-slate-100 truncate">
            {item.contactName || 'Unknown'}
          </p>
          {item.serviceType && (
            <Badge className="chip text-[11px]">{item.serviceType}</Badge>
          )}
        </div>
        <p className="text-meta text-slate-600 dark:text-slate-400 line-clamp-1">
          {previewText}
        </p>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <Badge variant="outline" className="pill text-[11px]">
          <Clock className="h-3 w-3 mr-1" />
          {waitingTime}
        </Badge>
        <ChevronRight 
          className={cn(
            "h-4 w-4 text-slate-400 transition-opacity duration-200",
            hovered ? "opacity-100" : "opacity-0"
          )} 
        />
      </div>
    </div>
  )
})

export const UpNextList = memo(function UpNextList() {
  const [items, setItems] = useState<UpNextItem[]>([])
  const [loading, setLoading] = useState(true)

  async function loadItems() {
    try {
      const res = await fetch('/api/dashboard/do-this-now')
      if (res.ok) {
        const data = await res.json()
        setItems((data.items || []).slice(1, 4))
      }
    } catch (error) {
      console.error('Failed to load up next items:', error)
    } finally {
      setLoading(false)
    }
  }

  const { isPolling, manualRefresh } = useSmartPolling({
    fetcher: loadItems,
    intervalMs: 60000, // 60s polling for dashboard
    enabled: true,
    pauseWhenHidden: true,
    onErrorBackoff: true,
  })

  if (loading) {
    return (
      <Card className="card-premium p-4">
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-slate-200 dark:bg-slate-800 rounded-[12px] animate-pulse" />
          ))}
        </div>
      </Card>
    )
  }

  if (items.length === 0) {
    return null
  }

  return (
    <Card className="card-premium p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-body font-semibold text-slate-900 dark:text-slate-100">
          Up Next
        </h4>
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
      <div className="space-y-2">
        {items.map((item) => (
          <UpNextItemRow key={item.id} item={item} />
        ))}
      </div>
    </Card>
  )
})
