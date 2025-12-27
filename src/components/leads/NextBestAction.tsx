'use client'

/**
 * Next Best Action Component
 * Shows single recommended action for the lead
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { 
  MessageSquare, 
  Phone, 
  Calendar, 
  CheckCircle2, 
  AlertCircle,
  ArrowRight,
  Sparkles,
  Loader2
} from 'lucide-react'
import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'

interface NextBestActionProps {
  leadId: number
  className?: string
}

interface NextAction {
  action: string
  priority: 'high' | 'medium' | 'low'
  type: 'reply' | 'call' | 'followup' | 'task' | 'other'
  reason?: string
}

export function NextBestAction({ leadId, className }: NextBestActionProps) {
  const [action, setAction] = useState<NextAction | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadNextAction()
  }, [leadId])

  async function loadNextAction() {
    try {
      setLoading(true)
      setError(null)
      
      const res = await fetch(`/api/leads/${leadId}/ai/next-action`, {
        method: 'POST',
      })
      
      if (res.ok) {
        const data = await res.json()
        
        // Parse the action from the response
        if (data.actions && data.actions.length > 0) {
          const actionText = data.actions[0]
          
          // Determine type and priority
          let type: NextAction['type'] = 'other'
          let priority: NextAction['priority'] = 'medium'
          
          if (actionText.toLowerCase().includes('reply')) {
            type = 'reply'
            priority = actionText.toLowerCase().includes('urgent') ? 'high' : 'medium'
          } else if (actionText.toLowerCase().includes('call')) {
            type = 'call'
            priority = 'high'
          } else if (actionText.toLowerCase().includes('follow-up') || actionText.toLowerCase().includes('followup')) {
            type = 'followup'
            priority = actionText.toLowerCase().includes('overdue') ? 'high' : 'medium'
          } else if (actionText.toLowerCase().includes('task')) {
            type = 'task'
            priority = 'medium'
          }
          
          setAction({
            action: actionText,
            priority,
            type,
            reason: data.reason,
          })
        } else {
          setAction({
            action: 'No urgent actions required',
            priority: 'low',
            type: 'other',
          })
        }
      } else {
        setError('Failed to load next action')
      }
    } catch (err: any) {
      console.error('Failed to load next action:', err)
      setError(err.message || 'Failed to load next action')
    } finally {
      setLoading(false)
    }
  }

  const getActionIcon = (type: NextAction['type']) => {
    switch (type) {
      case 'reply':
        return <MessageSquare className="h-5 w-5" />
      case 'call':
        return <Phone className="h-5 w-5" />
      case 'followup':
        return <Calendar className="h-5 w-5" />
      case 'task':
        return <CheckCircle2 className="h-5 w-5" />
      default:
        return <Sparkles className="h-5 w-5" />
    }
  }

  const getPriorityColor = (priority: NextAction['priority']) => {
    switch (priority) {
      case 'high':
        return 'border-red-200 bg-red-50'
      case 'medium':
        return 'border-yellow-200 bg-yellow-50'
      case 'low':
        return 'border-blue-200 bg-blue-50'
    }
  }

  const getPriorityBadge = (priority: NextAction['priority']) => {
    switch (priority) {
      case 'high':
        return <Badge variant="destructive" className="text-xs">High Priority</Badge>
      case 'medium':
        return <Badge variant="outline" className="text-xs bg-yellow-50 text-yellow-700 border-yellow-200">Medium</Badge>
      case 'low':
        return <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">Low</Badge>
    }
  }

  if (loading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            Next Best Action
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-red-600" />
            Next Best Action
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button 
            variant="outline" 
            size="sm" 
            className="mt-2"
            onClick={loadNextAction}
          >
            Retry
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (!action) {
    return null
  }

  return (
    <Card className={cn(className, getPriorityColor(action.priority))}>
      <CardHeader>
        <CardTitle className="text-sm font-medium flex items-center justify-between">
          <div className="flex items-center gap-2">
            {getActionIcon(action.type)}
            <span>Next Best Action</span>
          </div>
          {getPriorityBadge(action.priority)}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <p className="text-sm font-medium">{action.action}</p>
          {action.reason && (
            <p className="text-xs text-muted-foreground">{action.reason}</p>
          )}
          <div className="flex items-center gap-2 pt-2">
            <Button 
              size="sm" 
              variant={action.priority === 'high' ? 'default' : 'outline'}
              className="flex-1"
            >
              <span>Take Action</span>
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
            <Button 
              size="sm" 
              variant="ghost"
              onClick={loadNextAction}
            >
              <Sparkles className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

