'use client'

/**
 * BLOCKED BY CUSTOMER SECTION
 * Items waiting for customer response
 * Outcome-driven language
 */

import { useState, useEffect } from 'react'
import { Hourglass, Clock, AlertCircle } from 'lucide-react'
import { format, differenceInDays } from 'date-fns'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'

interface BlockedItem {
  id: string
  leadId: number
  contactName: string
  title: string
  reason: string
  daysWaiting?: number
  revenuePotential?: number
}

export function BlockedByCustomer() {
  const [items, setItems] = useState<BlockedItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadItems()
    const interval = setInterval(loadItems, 60000)
    return () => clearInterval(interval)
  }, [])

  async function loadItems() {
    try {
      const res = await fetch('/api/dashboard/waiting-on-customer')
      if (res.ok) {
        const data = await res.json()
        setItems(data.items || [])
      }
    } catch (error) {
      console.error('Failed to load blocked items:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 bg-slate-100 dark:bg-slate-800 rounded-xl animate-pulse" />
        ))}
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="p-12 text-center rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/10 border-2 border-blue-200 dark:border-blue-800">
        <div className="w-20 h-20 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-500/10">
          <Hourglass className="h-10 w-10 text-blue-600 dark:text-blue-400" />
        </div>
        <p className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-2">
          No blockers 🎯
        </p>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          All customers are engaged. Keep the momentum!
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {items.map((item) => {
        const isLongWait = item.daysWaiting && item.daysWaiting > 7
        const isHighValue = item.revenuePotential && item.revenuePotential >= 10000
        
        return (
          <Link
            key={item.id}
            href={`/leads/${item.leadId}`}
            className="block"
          >
            <Card className={cn(
              "p-4 rounded-xl border-2 transition-all hover:shadow-md",
              isLongWait 
                ? "border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-900/20"
                : "border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700"
            )}>
              <div className="flex items-start gap-3">
                <div className={cn(
                  "flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center",
                  isLongWait 
                    ? "bg-orange-100 dark:bg-orange-900/30"
                    : "bg-slate-100 dark:bg-slate-800"
                )}>
                  <Hourglass className={cn(
                    "h-5 w-5",
                    isLongWait 
                      ? "text-orange-600 dark:text-orange-400"
                      : "text-slate-400"
                  )} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {item.title}
                    </p>
                    {isHighValue && (
                      <Badge className="bg-amber-500 text-white text-xs px-2 py-0.5">
                        High Value
                      </Badge>
                    )}
                    {isLongWait && (
                      <Badge variant="destructive" className="text-xs">
                        Long Wait
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mb-2">
                    {item.reason}
                  </p>
                  {item.daysWaiting !== undefined && (
                    <div className="flex items-center gap-2">
                      <Clock className="h-3 w-3 text-slate-400" />
                      <span className={cn(
                        "text-xs font-medium",
                        isLongWait 
                          ? "text-orange-600 dark:text-orange-400"
                          : "text-slate-500 dark:text-slate-400"
                      )}>
                        Blocked for {item.daysWaiting} day{item.daysWaiting !== 1 ? 's' : ''}
                      </span>
                    </div>
                  )}
                  {item.revenuePotential && (
                    <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-700">
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Potential value: <span className={cn(
                          "font-semibold",
                          isHighValue ? "text-amber-600 dark:text-amber-400" : "text-slate-700 dark:text-slate-300"
                        )}>
                          AED {item.revenuePotential.toLocaleString()}
                        </span>
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          </Link>
        )
      })}
    </div>
  )
}

