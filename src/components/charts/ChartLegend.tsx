'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { Check } from 'lucide-react'

interface LegendItem {
  name: string
  color: string
  value?: number | string
}

interface ChartLegendProps {
  items: LegendItem[]
  onToggle?: (name: string) => void
  hiddenItems?: Set<string>
  showValues?: boolean
  className?: string
}

export function ChartLegend({
  items,
  onToggle,
  hiddenItems = new Set(),
  showValues = false,
  className,
}: ChartLegendProps) {
  return (
    <div className={cn('flex flex-wrap items-center gap-4', className)}>
      {items.map((item) => {
        const isHidden = hiddenItems.has(item.name)

        return (
          <button
            key={item.name}
            onClick={() => onToggle?.(item.name)}
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all duration-200',
              onToggle && 'hover:bg-slate-100 cursor-pointer',
              isHidden && 'opacity-50'
            )}
            disabled={!onToggle}
          >
            <div className="relative flex items-center gap-2">
              <div
                className={cn(
                  'h-3 w-3 rounded-full flex-shrink-0',
                  isHidden && 'bg-slate-300'
                )}
                style={!isHidden ? { backgroundColor: item.color } : {}}
              />
              {onToggle && !isHidden && (
                <Check className="absolute -top-0.5 -right-0.5 h-2 w-2 text-white bg-slate-900 rounded-full" />
              )}
            </div>
            <span className="text-caption text-slate-700 font-medium">{item.name}</span>
            {showValues && item.value && (
              <span className="text-caption text-slate-500">
                {typeof item.value === 'number' ? item.value.toLocaleString() : item.value}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

