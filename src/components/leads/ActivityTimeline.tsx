'use client'

import { format, isToday, isYesterday } from 'date-fns'
import { 
  MessageSquare, 
  CheckCircle2, 
  Calendar, 
  FileText, 
  Clock,
  AlertCircle,
  User,
  Sparkles
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface ActivityItem {
  id: string
  type: 'message' | 'task' | 'status_change' | 'expiry' | 'note' | 'document'
  title: string
  description?: string
  timestamp: string
  user?: { name: string }
  channel?: string
}

interface ActivityTimelineProps {
  activities: ActivityItem[]
  className?: string
}

export function ActivityTimeline({ activities, className }: ActivityTimelineProps) {
  function formatTime(dateString: string) {
    const date = new Date(dateString)
    if (isToday(date)) {
      return `Today at ${format(date, 'HH:mm')}`
    } else if (isYesterday(date)) {
      return `Yesterday at ${format(date, 'HH:mm')}`
    } else {
      return format(date, 'MMM dd, yyyy HH:mm')
    }
  }

  function getIcon(type: ActivityItem['type']) {
    switch (type) {
      case 'message':
        return MessageSquare
      case 'task':
        return CheckCircle2
      case 'status_change':
        return AlertCircle
      case 'expiry':
        return Calendar
      case 'note':
        return FileText
      case 'document':
        return FileText
      default:
        return Clock
    }
  }

  function getColor(type: ActivityItem['type']) {
    switch (type) {
      case 'message':
        return 'text-green-600 bg-green-100'
      case 'task':
        return 'text-blue-600 bg-blue-100'
      case 'status_change':
        return 'text-purple-600 bg-purple-100'
      case 'expiry':
        return 'text-orange-600 bg-orange-100'
      case 'note':
        return 'text-gray-600 bg-gray-100'
      case 'document':
        return 'text-indigo-600 bg-indigo-100'
      default:
        return 'text-gray-600 bg-gray-100'
    }
  }

  if (activities.length === 0) {
    return (
      <div className={cn('text-center py-8 text-muted-foreground', className)}>
        <Clock className="h-12 w-12 mx-auto mb-2 opacity-50" />
        <p className="text-sm">No activity yet</p>
      </div>
    )
  }

  return (
    <div className={cn('space-y-4', className)}>
      {activities.map((activity, index) => {
        const Icon = getIcon(activity.type)
        const colorClass = getColor(activity.type)
        
        return (
          <div key={activity.id} className="flex gap-4 relative">
            {/* Timeline line */}
            {index < activities.length - 1 && (
              <div className="absolute left-4 top-12 w-0.5 h-full bg-border" />
            )}
            
            {/* Icon */}
            <div className={cn('flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center', colorClass)}>
              <Icon className="h-3.5 w-3.5" />
            </div>
            
            {/* Content */}
            <div className="flex-1 min-w-0 pb-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{activity.title}</p>
                  {activity.description && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {activity.description}
                    </p>
                  )}
                  <div className="flex items-center gap-2 mt-1">
                    {activity.user && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {activity.user.name}
                      </span>
                    )}
                    {activity.channel && (
                      <span className="text-xs text-muted-foreground">via {activity.channel}</span>
                    )}
                  </div>
                </div>
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {formatTime(activity.timestamp)}
                </span>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}


