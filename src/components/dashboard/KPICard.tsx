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
        "group relative bg-gradient-to-br from-white to-blue-50/30 dark:from-slate-900 dark:to-blue-950/20 border-2 border-blue-100 dark:border-blue-900/50 rounded-2xl p-5 transition-all duration-300 hover:shadow-xl hover:border-blue-300 dark:hover:border-blue-700 hover:-translate-y-1 hover:scale-[1.02]",
        "shadow-lg hover:shadow-2xl",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <span className="text-xs font-bold text-blue-700 dark:text-blue-300 uppercase tracking-wider">
          {title}
        </span>
        {icon && (
          <div className="text-blue-500 dark:text-blue-400 group-hover:text-blue-600 dark:group-hover:text-blue-300 transition-colors p-2 rounded-lg bg-blue-100/50 dark:bg-blue-900/30">
            {icon}
          </div>
        )}
      </div>

      {/* Value */}
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <span className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-400 bg-clip-text text-transparent tracking-tight">
          {typeof value === 'number' ? value.toLocaleString() : value}
        </span>
        
        {/* Trend Indicator */}
        {trend && (
          <div className={cn(
            "flex items-center gap-0.5 text-xs font-medium px-1.5 py-0.5 rounded",
            trend.value > 0 && "text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20",
            trend.value < 0 && "text-red-600 dark:text-red-400 bg-slate-100 dark:bg-slate-800",
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
        <div className="h-10 mt-3 flex items-end gap-1">
          {sparkline.map((height, idx) => (
            <div
              key={idx}
              className="flex-1 bg-gradient-to-t from-blue-500 to-purple-500 dark:from-blue-400 dark:to-purple-400 rounded-t-md transition-all duration-300 hover:from-blue-600 hover:to-purple-600 dark:hover:from-blue-300 dark:hover:to-purple-300 shadow-sm"
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

