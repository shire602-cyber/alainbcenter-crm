'use client'

import { useEffect, useState, useRef } from 'react'
import { getAiScoreCategory } from '@/lib/constants'
import { cn } from '@/lib/utils'

interface AIScoreCircleAnimatedProps {
  score: number | null
  size?: number
  className?: string
  animateOnUpdate?: boolean
}

export function AIScoreCircleAnimated({ 
  score, 
  size = 80, 
  className,
  animateOnUpdate = true 
}: AIScoreCircleAnimatedProps) {
  const [displayScore, setDisplayScore] = useState(0)
  const [animatedOffset, setAnimatedOffset] = useState(0)
  const [isInitialized, setIsInitialized] = useState(false)
  const [isAnimating, setIsAnimating] = useState(false)
  const prevScoreRef = useRef<number | null>(null)
  const animationFrameRef = useRef<number | null>(null)

  const circumference = 2 * Math.PI * (size / 2 - 8)
  const targetOffset = score !== null ? circumference - (score / 100) * circumference : circumference

  useEffect(() => {
    if (score === null) return

    // Initial load animation
    if (!isInitialized) {
      setDisplayScore(0)
      setAnimatedOffset(circumference) // Start at 100% offset (empty)
      setIsInitialized(true)
      
      // Animate from 0 to target score
      const duration = 1200
      const startTime = Date.now()
      const startOffset = circumference

      const animate = () => {
        const elapsed = Date.now() - startTime
        const progress = Math.min(elapsed / duration, 1)
        
        // Ease out cubic for smooth deceleration
        const easeOutCubic = 1 - Math.pow(1 - progress, 3)
        
        const currentOffset = startOffset - (startOffset - targetOffset) * easeOutCubic
        const currentScore = Math.round((circumference - currentOffset) / circumference * 100)
        
        setAnimatedOffset(currentOffset)
        setDisplayScore(currentScore)

        if (progress < 1) {
          animationFrameRef.current = requestAnimationFrame(animate)
        } else {
          setDisplayScore(score)
          setAnimatedOffset(targetOffset)
          setIsAnimating(false)
        }
      }
      
      setIsAnimating(true)
      animationFrameRef.current = requestAnimationFrame(animate)
      prevScoreRef.current = score
      return
    }

    // Update animation when score changes
    if (prevScoreRef.current !== null && prevScoreRef.current !== score && animateOnUpdate) {
      const startOffset = animatedOffset
      const startScore = displayScore
      const diff = score - startScore
      const duration = 800
      const startTime = Date.now()

      setIsAnimating(true)

      const animate = () => {
        const elapsed = Date.now() - startTime
        const progress = Math.min(elapsed / duration, 1)
        const easeOutCubic = 1 - Math.pow(1 - progress, 3)
        
        const currentOffset = startOffset - (startOffset - targetOffset) * easeOutCubic
        const currentScore = Math.round(startScore + diff * easeOutCubic)
        
        setAnimatedOffset(currentOffset)
        setDisplayScore(currentScore)

        if (progress < 1) {
          animationFrameRef.current = requestAnimationFrame(animate)
        } else {
          setDisplayScore(score)
          setAnimatedOffset(targetOffset)
          setIsAnimating(false)
        }
      }

      animationFrameRef.current = requestAnimationFrame(animate)
      prevScoreRef.current = score
    } else if (prevScoreRef.current !== score) {
      setDisplayScore(score)
      setAnimatedOffset(targetOffset)
      prevScoreRef.current = score
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [score, circumference, targetOffset, animateOnUpdate, isInitialized, animatedOffset, displayScore])

  if (score === null) {
    return (
      <div className={cn('flex items-center justify-center rounded-full border-4 border-muted', className)} style={{ width: size, height: size }}>
        <span className="text-sm text-muted-foreground">N/A</span>
      </div>
    )
  }

  const category = getAiScoreCategory(displayScore)

  const colors = {
    hot: { 
      bg: 'text-red-100', 
      ring: 'text-red-500', 
      text: 'text-red-700',
      gradient: 'from-red-500 via-red-600 to-red-700'
    },
    warm: { 
      bg: 'text-orange-100', 
      ring: 'text-orange-500', 
      text: 'text-orange-700',
      gradient: 'from-orange-500 via-orange-600 to-orange-700'
    },
    cold: { 
      bg: 'text-gray-100', 
      ring: 'text-gray-500', 
      text: 'text-gray-700',
      gradient: 'from-gray-500 via-gray-600 to-gray-700'
    },
  }

  const color = colors[category]
  const uniqueId = `gradient-${displayScore}-${size}`

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
          className={cn(color.bg, 'transition-colors duration-300')}
        />
        {/* Progress circle with animation */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={size / 2 - 8}
          fill="none"
          stroke={`url(#${uniqueId})`}
          strokeWidth="8"
          strokeDasharray={circumference}
          strokeDashoffset={animatedOffset}
          strokeLinecap="round"
          className={cn(
            'transition-all duration-300',
            isAnimating && 'animate-pulse-glow'
          )}
          style={{
            transition: 'stroke-dashoffset 0.05s linear',
          }}
        />
        <defs>
          <linearGradient id={uniqueId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="currentColor" className={color.ring} />
            <stop offset="100%" stopColor="currentColor" className={color.ring} />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span 
          className={cn(
            'text-2xl font-bold bg-gradient-to-br bg-clip-text text-transparent transition-all duration-300',
            `bg-gradient-to-br ${color.gradient}`
          )}
          style={{
            backgroundImage: `linear-gradient(135deg, var(--tw-gradient-stops))`,
          }}
        >
          {displayScore}
        </span>
        <span className={cn('text-xs uppercase font-semibold tracking-wide transition-colors duration-300', color.text)}>
          {category}
        </span>
      </div>
    </div>
  )
}

