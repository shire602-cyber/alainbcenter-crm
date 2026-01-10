'use client'

/**
 * NOTIFICATIONS PAGE
 * Actionable notifications only
 * Deduplicated, snoozable, auto-expiring
 */

import { useState, useEffect } from 'react'
import { MainLayout } from '@/components/layout/MainLayout'
import { NotificationCard } from '@/components/notifications/NotificationCard'
import { CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

interface ActionableNotification {
  id: number
  type: 'sla_breach_imminent' | 'customer_reply' | 'quote_ready' | 'deadline_today'
  title: string
  message: string
  leadId?: number
  conversationId?: number
  actionUrl: string
  actionLabel: string
  createdAt: string
  isRead: boolean
  count?: number
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<ActionableNotification[]>([])
  const [loading, setLoading] = useState(true)
  const [snoozedIds, setSnoozedIds] = useState<Set<number>>(new Set())

  useEffect(() => {
    loadNotifications()
    const interval = setInterval(loadNotifications, 30000)
    return () => clearInterval(interval)
  }, [])

  async function loadNotifications() {
    try {
      const res = await fetch('/api/notifications')
      if (res.ok) {
        const data = await res.json()
        const now = new Date()
        const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
        
        // Filter to only actionable notifications, within 24h, not snoozed, and deduplicate
        const actionable = (data.notifications || [])
          .filter((n: any) => {
            const createdAt = new Date(n.createdAt)
            const isSnoozed = n.snoozedUntil && new Date(n.snoozedUntil) > now
            return (
              ['sla_breach_imminent', 'customer_reply', 'quote_ready', 'deadline_today'].includes(n.type) &&
              !n.isRead &&
              !snoozedIds.has(n.id) &&
              !isSnoozed &&
              createdAt >= twentyFourHoursAgo // Only show notifications from last 24 hours
            )
          })
          .map((n: any) => ({
            ...n,
            actionUrl: n.leadId ? `/leads/${n.leadId}` : '/leads',
            actionLabel: getActionLabel(n.type),
          }))
        
        // Deduplicate by type + leadId (keep most recent, track count)
        const seen = new Map<string, ActionableNotification & { count: number }>()
        for (const notif of actionable) {
          const key = `${notif.type}_${notif.leadId || 0}`
          if (!seen.has(key)) {
            seen.set(key, { ...notif, count: 1 })
          } else {
            const existing = seen.get(key)!
            if (new Date(notif.createdAt) > new Date(existing.createdAt)) {
              seen.set(key, { ...notif, count: existing.count + 1 })
            } else {
              existing.count += 1
            }
          }
        }
        
        // Group by Today/Yesterday
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        const yesterday = new Date(today)
        yesterday.setDate(yesterday.getDate() - 1)
        
        const grouped = {
          today: [] as (ActionableNotification & { count: number })[],
          yesterday: [] as (ActionableNotification & { count: number })[],
        }
        
        for (const notif of seen.values()) {
          const createdAt = new Date(notif.createdAt)
          if (createdAt >= today) {
            grouped.today.push(notif)
          } else if (createdAt >= yesterday) {
            grouped.yesterday.push(notif)
          }
        }
        
        // Sort by priority (URGENT first) then by date
        const priorityOrder: Record<string, number> = {
          sla_breach_imminent: 3,
          customer_reply: 2,
          quote_ready: 1,
          deadline_today: 0,
        }
        
        grouped.today.sort((a, b) => {
          const priorityDiff = (priorityOrder[b.type] || 0) - (priorityOrder[a.type] || 0)
          if (priorityDiff !== 0) return priorityDiff
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        })
        
        grouped.yesterday.sort((a, b) => {
          const priorityDiff = (priorityOrder[b.type] || 0) - (priorityOrder[a.type] || 0)
          if (priorityDiff !== 0) return priorityDiff
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        })
        
        setNotifications([...grouped.today, ...grouped.yesterday])
      }
    } catch (error) {
      console.error('Failed to load notifications:', error)
    } finally {
      setLoading(false)
    }
  }

  function getActionLabel(type: string): string {
    switch (type) {
      case 'sla_breach_imminent':
        return 'Reply Now'
      case 'customer_reply':
        return 'View Conversation'
      case 'quote_ready':
        return 'Send Quote'
      case 'deadline_today':
        return 'View Lead'
      default:
        return 'View'
    }
  }

  async function handleDismiss(id: number) {
    try {
      await fetch(`/api/notifications/${id}/read`, {
        method: 'POST',
      })
      setNotifications(prev => prev.filter(n => n.id !== id))
    } catch (error) {
      console.error('Failed to dismiss notification:', error)
    }
  }

  async function handleSnooze(id: number, minutes: number) {
    try {
      // Persist snooze to database
      await fetch(`/api/notifications/${id}/snooze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ minutes }),
      })
      
      // Optimistically update UI
      setSnoozedIds(prev => new Set(prev).add(id))
      setNotifications(prev => prev.filter(n => n.id !== id))
      
      // Reload after snooze period to show notification again
      setTimeout(() => {
        loadNotifications()
      }, minutes * 60 * 1000)
    } catch (error) {
      console.error('Failed to snooze notification:', error)
    }
  }

  function handleAction(url: string) {
    window.location.href = url
  }

  async function markAllAsRead() {
    try {
      await fetch('/api/notifications/read-all', {
        method: 'POST',
      })
      setNotifications([])
    } catch (error) {
      console.error('Failed to mark all as read:', error)
    }
  }

  // Auto-expire old notifications (older than 24 hours)
  useEffect(() => {
    const now = new Date()
    setNotifications(prev => 
      prev.filter(n => {
        const age = now.getTime() - new Date(n.createdAt).getTime()
        return age < 24 * 60 * 60 * 1000 // 24 hours
      })
    )
  }, [])

  if (loading) {
    return (
      <MainLayout>
        <div className="p-6 max-w-4xl mx-auto">
          <div className="mb-6">
            <Skeleton className="h-8 w-48 mb-2" />
            <Skeleton className="h-4 w-32" />
          </div>
          <div className="space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i} className="card-premium p-5">
                <div className="flex items-start gap-4">
                  <Skeleton className="h-10 w-10 rounded-[12px] flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-5 w-3/4" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-2/3" />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </MainLayout>
    )
  }

  return (
    <MainLayout>
      <div className="p-6 max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-heading text-slate-900">
              Notifications
            </h1>
            <p className="text-meta muted-text mt-1">
              {notifications.length} actionable {notifications.length === 1 ? 'item' : 'items'}
            </p>
          </div>
          {notifications.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={markAllAsRead}
              className="rounded-[12px] border-slate-200/60"
            >
              Mark all as read
            </Button>
          )}
        </div>

        {notifications.length === 0 ? (
          <Card className="card-premium p-12 text-center">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>
            <p className="text-heading text-slate-900 mb-2">
              All caught up
            </p>
            <p className="text-body muted-text">
              No actionable notifications right now
            </p>
          </Card>
        ) : (
          <div className="space-y-6">
            {notifications.filter(n => {
              const createdAt = new Date(n.createdAt)
              const today = new Date()
              today.setHours(0, 0, 0, 0)
              return createdAt >= today
            }).length > 0 && (
              <div>
                <h2 className="text-body font-semibold text-slate-900 mb-4">
                  Today
                </h2>
                <div className="space-y-3">
                  {notifications.filter(n => {
                    const createdAt = new Date(n.createdAt)
                    const today = new Date()
                    today.setHours(0, 0, 0, 0)
                    return createdAt >= today
                  }).map((notification) => (
                    <NotificationCard
                      key={notification.id}
                      notification={notification}
                      onDismiss={handleDismiss}
                      onSnooze={handleSnooze}
                      onAction={handleAction}
                    />
                  ))}
                </div>
              </div>
            )}
            
            {notifications.filter(n => {
              const createdAt = new Date(n.createdAt)
              const today = new Date()
              today.setHours(0, 0, 0, 0)
              const yesterday = new Date(today)
              yesterday.setDate(yesterday.getDate() - 1)
              return createdAt >= yesterday && createdAt < today
            }).length > 0 && (
              <div>
                <h2 className="text-body font-semibold text-slate-900 mb-4">
                  Yesterday
                </h2>
                <div className="space-y-3">
                  {notifications.filter(n => {
                    const createdAt = new Date(n.createdAt)
                    const today = new Date()
                    today.setHours(0, 0, 0, 0)
                    const yesterday = new Date(today)
                    yesterday.setDate(yesterday.getDate() - 1)
                    return createdAt >= yesterday && createdAt < today
                  }).map((notification) => (
                    <NotificationCard
                      key={notification.id}
                      notification={notification}
                      onDismiss={handleDismiss}
                      onSnooze={handleSnooze}
                      onAction={handleAction}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </MainLayout>
  )
}
