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
        "group relative bg-white border border-slate-200/60 rounded-2xl p-6 transition-all duration-300 hover:shadow-[0_20px_60px_-12px_rgba(0,0,0,0.08)] hover:border-slate-300 hover:-translate-y-0.5",
        "shadow-lg",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
          {title}
        </span>
        {icon && (
          <div className="text-slate-600 group-hover:text-slate-900 transition-colors p-2.5 rounded-xl bg-slate-100">
            {icon}
          </div>
        )}
      </div>

      {/* Value */}
      <div className="flex items-baseline justify-between gap-2 mb-3">
        <span className="text-3xl font-bold text-slate-900 tracking-tight">
          {typeof value === 'number' ? value.toLocaleString() : value}
        </span>
        
        {/* Trend Indicator */}
        {trend && (
          <div className={cn(
            "flex items-center gap-0.5 text-xs font-semibold px-2 py-1 rounded-lg",
            trend.value > 0 && "text-green-700 bg-green-50",
            trend.value < 0 && "text-red-700 bg-red-50",
            trend.value === 0 && "text-slate-600 bg-slate-100"
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
        <div className="h-12 mt-4 flex items-end gap-1">
          {sparkline.map((height, idx) => (
            <div
              key={idx}
              className="flex-1 bg-slate-900 rounded-t-md transition-all duration-300 hover:bg-slate-800"
              style={{ height: `${Math.max(20, (height / Math.max(...sparkline)) * 100)}%` }}
            />
          ))}
        </div>
      )}

      {/* Period label */}
      {trend?.period && (
        <span className="text-xs text-slate-500 mt-2 block font-medium">
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

