'use client'

import { Badge } from '@/components/ui/badge'
import { getAiScoreCategory } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { AlertCircle } from 'lucide-react'

interface AIScoreBadgePremiumProps {
  score: number | null
  showTooltip?: boolean
  className?: string
}

export function AIScoreBadgePremium({ score, showTooltip = true, className }: AIScoreBadgePremiumProps) {
  if (score === null) {
    return (
      <Badge variant="outline" className={cn('text-muted-foreground', className)}>
        <div className="w-2 h-2 rounded-full bg-gray-400 mr-1.5" />
        No score
      </Badge>
    )
  }

  const category = getAiScoreCategory(score)
  const categoryUpper = category.toUpperCase()
  
  const colors = {
    hot: {
      dot: 'bg-red-500',
      badge: 'bg-red-50 text-red-700 border-red-200',
      progress: 'bg-red-500',
      tooltip: 'High engagement, recent activity, quick responses, qualified service needs'
    },
    warm: {
      dot: 'bg-orange-500',
      badge: 'bg-orange-50 text-orange-700 border-orange-200',
      progress: 'bg-orange-500',
      tooltip: 'Moderate interest, some engagement, potential for conversion with follow-up'
    },
    cold: {
      dot: 'bg-gray-400',
      badge: 'bg-gray-50 text-gray-700 border-gray-200',
      progress: 'bg-gray-400',
      tooltip: 'Low activity, needs nurturing, early stage inquiry'
    },
  }

  const style = colors[category]

  const badge = (
    <Badge
      variant="outline"
      className={cn(style.badge, 'relative overflow-hidden pr-8', className)}
    >
      <div className={cn('w-2 h-2 rounded-full mr-1.5 animate-pulse', style.dot)} />
      <span className="font-semibold">{categoryUpper}</span>
      <span className="ml-1.5 font-normal">{score}/100</span>
      {/* Micro progress bar */}
      <div className="absolute bottom-0 left-0 h-0.5 bg-current opacity-30" style={{ width: `${score}%` }} />
    </Badge>
  )

  if (showTooltip) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            {badge}
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-semibold mb-1">Why {categoryUpper}?</p>
                <p className="text-xs text-muted-foreground">{style.tooltip}</p>
              </div>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  return badge
}


















