'use client'

/**
 * SIGNAL ROW - Reusable pressable row for signal items
 * 
 * Premium micro-interactions:
 * - Hover: subtle lift + glow shadow
 * - Tap targets >= 44px mobile
 * - Smooth transitions (150-200ms)
 */

import { memo, useState } from 'react'
import { Calendar, Hourglass, AlertTriangle, ChevronRight, MessageSquare } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/ui/toast'
import { SignalBadge } from './SignalBadge'

export interface SignalRowProps {
  leadId: number
  leadName: string
  serviceTypeName: string | null
  channel: string
  preview: string
  badge: string
  severity: 'neutral' | 'warn' | 'urgent'
  action: {
    type: 'open' | 'assign' | 'create_quote' | 'create_task'
    label: string
    href?: string
  }
  icon?: 'renewal' | 'waiting' | 'alert'
}

export const SignalRow = memo(function SignalRow({
  leadId,
  leadName,
  serviceTypeName,
  channel,
  preview,
  badge,
  severity,
  action,
  icon = 'alert',
}: SignalRowProps) {
  const router = useRouter()
  const { showToast } = useToast()
  const [hovered, setHovered] = useState(false)

  const iconComponent = {
    renewal: <Calendar className="h-4 w-4 text-blue-600 dark:text-blue-400" />,
    waiting: <Hourglass className="h-4 w-4 text-amber-600 dark:text-amber-400" />,
    alert: <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />,
  }[icon]

  const channelIcon = channel?.toLowerCase().includes('whatsapp') ? (
    <MessageSquare className="h-3 w-3 text-green-600 dark:text-green-400" />
  ) : null

  async function handleAction(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()

    if (action.type === 'open' && action.href) {
      router.push(action.href)
      return
    }

    if (action.type === 'assign' && action.href) {
      router.push(action.href)
      return
    }

    if (action.type === 'create_quote') {
      try {
        // Create quote task
        const res = await fetch('/api/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            leadId,
            title: 'Create Quote',
            type: 'QUOTE',
            dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
          }),
        })
        if (res.ok) {
          showToast('Quote task created', 'success')
          // Optionally refresh signals or navigate
          if (action.href) {
            router.push(action.href)
          }
        } else {
          showToast('Failed to create quote task', 'error')
        }
      } catch (error) {
        console.error('Failed to create quote task:', error)
        showToast('Failed to create quote task', 'error')
      }
      return
    }

    if (action.type === 'create_task') {
      // Similar to create_quote
      showToast('Task creation coming soon', 'info')
    }
  }

  return (
    <Link
      href={action.href || `/leads/${leadId}`}
      className={cn(
        'group flex items-center gap-3 p-3 rounded-[12px] min-h-[44px]',
        'card-pressable',
        'transition-all duration-200',
        hovered && '-translate-y-0.5 shadow-lg',
      )}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Left: Icon */}
      <div className="flex-shrink-0">
        {iconComponent}
      </div>

      {/* Middle: Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <p className="text-body font-medium text-slate-900 dark:text-slate-100 truncate">
            {leadName}
          </p>
          {serviceTypeName && (
            <Badge className="chip text-meta">
              {serviceTypeName}
            </Badge>
          )}
          {channelIcon}
        </div>
        <p className="text-meta muted-text line-clamp-1">
          {preview}
        </p>
      </div>

      {/* Right: Badge + Action */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <SignalBadge text={badge} severity={severity} />
        <Button
          size="sm"
          variant="ghost"
          className="h-8 px-2 text-meta rounded-[10px]"
          onClick={handleAction}
        >
          {action.label}
        </Button>
        <ChevronRight
          className={cn(
            'h-3.5 w-3.5 text-slate-400 transition-opacity duration-200',
            hovered ? 'opacity-100' : 'opacity-0'
          )}
        />
      </div>
    </Link>
  )
})

