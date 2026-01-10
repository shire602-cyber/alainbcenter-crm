'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { ChartLoading } from './ChartLoading'
import { Skeleton } from '@/components/ui/skeleton'

interface ChartContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string
  description?: string
  loading?: boolean
  error?: string | null
  height?: number | string
  aspectRatio?: string
  children: React.ReactNode
}

export function ChartContainer({
  title,
  description,
  loading,
  error,
  height = 300,
  aspectRatio,
  className,
  children,
  ...props
}: ChartContainerProps) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-slate-200/60 bg-white p-6 shadow-lg transition-all duration-300 hover:shadow-xl',
        className
      )}
      style={aspectRatio ? { aspectRatio } : { minHeight: typeof height === 'number' ? `${height}px` : height }}
      {...props}
    >
      {(title || description) && (
        <div className="mb-4 pb-3 border-b border-slate-200/60">
          {title && <h3 className="text-subhead text-slate-900 mb-1">{title}</h3>}
          {description && <p className="text-body text-slate-600">{description}</p>}
        </div>
      )}
      
      {error ? (
        <div className="flex items-center justify-center h-full min-h-[200px] text-body text-red-600">
          <p>{error}</p>
        </div>
      ) : loading ? (
        <ChartLoading height={height} />
      ) : (
        <div className="w-full h-full">{children}</div>
      )}
    </div>
  )
}

