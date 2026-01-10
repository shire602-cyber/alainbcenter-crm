'use client'

import * as React from 'react'
import { PieChart as RechartsPieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { cn } from '@/lib/utils'
import { ChartContainer } from './ChartContainer'
import { ChartTooltip } from './ChartTooltip'

interface GaugeChartProps {
  value: number
  max?: number
  title?: string
  description?: string
  loading?: boolean
  error?: string | null
  height?: number
  color?: string
  className?: string
}

const COLORS = {
  success: '#10b981',
  warning: '#f59e0b',
  error: '#ef4444',
  info: '#3b82f6',
}

export function GaugeChart({
  value,
  max = 100,
  title,
  description,
  loading,
  error,
  height = 200,
  color,
  className,
}: GaugeChartProps) {
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100)
  
  // Determine color based on percentage
  const gaugeColor = color || 
    (percentage >= 70 ? COLORS.success :
     percentage >= 40 ? COLORS.warning :
     COLORS.error)

  // Create data for semi-circle gauge
  const data = [
    { name: 'value', value: percentage, fill: gaugeColor },
    { name: 'remaining', value: 100 - percentage, fill: '#e2e8f0' },
  ]

  return (
    <ChartContainer
      title={title}
      description={description}
      loading={loading}
      error={error}
      height={height}
      className={cn('relative', className)}
    >
      <div className="relative flex flex-col items-center justify-center w-full" style={{ height: `${height}px` }}>
        <ResponsiveContainer width="100%" height={height}>
          <RechartsPieChart>
            <Pie
              data={data}
              cx="50%"
              cy="90%"
              startAngle={180}
              endAngle={0}
              innerRadius={60}
              outerRadius={80}
              paddingAngle={0}
              dataKey="value"
              animationDuration={1000}
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.fill} />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip />} />
          </RechartsPieChart>
        </ResponsiveContainer>
        <div className="absolute bottom-4 text-center">
          <div className="text-display font-bold" style={{ color: gaugeColor }}>
            {percentage.toFixed(0)}%
          </div>
          {value !== undefined && (
            <div className="text-caption text-slate-600 mt-1">
              {value.toLocaleString()} / {max.toLocaleString()}
            </div>
          )}
        </div>
      </div>
    </ChartContainer>
  )
}

