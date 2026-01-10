'use client'

/**
 * DO THIS NOW SECTION
 * Max 5 items with clear CTA buttons
 * Urgent, actionable items only
 */

import { useState, useEffect } from 'react'
import { ArrowRight, AlertCircle, Clock, MessageSquare, FileText, Phone } from 'lucide-react'
import { format, formatDistanceToNow } from 'date-fns'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import Link from 'next/link'

interface DoThisNowItem {
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

export function DoThisNow() {
  const [items, setItems] = useState<DoThisNowItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadItems()
    const interval = setInterval(loadItems, 60000) // Refresh every minute
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

  function getPriorityColor(priority: string) {
    switch (priority) {
      case 'URGENT':
        return 'border-red-200 bg-red-50'
      case 'HIGH':
        return 'border-orange-200 bg-orange-50'
      case 'NORMAL':
        return 'border-blue-200 bg-blue-50'
      default:
        return 'border-slate-200 bg-slate-50'
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 bg-slate-100 rounded-xl animate-pulse" />
        ))}
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="p-8 text-center rounded-2xl bg-slate-50 border border-slate-200">
        <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
          <Clock className="h-8 w-8 text-green-600" />
        </div>
        <p className="text-sm font-semibold text-slate-900 mb-1">
          All caught up!
        </p>
        <p className="text-xs text-slate-500">
          No urgent actions required
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <Card
          key={item.id}
          className={cn(
            "p-4 rounded-xl border-2 transition-all hover:shadow-md",
            getPriorityColor(item.priority)
          )}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                {item.priority === 'URGENT' && (
                  <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0" />
                )}
                <h4 className="text-sm font-semibold text-slate-900 truncate">
                  {item.title}
                </h4>
              </div>
              <p className="text-xs text-slate-600 mb-3">
                {item.reason}
              </p>
              {item.dueAt && (
                <p className="text-xs text-slate-500 mb-3">
                  {formatDistanceToNow(new Date(item.dueAt), { addSuffix: true })}
                </p>
              )}
              <Link href={item.action.url}>
                <Button
                  size="sm"
                  className={cn(
                    "w-full rounded-lg font-semibold",
                    item.priority === 'URGENT' && "bg-red-600 hover:bg-red-700",
                    item.priority === 'HIGH' && "bg-orange-600 hover:bg-orange-700",
                    item.priority === 'NORMAL' && "bg-blue-600 hover:bg-blue-700",
                    item.priority === 'LOW' && "bg-slate-600 hover:bg-slate-700"
                  )}
                >
                  {getIcon(item.action.type)}
                  <span className="ml-2">{item.action.label}</span>
                </Button>
              </Link>
            </div>
            {item.revenuePotential && (
              <div className="flex-shrink-0 text-right">
                <p className="text-xs text-slate-500">Value</p>
                <p className="text-sm font-bold text-slate-900">
                  AED {item.revenuePotential.toLocaleString()}
                </p>
              </div>
            )}
          </div>
        </Card>
      ))}
    </div>
  )
}

