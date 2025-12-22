'use client'

import { ReactNode } from 'react'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'

interface KPICardProps {
  title: string
  value: string | number
  trend?: {
    value: number
    period: string
  }
  icon?: ReactNode
  sparkline?: number[]
  className?: string
  href?: string
}

export function KPICard({ 
  title, 
  value, 
  trend, 
  icon, 
  sparkline,
  className,
  href 
}: KPICardProps) {
  const Content = (
    <div 
      className={cn(
        "group relative bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-xl p-4 transition-all duration-200 hover:shadow-md hover:border-slate-300 dark:hover:border-slate-700 hover:-translate-y-0.5",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <span className="text-xs font-medium text-slate-600 dark:text-slate-400 uppercase tracking-wide">
          {title}
        </span>
        {icon && (
          <div className="text-slate-400 dark:text-slate-600 group-hover:text-slate-600 dark:group-hover:text-slate-400 transition-colors">
            {icon}
          </div>
        )}
      </div>

      {/* Value */}
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <span className="text-2xl font-semibold text-slate-900 dark:text-slate-100 tracking-tight">
          {typeof value === 'number' ? value.toLocaleString() : value}
        </span>
        
        {/* Trend Indicator */}
        {trend && (
          <div className={cn(
            "flex items-center gap-0.5 text-xs font-medium px-1.5 py-0.5 rounded",
            trend.value > 0 && "text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20",
            trend.value < 0 && "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20",
            trend.value === 0 && "text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800"
          )}>
            {trend.value > 0 && <TrendingUp className="h-3 w-3" />}
            {trend.value < 0 && <TrendingDown className="h-3 w-3" />}
            {trend.value === 0 && <Minus className="h-3 w-3" />}
            <span>{Math.abs(trend.value)}%</span>
          </div>
        )}
      </div>

      {/* Sparkline */}
      {sparkline && sparkline.length > 0 && (
        <div className="h-8 mt-2 flex items-end gap-px">
          {sparkline.map((height, idx) => (
            <div
              key={idx}
              className="flex-1 bg-primary/60 dark:bg-primary/40 rounded-t transition-all duration-300 hover:bg-primary dark:hover:bg-primary/60"
              style={{ height: `${Math.max(20, (height / Math.max(...sparkline)) * 100)}%` }}
            />
          ))}
        </div>
      )}

      {/* Period label */}
      {trend?.period && (
        <span className="text-xs text-slate-500 dark:text-slate-400 mt-1 block">
          {trend.period}
        </span>
      )}
    </div>
  )

  if (href) {
    return (
      <a href={href} className="block">
        {Content}
      </a>
    )
  }

  return Content
}

