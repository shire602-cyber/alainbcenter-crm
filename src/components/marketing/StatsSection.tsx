/**
 * Stats/Numbers Section Component
 * Showcase key metrics and achievements
 */

'use client'

import { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Stat {
  icon: LucideIcon
  value: string
  label: string
  description?: string
}

interface StatsSectionProps {
  stats: Stat[]
  className?: string
}

export function StatsSection({ stats, className }: StatsSectionProps) {
  return (
    <section className={cn('py-16 bg-gradient-to-b from-white to-gray-50 dark:from-gray-900 dark:to-gray-950', className)}>
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {stats.map((stat, idx) => {
            const Icon = stat.icon
            return (
              <div key={idx} className="text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/30 mb-4">
                  <Icon className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="text-4xl font-bold mb-2 bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400 bg-clip-text text-transparent">
                  {stat.value}
                </div>
                <div className="text-lg font-semibold mb-1">{stat.label}</div>
                {stat.description && (
                  <div className="text-sm text-gray-600 dark:text-gray-400">{stat.description}</div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}











