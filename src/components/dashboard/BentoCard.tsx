'use client'

import { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface BentoCardProps {
  children: ReactNode
  className?: string
  title?: string
  icon?: ReactNode
  badge?: ReactNode
  action?: ReactNode
  colSpan?: 1 | 2 | 3 | 4
  href?: string
}

export function BentoCard({ 
  children, 
  className, 
  title,
  icon,
  badge,
  action,
  colSpan = 1,
  href 
}: BentoCardProps) {
  const Content = (
    <div 
      className={cn(
        "group relative bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-xl p-4 transition-all duration-200 hover:shadow-md hover:border-slate-300 dark:hover:border-slate-700",
        colSpan === 2 && "md:col-span-2",
        colSpan === 3 && "md:col-span-3",
        colSpan === 4 && "md:col-span-4",
        className
      )}
    >
      {(title || action || badge) && (
        <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-200 dark:border-slate-800">
          {title && (
            <div className="flex items-center gap-2">
              {icon && <div className="text-slate-500 dark:text-slate-400">{icon}</div>}
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {title}
              </h3>
              {badge && <div className="text-xs">{badge}</div>}
            </div>
          )}
          {action && (
            <div className="text-xs text-slate-600 dark:text-slate-400">
              {action}
            </div>
          )}
        </div>
      )}
      {children}
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
