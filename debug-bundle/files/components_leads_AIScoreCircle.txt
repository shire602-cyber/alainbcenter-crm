'use client'

import { getAiScoreCategory } from '@/lib/constants'
import { cn } from '@/lib/utils'

interface AIScoreCircleProps {
  score: number | null
  size?: number
  className?: string
}

export function AIScoreCircle({ score, size = 80, className }: AIScoreCircleProps) {
  if (score === null) {
    return (
      <div className={cn('flex items-center justify-center rounded-full border-4 border-muted', className)} style={{ width: size, height: size }}>
        <span className="text-sm text-muted-foreground">N/A</span>
      </div>
    )
  }

  const category = getAiScoreCategory(score)
  const circumference = 2 * Math.PI * (size / 2 - 8)
  const offset = circumference - (score / 100) * circumference

  const colors = {
    hot: { bg: 'text-red-100', ring: 'text-red-500', text: 'text-red-700' },
    warm: { bg: 'text-orange-100', ring: 'text-orange-500', text: 'text-orange-700' },
    cold: { bg: 'text-gray-100', ring: 'text-gray-500', text: 'text-gray-700' },
  }

  const color = colors[category]

  return (
    <div className={cn('relative inline-flex items-center justify-center', className)}>
      <svg width={size} height={size} className="transform -rotate-90">
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={size / 2 - 8}
          fill="none"
          stroke="currentColor"
          strokeWidth="8"
          className={color.bg}
        />
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={size / 2 - 8}
          fill="none"
          stroke="currentColor"
          strokeWidth="8"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className={color.ring}
          style={{
            transition: 'stroke-dashoffset 0.5s ease-in-out',
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn('text-2xl font-bold', color.text)}>{score}</span>
        <span className={cn('text-xs uppercase font-medium', color.text)}>
          {category}
        </span>
      </div>
    </div>
  )
}


















