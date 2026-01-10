'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

interface ChartTooltipProps {
  active?: boolean
  payload?: Array<{
    name?: string
    value?: number | string
    color?: string
    dataKey?: string
  }>
  label?: string
  formatter?: (value: number | string, name?: string) => [string, string]
}

export function ChartTooltip({ active, payload, label, formatter }: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) {
    return null
  }

  return (
    <div className="rounded-xl border border-slate-200/60 bg-white p-3 shadow-lg">
      {label && (
        <p className="text-body font-semibold text-slate-900 mb-2">{label}</p>
      )}
      <div className="space-y-1">
        {payload.map((item, index) => {
          const [formattedValue, formattedName] = formatter
            ? formatter(item.value || 0, item.name)
            : [item.value?.toLocaleString() || '0', item.name || '']

          return (
            <div key={index} className="flex items-center gap-2">
              <div
                className="h-3 w-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: item.color || '#64748b' }}
              />
              <span className="text-caption text-slate-600">{formattedName}:</span>
              <span className="text-body font-semibold text-slate-900">{formattedValue}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

