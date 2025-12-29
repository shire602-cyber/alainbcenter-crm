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
import { MessageSquare, Phone, Mail, Calendar, FileText, AlertCircle, RefreshCw, Quote } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
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
      <Card className="card-premium inset-hero text-center">
        <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center mx-auto mb-4">
          <Calendar className="h-8 w-8 text-green-600 dark:text-green-400" />
        </div>
        <p className="text-h1 text-slate-900 dark:text-slate-100 mb-2">
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
    <Card className="card-premium inset-hero">
      <div className="flex items-start gap-6">
        {/* LEFT: Title + Preview + Context */}
        <div className="flex-1 min-w-0">
          {/* Header: Channel + SLA + Refresh */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                <ChannelIcon channel={item.channel} />
              </div>
              {isSlaBreached && (
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
                  <span className="text-meta text-red-600 dark:text-red-400 font-medium">{item.slaLabel}</span>
                </div>
              )}
              {item.slaLabel && !isSlaBreached && (
                <Badge className="chip text-xs">{item.slaLabel}</Badge>
              )}
            </div>
            {onRefresh && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-lg btn-pressable"
                onClick={onRefresh}
                disabled={isRefreshing}
              >
                <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
              </Button>
            )}
          </div>

          {/* Title */}
          <h3 className="text-h1 text-slate-900 dark:text-slate-100 mb-3 font-semibold">
            {item.title}
          </h3>

          {/* Preview with quote icon */}
          {item.preview && (
            <div className="mb-3">
              <div className="flex items-start gap-2 text-body text-slate-700 dark:text-slate-300">
                <Quote className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500 mt-0.5 flex-shrink-0" />
                <p className="line-clamp-2 leading-relaxed">
                  {item.preview}
                </p>
              </div>
            </div>
          )}

          {/* Context Strip */}
          <div className="flex items-center gap-3 text-meta muted-text mb-4">
            {item.channel && (
              <div className="flex items-center gap-1.5">
                <ChannelIcon channel={item.channel} />
                <span className="capitalize">{item.channel}</span>
              </div>
            )}
            {item.waitingDays !== undefined && (
              <>
                <span>·</span>
                <span>Waiting {item.waitingDays} day{item.waitingDays !== 1 ? 's' : ''}</span>
              </>
            )}
            {isSlaBreached && (
              <>
                <span>·</span>
                <span className="text-red-600 dark:text-red-400 font-medium">SLA risk</span>
              </>
            )}
          </div>

          {/* Meta Row: Service + Revenue */}
          <div className="flex items-center gap-2 flex-wrap">
            {item.revenueHint && (
              <Badge className="chip bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400">
                {item.revenueHint}
              </Badge>
            )}
            <span className="text-meta muted-text">{whyNow}</span>
          </div>
        </div>

        {/* RIGHT: ONE CTA */}
        <div className="flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          <Button
            onClick={handleCtaClick}
            size="lg"
            className={cn(
              "h-12 px-6 bg-primary hover:bg-primary/90 text-primary-foreground",
              "font-semibold radius-xl shadow-soft hover:shadow-premium",
              "transition-all duration-200 hover:-translate-y-0.5 btn-pressable"
            )}
          >
            {item.primaryCta.label}
          </Button>
        </div>
      </div>
    </Card>
  )
})

// Skeleton loader matching final layout
export function FocusHeroCardSkeleton() {
  return (
    <Card className="card-premium inset-hero">
      <div className="flex items-start gap-6">
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Skeleton className="w-8 h-8 rounded-full" />
              <Skeleton className="h-4 w-20" />
            </div>
            <Skeleton className="w-8 h-8 rounded-lg" />
          </div>
          <Skeleton className="h-7 w-3/4 mb-3" />
          <Skeleton className="h-5 w-full mb-2" />
          <Skeleton className="h-5 w-2/3 mb-4" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-5 w-32" />
          </div>
        </div>
        <Skeleton className="h-12 w-32 radius-xl" />
      </div>
    </Card>
  )
}

