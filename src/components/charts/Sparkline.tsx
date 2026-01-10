'use client'

import * as React from 'react'
import { LineChart, Line, ResponsiveContainer, Area, AreaChart } from 'recharts'
import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'

interface SparklineProps {
  data: number[]
  color?: string
  height?: number
  variant?: 'line' | 'area' | 'bar'
  className?: string
  animated?: boolean
}

export function Sparkline({
  data,
  color = '#3b82f6',
  height = 40,
  variant = 'line',
  className,
  animated = true,
}: SparklineProps) {
  const chartData = data.map((value, index) => ({
    name: `${index}`,
    value,
  }))

  const maxValue = Math.max(...data, 1)
  const minValue = Math.min(...data, 0)

  return (
    <div className={cn('w-full', className)} style={{ height: `${height}px` }}>
      {variant === 'area' ? (
        <ResponsiveContainer width="100%" height={height}>
          <AreaChart data={chartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={`gradient-${color}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                <stop offset="95%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area
              type="monotone"
              dataKey="value"
              stroke={color}
              fill={`url(#gradient-${color})`}
              strokeWidth={1.5}
              animationDuration={animated ? 1000 : 0}
            />
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        <ResponsiveContainer width="100%" height={height}>
          <LineChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
            <Line
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={2}
              dot={false}
              animationDuration={animated ? 1000 : 0}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

