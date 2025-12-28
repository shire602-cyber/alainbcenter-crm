'use client'

/**
 * WAITING ON CUSTOMER SECTION
 * Read-only list of items waiting for customer response
 */

import { useState, useEffect } from 'react'
import { Hourglass, Clock } from 'lucide-react'
import { format, differenceInDays } from 'date-fns'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import Link from 'next/link'

interface WaitingItem {
  id: string
  leadId: number
  contactName: string
  title: string
  reason: string
  daysWaiting?: number
}

export function WaitingOnCustomer() {
  // This would typically fetch from API
  // For now, using placeholder structure
  const [items, setItems] = useState<WaitingItem[]>([])
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
      console.error('Failed to load waiting items:', error)
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
      <div className="p-6 text-center rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800">
        <Hourglass className="h-8 w-8 text-slate-400 mx-auto mb-2" />
        <p className="text-sm text-slate-500 dark:text-slate-400">
          No items waiting on customer
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <Link
          key={item.id}
          href={`/leads/${item.leadId}`}
          className="block"
        >
          <Card className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-sm transition-all">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-orange-100 dark:bg-orange-900/20 flex items-center justify-center">
                <Hourglass className="h-5 w-5 text-orange-600 dark:text-orange-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                  {item.title}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  {item.reason}
                </p>
                {item.daysWaiting !== undefined && (
                  <div className="flex items-center gap-2 mt-2">
                    <Clock className="h-3 w-3 text-slate-400" />
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {item.daysWaiting} day{item.daysWaiting !== 1 ? 's' : ''} waiting
                    </span>
                  </div>
                )}
              </div>
            </div>
          </Card>
        </Link>
      ))}
    </div>
  )
}

