'use client'

import { Badge } from '@/components/ui/badge'
import { TrendingUp, DollarSign } from 'lucide-react'
import { cn } from '@/lib/utils'

interface RenewalStripProps {
  probability: number // 0-100
  value: number // in AED
  className?: string
  compact?: boolean
}

export function RenewalStrip({ probability, value, className, compact = false }: RenewalStripProps) {
  // Determine color based on probability
  const getProbabilityColor = (prob: number) => {
    if (prob >= 70) return 'bg-green-100 text-green-800 border-green-300 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800'
    if (prob >= 40) return 'bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900/20 dark:text-yellow-400 dark:border-yellow-800'
    return 'bg-gray-100 text-gray-700 border-gray-300 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700'
  }

  if (compact) {
    return (
      <div className={cn('inline-flex items-center gap-2', className)}>
        <Badge
          variant="outline"
          className={cn('inline-flex items-center gap-1 border', getProbabilityColor(probability))}
        >
          <TrendingUp className="h-3 w-3" />
          <span>{probability}%</span>
        </Badge>
        <span className="text-sm font-semibold text-green-700 dark:text-green-400">
          AED {value.toLocaleString()}
        </span>
      </div>
    )
  }

  return (
    <div className={cn('flex items-center gap-3 p-2 rounded-lg bg-muted/50', className)}>
      <Badge
        variant="outline"
        className={cn('inline-flex items-center gap-1.5 border font-medium', getProbabilityColor(probability))}
      >
        <TrendingUp className="h-3.5 w-3.5" />
        <span>{probability}% probability</span>
      </Badge>
      <div className="flex items-center gap-1.5">
        <DollarSign className="h-4 w-4 text-green-600 dark:text-green-400" />
        <span className="text-sm font-bold text-green-700 dark:text-green-400">
          AED {value.toLocaleString()}
        </span>
      </div>
    </div>
  )
}





