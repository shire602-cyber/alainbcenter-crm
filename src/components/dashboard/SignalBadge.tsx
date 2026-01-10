'use client'

/**
 * SIGNAL BADGE - Small badge for signal items
 * 
 * Shows severity-aware styling (no red backgrounds, only dots/labels)
 */

import { memo } from 'react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface SignalBadgeProps {
  text: string
  severity: 'neutral' | 'warn' | 'urgent'
  className?: string
}

export const SignalBadge = memo(function SignalBadge({
  text,
  severity,
  className,
}: SignalBadgeProps) {
  return (
    <Badge
      className={cn(
        'chip text-meta font-semibold',
        severity === 'urgent' && 'bg-red-100 text-red-700',
        severity === 'warn' && 'bg-amber-100 text-amber-700',
        severity === 'neutral' && 'bg-blue-100 text-blue-700',
        className
      )}
    >
      {text}
    </Badge>
  )
})











