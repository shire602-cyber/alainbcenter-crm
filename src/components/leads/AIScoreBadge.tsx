'use client'

import { Badge } from '@/components/ui/badge'
import { getAiScoreCategory } from '@/lib/constants'
import { cn } from '@/lib/utils'

interface AIScoreBadgeProps {
  score: number | null
  size?: 'sm' | 'md' | 'lg'
  showLabel?: boolean
}

export function AIScoreBadge({ score, size = 'md', showLabel = true }: AIScoreBadgeProps) {
  if (score === null) {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        No score
      </Badge>
    )
  }

  const category = getAiScoreCategory(score)
  const categoryUpper = category.toUpperCase()
  
  const colors = {
    hot: 'bg-red-100 text-red-800 border-red-300',
    warm: 'bg-orange-100 text-orange-800 border-orange-300',
    cold: 'bg-gray-100 text-gray-800 border-gray-300',
  }

  const sizes = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-3 py-1',
    lg: 'text-base px-4 py-1.5',
  }

  return (
    <Badge
      variant="outline"
      className={cn(colors[category], sizes[size], 'font-semibold')}
    >
      {showLabel && `${categoryUpper} `}
      {score}/100
    </Badge>
  )
}


















