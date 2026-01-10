'use client'

import { cn } from "@/lib/utils"
import { ReactNode } from "react"

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'pulse' | 'shimmer'
}

function Skeleton({
  className,
  variant = 'shimmer',
  ...props
}: SkeletonProps) {
  return (
    <div
      className={cn(
        "rounded-lg bg-slate-100",
        variant === 'pulse' && "animate-pulse",
        variant === 'shimmer' && "skeleton-shimmer",
        variant === 'default' && "bg-slate-100/50",
        className
      )}
      {...props}
    />
  )
}

// Specialized skeleton variants
function TableSkeleton({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex gap-4 pb-2 border-b border-slate-200">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} variant="shimmer" className="h-4 flex-1" />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, rowIdx) => (
        <div key={rowIdx} className="flex gap-4">
          {Array.from({ length: columns }).map((_, colIdx) => (
            <Skeleton key={colIdx} variant="shimmer" className="h-12 flex-1" />
          ))}
        </div>
      ))}
    </div>
  )
}

function CardSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-3 p-6 border border-slate-200 rounded-2xl bg-white">
      <Skeleton variant="shimmer" className="h-5 w-24" />
      <Skeleton variant="shimmer" className="h-8 w-32" />
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} variant="shimmer" className="h-4 w-full" />
      ))}
    </div>
  )
}

function ChartSkeleton({ height = 200 }: { height?: number }) {
  return (
    <div className="p-6 border border-slate-200 rounded-2xl bg-white">
      <Skeleton variant="shimmer" className="h-5 w-32 mb-4" />
      <div className="flex items-end gap-2" style={{ height: `${height}px` }}>
        {Array.from({ length: 12 }).map((_, i) => (
          <Skeleton
            key={i}
            variant="shimmer"
            className="flex-1 rounded-t"
            style={{ height: `${Math.random() * 60 + 40}%` }}
          />
        ))}
      </div>
    </div>
  )
}

export { Skeleton, TableSkeleton, CardSkeleton, ChartSkeleton }

