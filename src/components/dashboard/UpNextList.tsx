'use client'

/**
 * UP NEXT LIST
 * 
 * Compact list of 3 additional priority items.
 * Clicking promotes item to "Your Focus Now" (client-side state).
 */

import { useState, useEffect } from 'react'
import { ArrowUp, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

interface UpNextItem {
  id: string
  leadId: number
  contactName: string
  serviceType?: string
  reason: string
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'
  waitingTime?: string
}

interface UpNextListProps {
  onPromote?: (item: UpNextItem) => void
}

export function UpNextList({ onPromote }: UpNextListProps) {
  const [items, setItems] = useState<UpNextItem[]>([])
  const [loading, setLoading] = useState(true)
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  useEffect(() => {
    loadItems()
    const interval = setInterval(loadItems, 60000)
    return () => clearInterval(interval)
  }, [])

  async function loadItems() {
    try {
      const res = await fetch('/api/dashboard/do-this-now')
      if (res.ok) {
        const data = await res.json()
        const allItems = data.items || []
        // Skip first item (it's in YourFocusNow), take next 3
        setItems(allItems.slice(1, 4))
      }
    } catch (error) {
      console.error('Failed to load up next items:', error)
    } finally {
      setLoading(false)
    }
  }

  function handlePromote(item: UpNextItem) {
    if (onPromote) {
      onPromote(item)
    }
  }

  if (loading) {
    return (
      <Card className="p-4 rounded-xl border border-slate-200 dark:border-slate-800">
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
          ))}
        </div>
      </Card>
    )
  }

  if (items.length === 0) {
    return null
  }

  return (
    <Card className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
      <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">
        Up Next
      </h4>
      <div className="space-y-2">
        {items.map((item) => {
          const waitingTime = item.waitingTime || item.reason.match(/(\d+[hm])/)?.[0] || '—'
          
          return (
            <div
              key={item.id}
              className={cn(
                "flex items-center justify-between p-3 rounded-lg border transition-smooth cursor-pointer",
                "border-slate-200 dark:border-slate-800",
                "hover:bg-slate-50 dark:hover:bg-slate-800/50",
                "hover:border-slate-300 dark:hover:border-slate-700",
                hoveredId === item.id && "bg-slate-50 dark:bg-slate-800/50"
              )}
              onMouseEnter={() => setHoveredId(item.id)}
              onMouseLeave={() => setHoveredId(null)}
              onClick={() => handlePromote(item)}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                    {item.contactName || 'Unknown'}
                  </p>
                  {item.serviceType && (
                    <Badge variant="outline" className="text-xs">
                      {item.serviceType}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <Clock className="h-3 w-3" />
                  <span>{waitingTime}</span>
                </div>
              </div>
              {hoveredId === item.id && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 transition-smooth"
                  onClick={(e) => {
                    e.stopPropagation()
                    handlePromote(item)
                  }}
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          )
        })}
      </div>
    </Card>
  )
}

