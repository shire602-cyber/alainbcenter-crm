'use client'

import * as React from 'react'
import { PieChart as RechartsPieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts'
import { cn } from '@/lib/utils'
import { ChartContainer } from './ChartContainer'
import { ChartTooltip } from './ChartTooltip'
import { ChartLegend } from './ChartLegend'

interface DataPoint {
  name: string
  value: number
  color?: string
}

interface PieChartProps {
  data: DataPoint[]
  title?: string
  description?: string
  loading?: boolean
  error?: string | null
  height?: number
  showLegend?: boolean
  innerRadius?: number
  outerRadius?: number
  className?: string
}

const COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899']

export function PieChart({
  data,
  title,
  description,
  loading,
  error,
  height = 300,
  showLegend = true,
  innerRadius = 0,
  outerRadius = 80,
  className,
}: PieChartProps) {
  const chartData = data.map((item, index) => ({
    ...item,
    color: item.color || COLORS[index % COLORS.length],
  }))

  const legendItems = chartData.map((item) => ({
    name: item.name,
    color: item.color,
    value: item.value,
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
      <div className="flex items-center justify-center">
        <ResponsiveContainer width="100%" height={height}>
          <RechartsPieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
              outerRadius={outerRadius}
              innerRadius={innerRadius}
              fill="#8884d8"
              dataKey="value"
              animationDuration={500}
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip formatter={(value) => [value.toLocaleString(), '']} />} />
            {showLegend && (
              <Legend
                content={<ChartLegend items={legendItems} showValues />}
              />
            )}
          </RechartsPieChart>
        </ResponsiveContainer>
      </div>
    </ChartContainer>
  )
}

