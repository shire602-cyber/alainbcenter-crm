'use client'

import * as React from 'react'
import { AreaChart as RechartsAreaChart, Area, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip, Legend } from 'recharts'
import { cn } from '@/lib/utils'
import { ChartContainer } from './ChartContainer'
import { ChartTooltip } from './ChartTooltip'
import { ChartLegend } from './ChartLegend'

interface DataPoint {
  [key: string]: string | number
}

interface AreaChartProps {
  data: DataPoint[]
  xKey: string
  yKeys: Array<{ key: string; name: string; color: string; gradientFrom?: string }>
  title?: string
  description?: string
  loading?: boolean
  error?: string | null
  height?: number
  showGrid?: boolean
  showLegend?: boolean
  stacked?: boolean
  className?: string
}

export function AreaChart({
  data,
  xKey,
  yKeys,
  title,
  description,
  loading,
  error,
  height = 300,
  showGrid = true,
  showLegend = true,
  stacked = false,
  className,
}: AreaChartProps) {
  const [hiddenItems, setHiddenItems] = React.useState<Set<string>>(new Set())

  const toggleItem = (name: string) => {
    setHiddenItems((prev) => {
      const next = new Set(prev)
      if (next.has(name)) {
        next.delete(name)
      } else {
        next.add(name)
      }
      return next
    })
  }

  const legendItems = yKeys.map((yKey) => ({
    name: yKey.name,
    color: yKey.color,
  }))

  return (
    <ChartContainer
      title={title}
      description={description}
      loading={loading}
      error={error}
      height={height}
      className={className}
    >
      <ResponsiveContainer width="100%" height={height}>
        <RechartsAreaChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
          <defs>
            {yKeys.map((yKey) => (
              <linearGradient key={yKey.key} id={`gradient-${yKey.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={yKey.color} stopOpacity={0.3} />
                <stop offset="95%" stopColor={yKey.color} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          {showGrid && <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />}
          <XAxis
            dataKey={xKey}
            stroke="#64748b"
            fontSize={12}
            tickLine={false}
            axisLine={false}
            className="text-caption"
          />
          <YAxis
            stroke="#64748b"
            fontSize={12}
            tickLine={false}
            axisLine={false}
            className="text-caption"
          />
          <Tooltip content={<ChartTooltip />} />
          {yKeys.map((yKey, index) => (
            <Area
              key={yKey.key}
              type="monotone"
              dataKey={yKey.key}
              name={yKey.name}
              stroke={yKey.color}
              fill={`url(#gradient-${yKey.key})`}
              strokeWidth={2}
              stackId={stacked ? 'stack' : undefined}
              hide={hiddenItems.has(yKey.name)}
              animationDuration={500}
            />
          ))}
          {showLegend && (
            <Legend
              content={
                <ChartLegend
                  items={legendItems}
                  onToggle={toggleItem}
                  hiddenItems={hiddenItems}
                />
              }
            />
          )}
        </RechartsAreaChart>
      </ResponsiveContainer>
    </ChartContainer>
  )
}

