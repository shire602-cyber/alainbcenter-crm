'use client'

/**
 * TOP PRIORITIES TODAY
 * Mission control view of urgent, actionable items
 * Shows revenue signals and urgency indicators
 */

import { useState, useEffect } from 'react'
import { ArrowRight, AlertCircle, Clock, MessageSquare, FileText, Phone, DollarSign, Zap } from 'lucide-react'
import { format, formatDistanceToNow } from 'date-fns'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'

interface TopPriorityItem {
  id: string
  leadId: number
  contactName: string
  title: string
  reason: string
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'
  action: {
    type: 'reply' | 'call' | 'send_quote' | 'view' | 'follow_up'
    label: string
    url: string
  }
  dueAt?: string
  revenuePotential?: number
}

export function TopPrioritiesToday() {
  const [items, setItems] = useState<TopPriorityItem[]>([])
  const [loading, setLoading] = useState(true)

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
        setItems(data.items || [])
      }
    } catch (error) {
      console.error('Failed to load items:', error)
    } finally {
      setLoading(false)
    }
  }

  function getIcon(type: string) {
    switch (type) {
      case 'reply':
        return <MessageSquare className="h-4 w-4" />
      case 'call':
        return <Phone className="h-4 w-4" />
      case 'send_quote':
        return <FileText className="h-4 w-4" />
      default:
        return <ArrowRight className="h-4 w-4" />
    }
  }

  function getPriorityStyles(priority: string, revenuePotential?: number) {
    const isHighValue = revenuePotential && revenuePotential >= 10000
    
    switch (priority) {
      case 'URGENT':
        return {
          card: 'border-red-300 dark:border-red-700 bg-gradient-to-br from-red-50 to-red-100 dark:from-red-900/30 dark:to-red-800/20',
          button: 'bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-500/20',
          badge: 'bg-red-600 text-white',
        }
      case 'HIGH':
        return {
          card: isHighValue 
            ? 'border-orange-300 dark:border-orange-700 bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-900/30 dark:to-amber-900/20 ring-2 ring-orange-200 dark:ring-orange-800'
            : 'border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-900/20',
          button: 'bg-orange-600 hover:bg-orange-700 text-white',
          badge: 'bg-orange-600 text-white',
        }
      case 'NORMAL':
        return {
          card: isHighValue
            ? 'border-blue-300 dark:border-blue-700 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/30 dark:to-indigo-900/20 ring-2 ring-blue-200 dark:ring-blue-800'
            : 'border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20',
          button: 'bg-blue-600 hover:bg-blue-700 text-white',
          badge: 'bg-blue-600 text-white',
        }
      default:
        return {
          card: 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50',
          button: 'bg-slate-600 hover:bg-slate-700 text-white',
          badge: 'bg-slate-600 text-white',
        }
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 bg-slate-100 dark:bg-slate-800 rounded-xl animate-pulse" />
        ))}
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="p-12 text-center rounded-2xl bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/10 border-2 border-green-200 dark:border-green-800">
        <div className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-green-500/10">
          <span className="text-4xl">🎉</span>
        </div>
        <p className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-2">
          All caught up!
        </p>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          No urgent priorities right now. Great work!
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {items.map((item) => {
        const styles = getPriorityStyles(item.priority, item.revenuePotential)
        const isHighValue = item.revenuePotential && item.revenuePotential >= 10000
        
        return (
          <Card
            key={item.id}
            className={cn(
              "p-4 rounded-xl border-2 transition-all hover:shadow-lg",
              styles.card
            )}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  {item.priority === 'URGENT' && (
                    <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400 flex-shrink-0 animate-pulse" />
                  )}
                  {isHighValue && (
                    <Zap className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                  )}
                  <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                    {item.title}
                  </h4>
                  {isHighValue && (
                    <Badge className="bg-amber-500 text-white text-xs px-2 py-0.5">
                      High Value
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 mb-2">
                  {item.reason}
                </p>
                {item.dueAt && (
                  <div className="flex items-center gap-1.5 mb-3">
                    <Clock className="h-3 w-3 text-slate-400" />
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {formatDistanceToNow(new Date(item.dueAt), { addSuffix: true })}
                    </span>
                  </div>
                )}
                <Link href={item.action.url}>
                  <Button
                    size="sm"
                    className={cn(
                      "w-full rounded-lg font-semibold h-9",
                      styles.button
                    )}
                  >
                    {getIcon(item.action.type)}
                    <span className="ml-2">{item.action.label}</span>
                  </Button>
                </Link>
              </div>
              {item.revenuePotential && (
                <div className="flex-shrink-0 text-right">
                  <div className="flex items-center gap-1 justify-end mb-1">
                    <DollarSign className={cn(
                      "h-3.5 w-3.5",
                      isHighValue ? "text-amber-600 dark:text-amber-400" : "text-slate-400"
                    )} />
                    <p className={cn(
                      "text-xs font-medium",
                      isHighValue ? "text-amber-600 dark:text-amber-400" : "text-slate-500 dark:text-slate-400"
                    )}>
                      Estimated Value
                    </p>
                  </div>
                  <p className={cn(
                    "text-base font-bold",
                    isHighValue ? "text-amber-700 dark:text-amber-300" : "text-slate-900 dark:text-slate-100"
                  )}>
                    AED {item.revenuePotential.toLocaleString()}
                  </p>
                </div>
              )}
            </div>
          </Card>
        )
      })}
    </div>
  )
}

