'use client'

import { useEffect, useState } from 'react'
import { MainLayout } from '@/components/layout/MainLayout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Bell, CheckCircle2, AlertCircle, MessageSquare, User, Sparkles, X } from 'lucide-react'
import { format, isToday, isYesterday } from 'date-fns'
import Link from 'next/link'
import { cn } from '@/lib/utils'

type Notification = {
  id: number
  type: string
  title: string
  message: string
  leadId: number | null
  conversationId: number | null
  isRead: boolean
  readAt: string | null
  createdAt: string
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    loadNotifications()
    // Poll for new notifications every 30 seconds
    const interval = setInterval(loadNotifications, 30000)
    return () => clearInterval(interval)
  }, [])

  async function loadNotifications() {
    try {
      const res = await fetch('/api/notifications')
      if (res.ok) {
        const data = await res.json()
        setNotifications(data.notifications || [])
        setUnreadCount(data.unreadCount || 0)
      }
    } catch (error) {
      console.error('Failed to load notifications:', error)
    } finally {
      setLoading(false)
    }
  }

  async function markAsRead(notificationId: number) {
    try {
      const res = await fetch(`/api/notifications/${notificationId}/read`, {
        method: 'POST',
      })
      if (res.ok) {
        loadNotifications()
      }
    } catch (error) {
      console.error('Failed to mark notification as read:', error)
    }
  }

  async function markAllAsRead() {
    try {
      const res = await fetch('/api/notifications/read-all', {
        method: 'POST',
      })
      if (res.ok) {
        loadNotifications()
      }
    } catch (error) {
      console.error('Failed to mark all as read:', error)
    }
  }

  function getNotificationIcon(type: string) {
    switch (type) {
      case 'ai_untrained':
        return <Sparkles className="h-4 w-4" />
      case 'unreplied_message':
        return <MessageSquare className="h-4 w-4" />
      case 'task_assigned':
        return <User className="h-4 w-4" />
      default:
        return <AlertCircle className="h-4 w-4" />
    }
  }

  function getNotificationColor(type: string) {
    switch (type) {
      case 'ai_untrained':
        return 'bg-purple-100 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300'
      case 'unreplied_message':
        return 'bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-300'
      case 'task_assigned':
        return 'bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
      default:
        return 'bg-gray-100 dark:bg-gray-900/20 text-gray-700 dark:text-gray-300'
    }
  }

  function formatNotificationTime(date: string) {
    const notificationDate = new Date(date)
    if (isToday(notificationDate)) {
      return format(notificationDate, 'HH:mm')
    } else if (isYesterday(notificationDate)) {
      return 'Yesterday'
    } else {
      return format(notificationDate, 'MMM d')
    }
  }

  const unreadNotifications = notifications.filter(n => !n.isRead)
  const readNotifications = notifications.filter(n => n.isRead)

  return (
    <MainLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
            <p className="text-sm text-muted-foreground">
              {unreadCount > 0 ? `${unreadCount} unread notification${unreadCount !== 1 ? 's' : ''}` : 'All caught up!'}
            </p>
          </div>
          {unreadCount > 0 && (
            <Button onClick={markAllAsRead} variant="outline" size="sm">
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Mark all as read
            </Button>
          )}
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <Card key={i} className="animate-pulse">
                <CardContent className="p-4">
                  <div className="h-4 bg-muted rounded w-3/4 mb-2" />
                  <div className="h-3 bg-muted rounded w-1/2" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : notifications.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Bell className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No notifications yet</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {unreadNotifications.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-muted-foreground mb-2">Unread</h2>
                <div className="space-y-2">
                  {unreadNotifications.map(notification => (
                    <NotificationCard
                      key={notification.id}
                      notification={notification}
                      onMarkAsRead={() => markAsRead(notification.id)}
                      getIcon={getNotificationIcon}
                      getColor={getNotificationColor}
                      formatTime={formatNotificationTime}
                    />
                  ))}
                </div>
              </div>
            )}

            {readNotifications.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-muted-foreground mb-2">Read</h2>
                <div className="space-y-2">
                  {readNotifications.map(notification => (
                    <NotificationCard
                      key={notification.id}
                      notification={notification}
                      onMarkAsRead={() => markAsRead(notification.id)}
                      getIcon={getNotificationIcon}
                      getColor={getNotificationColor}
                      formatTime={formatNotificationTime}
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

function NotificationCard({
  notification,
  onMarkAsRead,
  getIcon,
  getColor,
  formatTime,
}: {
  notification: Notification
  onMarkAsRead: () => void
  getIcon: (type: string) => JSX.Element
  getColor: (type: string) => string
  formatTime: (date: string) => string
}) {
  return (
    <Card className={cn(
      "transition-all hover:shadow-md",
      !notification.isRead && "border-l-4 border-l-primary"
    )}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className={cn(
            "flex items-center justify-center w-8 h-8 rounded-full flex-shrink-0",
            getColor(notification.type)
          )}>
            {getIcon(notification.type)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                <h3 className="text-sm font-semibold mb-1">{notification.title}</h3>
                <p className="text-sm text-muted-foreground mb-2">{notification.message}</p>
                <div className="flex items-center gap-2 flex-wrap">
                  {notification.leadId && (
                    <Link href={`/leads/${notification.leadId}`}>
                      <Button variant="ghost" size="sm" className="h-6 text-xs">
                        View Lead
                      </Button>
                    </Link>
                  )}
                  {notification.conversationId && (
                    <Link href={`/inbox?conversation=${notification.conversationId}`}>
                      <Button variant="ghost" size="sm" className="h-6 text-xs">
                        View Conversation
                      </Button>
                    </Link>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-xs text-muted-foreground">
                  {formatTime(notification.createdAt)}
                </span>
                {!notification.isRead && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={onMarkAsRead}
                    title="Mark as read"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

