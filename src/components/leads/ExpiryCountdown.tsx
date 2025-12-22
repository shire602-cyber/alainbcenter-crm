'use client'

import { Badge } from '@/components/ui/badge'
import { differenceInDays, parseISO } from 'date-fns'
import { cn } from '@/lib/utils'

interface ExpiryCountdownProps {
  expiryDate: string
  type: string
}

export function ExpiryCountdown({ expiryDate, type }: ExpiryCountdownProps) {
  const days = differenceInDays(parseISO(expiryDate), new Date())
  const isOverdue = days < 0
  
  // Color coding based on days remaining
  let badgeVariant: 'default' | 'secondary' | 'destructive' = 'secondary'
  let badgeColor = ''
  let label = ''
  
  if (isOverdue) {
    badgeVariant = 'destructive'
    label = `${Math.abs(days)}d overdue`
  } else if (days <= 7) {
    badgeVariant = 'destructive'
    badgeColor = 'bg-red-100 text-red-800 border-red-300'
    label = `${days}d left`
  } else if (days <= 30) {
    badgeVariant = 'default'
    badgeColor = 'bg-orange-100 text-orange-800 border-orange-300'
    label = `${days}d left`
  } else if (days <= 60) {
    badgeVariant = 'default'
    badgeColor = 'bg-yellow-100 text-yellow-800 border-yellow-300'
    label = `${days}d left`
  } else if (days <= 90) {
    badgeVariant = 'secondary'
    badgeColor = 'bg-blue-100 text-blue-800 border-blue-300'
    label = `${days}d left`
  } else {
    badgeVariant = 'secondary'
    label = `${days}d left`
  }

  return (
    <Badge 
      variant={badgeVariant} 
      className={cn(badgeColor)}
    >
      {label}
    </Badge>
  )
}







