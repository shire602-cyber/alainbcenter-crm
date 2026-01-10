'use client'

'use client'

import { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'

interface BentoCardProps {
  children: ReactNode
  className?: string
  title?: string
  icon?: ReactNode
  badge?: ReactNode
  action?: ReactNode
  colSpan?: 1 | 2 | 3 | 4
  href?: string
  selectable?: boolean
  selected?: boolean
  onSelect?: () => void
  loading?: boolean
}

export function BentoCard({ 
  children, 
  className, 
  title,
  icon,
  badge,
  action,
  colSpan = 1,
  href,
  selectable,
  selected,
  onSelect,
  loading
}: BentoCardProps) {
  const handleClick = () => {
    if (selectable && onSelect) {
      onSelect()
    }
  }

  const Content = (
    <div 
      className={cn(
        "group relative bg-white border border-slate-200/60 rounded-2xl p-6 transition-all duration-300 hover:shadow-[0_20px_60px_-12px_rgba(0,0,0,0.08)] hover:border-slate-300 hover:-translate-y-0.5 active:scale-[0.99]",
        colSpan === 2 && "md:col-span-2",
        colSpan === 3 && "md:col-span-3",
        colSpan === 4 && "md:col-span-4",
        selectable && "cursor-pointer",
        selected && "ring-2 ring-blue-500 border-blue-300 shadow-xl",
        loading && "opacity-75 pointer-events-none",
        className
      )}
      onClick={handleClick}
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
      {loading ? (
        <div className="space-y-3">
          <Skeleton variant="shimmer" className="h-4 w-24" />
          <Skeleton variant="shimmer" className="h-8 w-32" />
          <Skeleton variant="shimmer" className="h-4 w-full" />
          <Skeleton variant="shimmer" className="h-4 w-3/4" />
        </div>
      ) : (
        children
      )}
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
