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
        "group relative bg-white border border-slate-200/60 rounded-2xl p-6 transition-all duration-300 hover:shadow-[0_20px_60px_-12px_rgba(0,0,0,0.08)] hover:border-slate-300 hover:-translate-y-0.5",
        colSpan === 2 && "md:col-span-2",
        colSpan === 3 && "md:col-span-3",
        colSpan === 4 && "md:col-span-4",
        className
      )}
    >
      {(title || action || badge) && (
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-200/60">
          {title && (
            <div className="flex items-center gap-2.5">
              {icon && <div className="text-slate-600">{icon}</div>}
              <h3 className="text-sm font-bold text-slate-900 tracking-tight">
                {title}
              </h3>
              {badge && <div className="text-xs">{badge}</div>}
            </div>
          )}
          {action && (
            <div className="text-xs text-slate-600 font-medium">
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
