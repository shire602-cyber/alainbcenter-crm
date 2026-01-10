'use client'

/**
 * COMMAND CENTER ACTION
 * Visually dominant next best action
 * Dims secondary panels when action is pending
 */

import { Zap, AlertCircle, Clock, ArrowRight } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

interface CommandCenterActionProps {
  action: {
    type: 'reply' | 'call' | 'quote' | 'follow_up' | 'qualify'
    label: string
    reason: string
    urgency: 'low' | 'normal' | 'high' | 'urgent'
  }
  urgencyIndicators?: {
    timeWaiting?: string
    slaRisk?: 'none' | 'low' | 'medium' | 'high'
  }
  onAction: () => void
}

export function CommandCenterAction({ action, urgencyIndicators, onAction }: CommandCenterActionProps) {
  const getUrgencyStyles = (urgency: string) => {
    switch (urgency) {
      case 'urgent':
        return {
          card: 'border-red-500/50 bg-gradient-to-br from-red-50 to-red-100 shadow-lg shadow-red-500/10',
          button: 'bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-500/30',
          icon: 'text-red-600',
          pulse: 'animate-pulse',
        }
      case 'high':
        return {
          card: 'border-orange-500/50 bg-gradient-to-br from-orange-50 to-orange-100 shadow-lg shadow-orange-500/10',
          button: 'bg-orange-600 hover:bg-orange-700 text-white shadow-lg shadow-orange-500/30',
          icon: 'text-orange-600',
          pulse: '',
        }
      case 'normal':
        return {
          card: 'border-blue-500/50 bg-gradient-to-br from-blue-50 to-blue-100 shadow-md shadow-blue-500/10',
          button: 'bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/20',
          icon: 'text-blue-600',
          pulse: '',
        }
      default:
        return {
          card: 'border-slate-300 bg-gradient-to-br from-slate-50 to-slate-100 shadow-sm',
          button: 'bg-slate-600 hover:bg-slate-700 text-white',
          icon: 'text-slate-600',
          pulse: '',
        }
    }
  }

  const styles = getUrgencyStyles(action.urgency)

  return (
    <Card className={cn(
      "p-6 rounded-2xl border-2 transition-all",
      styles.card,
      styles.pulse
    )}>
      <div className="flex items-start gap-4 mb-4">
        <div className={cn(
          "flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center",
          styles.icon,
          "bg-white/50"
        )}>
          <Zap className="h-6 w-6" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-bold text-slate-900 mb-1">
            {action.label}
          </h3>
          <p className="text-sm text-slate-700 mb-2">
            {action.reason}
          </p>
          
          {/* Urgency Indicators */}
          {urgencyIndicators && (
            <div className="flex items-center gap-4 mt-3">
              {urgencyIndicators.timeWaiting && (
                <div className="flex items-center gap-1.5 text-xs text-slate-600">
                  <Clock className="h-3.5 w-3.5" />
                  <span>{urgencyIndicators.timeWaiting}</span>
                </div>
              )}
              {urgencyIndicators.slaRisk && urgencyIndicators.slaRisk !== 'none' && (
                <div className="flex items-center gap-1.5 text-xs">
                  <AlertCircle className={cn(
                    "h-3.5 w-3.5",
                    urgencyIndicators.slaRisk === 'high' && "text-red-600",
                    urgencyIndicators.slaRisk === 'medium' && "text-orange-600",
                    urgencyIndicators.slaRisk === 'low' && "text-yellow-600"
                  )} />
                  <span className={cn(
                    urgencyIndicators.slaRisk === 'high' && "text-red-600 font-medium",
                    urgencyIndicators.slaRisk === 'medium' && "text-orange-600",
                    urgencyIndicators.slaRisk === 'low' && "text-yellow-600"
                  )}>
                    {urgencyIndicators.slaRisk === 'high' && 'SLA at risk'}
                    {urgencyIndicators.slaRisk === 'medium' && 'SLA warning'}
                    {urgencyIndicators.slaRisk === 'low' && 'SLA monitoring'}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      
      <Button
        onClick={onAction}
        size="lg"
        className={cn(
          "w-full rounded-xl h-14 text-base font-bold shadow-lg transition-all hover:scale-[1.02]",
          styles.button
        )}
      >
        <span>{action.label}</span>
        <ArrowRight className="h-5 w-5 ml-2" />
      </Button>
    </Card>
  )
}

