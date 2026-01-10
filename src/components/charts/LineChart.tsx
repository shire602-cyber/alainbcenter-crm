'use client'

import * as React from 'react'
import { LineChart as RechartsLineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip, Legend } from 'recharts'
import { cn } from '@/lib/utils'
import { ChartContainer } from './ChartContainer'
import { ChartTooltip } from './ChartTooltip'
import { ChartLegend } from './ChartLegend'

interface DataPoint {
  [key: string]: string | number
}

interface LineChartProps {
  data: DataPoint[]
  xKey: string
  yKeys: Array<{ key: string; name: string; color: string }>
  title?: string
  description?: string
  loading?: boolean
  error?: string | null
  height?: number
  showGrid?: boolean
  showLegend?: boolean
  className?: string
}

export function LineChart({
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
  className,
}: LineChartProps) {
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
        <RechartsLineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
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
          {yKeys.map((yKey) => (
            <Line
              key={yKey.key}
              type="monotone"
              dataKey={yKey.key}
              name={yKey.name}
              stroke={yKey.color}
              strokeWidth={2}
              dot={{ r: 4, fill: yKey.color }}
              activeDot={{ r: 6 }}
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
        </RechartsLineChart>
      </ResponsiveContainer>
    </ChartContainer>
  )
}

