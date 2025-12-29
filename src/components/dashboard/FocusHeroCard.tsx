'use client'

/**
 * FOCUS HERO CARD - ONE OBVIOUS NEXT ACTION
 * 
 * Premium hero layout: left (title+preview+meta), right (ONE CTA button)
 * Shows channel icon + tiny SLA dot if needed
 * One "why now" line derived deterministically from kind
 * Pressable card with hover lift + active press scale
 */

import { memo } from 'react'
import { MessageSquare, Phone, Mail, Calendar, FileText, AlertCircle, RefreshCw } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/ui/toast'
import type { CommandItem } from '@/lib/dashboard/commandCenterTypes'

interface FocusHeroCardProps {
  item: CommandItem | null
  onRefresh?: () => void
  isRefreshing?: boolean
}

function ChannelIcon({ channel }: { channel?: string }) {
  const ch = channel?.toLowerCase() || 'whatsapp'
  if (ch.includes('whatsapp') || ch.includes('wa')) {
    return <MessageSquare className="h-4 w-4 text-green-600 dark:text-green-400" />
  }
  if (ch.includes('phone') || ch.includes('call')) {
    return <Phone className="h-4 w-4 text-blue-600 dark:text-blue-400" />
  }
  if (ch.includes('email') || ch.includes('mail')) {
    return <Mail className="h-4 w-4 text-slate-600 dark:text-slate-400" />
  }
  return <MessageSquare className="h-4 w-4 text-slate-500" />
}

function getWhyNow(item: CommandItem): string {
  switch (item.kind) {
    case 'reply':
      if (item.slaLabel) {
        return 'Customer waiting — SLA risk'
      }
      return 'Customer needs your reply'
    case 'task':
      return 'Task overdue — needs attention'
    case 'quote':
      return 'Quote ready — revenue opportunity'
    case 'renewal':
      return 'Renewal due soon — high value'
    case 'waiting':
      return `Customer hasn't replied in ${item.waitingDays || 0} days`
    case 'alert':
      return 'Action required'
    default:
      return 'Needs attention'
  }
}

export const FocusHeroCard = memo(function FocusHeroCard({
  item,
  onRefresh,
  isRefreshing,
}: FocusHeroCardProps) {
  const router = useRouter()
  const { showToast } = useToast()

  if (!item) {
    return (
      <Card className="card-premium p-8 text-center">
        <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center mx-auto mb-4">
          <Calendar className="h-8 w-8 text-green-600 dark:text-green-400" />
        </div>
        <p className="text-heading text-slate-900 dark:text-slate-100 mb-2">
          All caught up ✅
        </p>
        <p className="text-body muted-text">
          Enjoy the calm — we'll notify you if something comes up
        </p>
      </Card>
    )
  }

  const whyNow = getWhyNow(item)
  const isSlaBreached = item.slaLabel?.includes('breach') || false

  const handleCtaClick = () => {
    if (item.primaryCta.href) {
      showToast('Opening...', 'info')
      router.push(item.primaryCta.href)
    } else if (item.primaryCta.action === 'open_reply') {
      showToast('Opening conversation...', 'info')
      router.push(`/leads/${item.leadId}`)
    } else if (item.primaryCta.action === 'open_lead') {
      showToast('Opening lead...', 'info')
      router.push(`/leads/${item.leadId}`)
    }
  }

  return (
    <Card
      className={cn(
        "card-premium p-6",
        "hover:-translate-y-1 transition-all duration-200",
        "active:scale-[0.99]"
      )}
    >
      <div className="flex items-start gap-6">
        {/* LEFT: Title + Preview */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <ChannelIcon channel={item.channel} />
              {isSlaBreached && (
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
                  <span className="text-meta text-red-600 dark:text-red-400">{item.slaLabel}</span>
                </div>
              )}
              {item.slaLabel && !isSlaBreached && (
                <span className="text-meta muted-text">{item.slaLabel}</span>
              )}
            </div>
            {onRefresh && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-[10px]"
                onClick={onRefresh}
                disabled={isRefreshing}
              >
                <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
              </Button>
            )}
          </div>

          <h3 className="text-heading text-slate-900 dark:text-slate-100 mb-2">
            {item.title}
          </h3>

          {item.preview && (
            <p className="text-body text-slate-700 dark:text-slate-300 line-clamp-2 mb-4">
              {item.preview}
            </p>
          )}

          {/* WHY NOW */}
          <p className="text-meta muted-text mb-2">
            {whyNow}
          </p>

          {/* METADATA */}
          <div className="flex items-center gap-4 text-meta">
            {item.channel && (
              <div className="flex items-center gap-1.5">
                <ChannelIcon channel={item.channel} />
                <span className="capitalize">{item.channel}</span>
              </div>
            )}
            {item.revenueHint && (
              <Badge className="chip bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400">
                {item.revenueHint}
              </Badge>
            )}
            {item.waitingDays !== undefined && (
              <span className="muted-text">
                Waiting {item.waitingDays} day{item.waitingDays !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>

        {/* RIGHT: ONE CTA */}
        <div className="flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          <Button
            onClick={handleCtaClick}
            size="lg"
            className={cn(
              "h-12 px-6 bg-primary hover:bg-primary/90 text-primary-foreground",
              "font-semibold rounded-[14px] shadow-sm hover:shadow-md",
              "transition-all duration-200 hover:-translate-y-0.5 active:scale-95",
              "hover:shadow-lg"
            )}
          >
            {item.primaryCta.label}
          </Button>
        </div>
      </div>
    </Card>
  )
})

