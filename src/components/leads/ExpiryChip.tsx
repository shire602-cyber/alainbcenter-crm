'use client'

import { Badge } from '@/components/ui/badge'
import { Calendar, AlertCircle } from 'lucide-react'
import { differenceInDays, parseISO, format } from 'date-fns'
import { cn } from '@/lib/utils'

interface ExpiryChipProps {
  expiryDate: string
  type: string // e.g. 'VISA_EXPIRY', 'LICENSE_EXPIRY', 'EID_EXPIRY'
  className?: string
  showIcon?: boolean
  compact?: boolean
}

export function ExpiryChip({ expiryDate, type, className, showIcon = true, compact = false }: ExpiryChipProps) {
  const days = differenceInDays(parseISO(expiryDate), new Date())
  const isOverdue = days < 0

  // Format type for display (e.g. "VISA_EXPIRY" -> "Visa")
  const typeLabel = type
    .replace(/_EXPIRY$/, '')
    .split('_')
    .map(word => word.charAt(0) + word.slice(1).toLowerCase())
    .join(' ')

  let badgeVariant: 'default' | 'secondary' | 'destructive' = 'secondary'
  let badgeColors = ''
  let label = ''

  if (isOverdue) {
    badgeVariant = 'destructive'
    badgeColors = 'bg-red-100 text-red-800 border-red-300 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800'
    label = compact 
      ? `${Math.abs(days)}d overdue`
      : `${typeLabel}: ${Math.abs(days)}d overdue`
  } else if (days <= 7) {
    badgeVariant = 'destructive'
    badgeColors = 'bg-red-100 text-red-800 border-red-300 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800'
    label = compact 
      ? `${days}d left`
      : `${typeLabel}: ${days}d left`
  } else if (days <= 30) {
    badgeVariant = 'default'
    badgeColors = 'bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900/20 dark:text-orange-400 dark:border-orange-800'
    label = compact 
      ? `${days}d left`
      : `${typeLabel}: ${days}d left`
  } else if (days <= 90) {
    badgeVariant = 'secondary'
    badgeColors = 'bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900/20 dark:text-yellow-400 dark:border-yellow-800'
    label = compact 
      ? `${days}d left`
      : `${typeLabel}: ${days}d left`
  } else {
    badgeVariant = 'secondary'
    badgeColors = 'bg-gray-100 text-gray-700 border-gray-300 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700'
    label = compact 
      ? `${days}d left`
      : `${typeLabel}: ${days}d left`
  }

  return (
    <Badge
      variant={badgeVariant}
      className={cn(
        'inline-flex items-center gap-1.5 text-xs font-medium border',
        badgeColors,
        className
      )}
      title={compact ? `${typeLabel} expires ${format(parseISO(expiryDate), 'MMM d, yyyy')}` : undefined}
    >
      {showIcon && (
        isOverdue || days <= 7 ? (
          <AlertCircle className="h-3 w-3" />
        ) : (
          <Calendar className="h-3 w-3" />
        )
      )}
      <span>{label}</span>
    </Badge>
  )
}






