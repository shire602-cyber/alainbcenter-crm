'use client'

import * as React from 'react'
import { ChartSkeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'

interface ChartLoadingProps {
  height?: number | string
  variant?: 'skeleton' | 'spinner'
}

export function ChartLoading({ height = 300, variant = 'skeleton' }: ChartLoadingProps) {
  if (variant === 'spinner') {
    return (
      <div 
        className="flex items-center justify-center w-full"
        style={{ minHeight: typeof height === 'number' ? `${height}px` : height }}
      >
        <Spinner size="lg" variant="circle" />
      </div>
    )
  }

  return <ChartSkeleton height={typeof height === 'number' ? height : 300} />
}

