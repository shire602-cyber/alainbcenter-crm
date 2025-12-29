'use client'

/**
 * UP NEXT LIST - PREMIUM TASK ITEMS
 * 
 * Modern task items with channel icon, preview snippet, waiting badge.
 * Hover reveals "Open" action (not primary CTA).
 */

import { useState, memo, useCallback } from 'react'
import { Clock, MessageSquare, Phone, Mail, ChevronRight, RefreshCw, MoreVertical, Eye, Clock as ClockIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useRouter } from 'next/navigation'
import { useSmartPolling } from '@/hooks/useSmartPolling'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

import type { CommandItem } from '@/lib/dashboard/commandCenterTypes'

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
  const previewText = preview.length > 50 ? preview.substring(0, 50) + '...' : preview
  const waitingTime = item.waitingTime?.match(/(\d+[hd])/)?.[0] || '—'
  const isUrgent = item.priority === 'URGENT' || item.priority === 'HIGH'

  const handleOpen = (e: React.MouseEvent) => {
    e.stopPropagation()
    router.push(`/leads/${item.leadId}`)
  }

  return (
    <div
      className={cn(
        "group flex items-center gap-3 p-3 radius-xl",
        "bg-card-muted border border-subtle",
        "hover:bg-card hover:border-slate-300 dark:hover:border-slate-700",
        "card-pressable"
      )}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={handleOpen}
    >
      {/* LEFT: Channel icon in soft circle */}
      <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center flex-shrink-0">
        <ChannelIcon channel={item.channel} />
      </div>
      
      {/* MIDDLE: Name + Service + Preview */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <p className="text-body font-medium text-slate-900 dark:text-slate-100 truncate">
            {item.contactName || 'Unknown'}
          </p>
          {item.serviceType && (
            <Badge className="chip text-[11px] px-2 py-0.5">{item.serviceType}</Badge>
          )}
        </div>
        <p className="text-meta text-slate-600 dark:text-slate-400 line-clamp-1">
          {previewText}
        </p>
      </div>

      {/* RIGHT: Time + Risk dot + Micro-actions */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <div className="flex items-center gap-1.5">
          {isUrgent && (
            <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
          )}
          <span className="text-meta muted-text text-[11px]">{waitingTime}</span>
        </div>
        
        {/* Micro-actions (desktop only, on hover) */}
        <div className={cn(
          "flex items-center gap-1 transition-opacity duration-200",
          hovered ? "opacity-100" : "opacity-0"
        )}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-lg btn-pressable"
              >
                <MoreVertical className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
              <DropdownMenuItem onClick={handleOpen}>
                <Eye className="h-3.5 w-3.5 mr-2" />
                Open
              </DropdownMenuItem>
              <DropdownMenuItem onClick={(e) => e.stopPropagation()}>
                <ClockIcon className="h-3.5 w-3.5 mr-2" />
                Snooze 30m
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  )
})

interface UpNextListProps {
  items?: CommandItem[]
}

export const UpNextList = memo(function UpNextList({ items: propItems }: UpNextListProps) {
  const [items, setItems] = useState<UpNextItem[]>([])
  const [loading, setLoading] = useState(!propItems)

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
    enabled: !propItems, // Disable polling if items provided via props
    pauseWhenHidden: true,
    onErrorBackoff: true,
  })

  // Use prop items if provided, otherwise use state
  const displayItems: UpNextItem[] = propItems 
    ? propItems.map(item => ({
        id: item.id,
        leadId: item.leadId || 0,
        contactName: item.title.split(' — ')[0] || item.title,
        serviceType: item.title.match(/\(([^)]+)\)/)?.[1],
        reason: item.preview || '',
        priority: (item.slaLabel ? 'URGENT' : 'NORMAL') as 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT',
        waitingTime: item.waitingDays ? `${item.waitingDays}d` : undefined,
        channel: item.channel,
        latestMessage: item.preview,
      }))
    : items

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

  if (displayItems.length === 0) {
    return null
  }

  return (
    <Card className="card-premium p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-body font-semibold text-slate-900 dark:text-slate-100">
          Up Next
        </h4>
        {!propItems && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-[10px]"
            onClick={manualRefresh}
            disabled={isPolling}
          >
            <RefreshCw className={cn("h-4 w-4", isPolling && "animate-spin")} />
          </Button>
        )}
      </div>
      <div className="space-y-2">
        {displayItems.map((item) => (
          <UpNextItemRow key={item.id} item={item} />
        ))}
      </div>
    </Card>
  )
})
