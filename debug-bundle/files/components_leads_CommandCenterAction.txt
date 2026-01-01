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
          card: 'border-red-500/50 bg-gradient-to-br from-red-50 to-red-100 dark:from-red-900/30 dark:to-red-800/20 shadow-lg shadow-red-500/10',
          button: 'bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-500/30',
          icon: 'text-red-600 dark:text-red-400',
          pulse: 'animate-pulse',
        }
      case 'high':
        return {
          card: 'border-orange-500/50 bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-900/30 dark:to-orange-800/20 shadow-lg shadow-orange-500/10',
          button: 'bg-orange-600 hover:bg-orange-700 text-white shadow-lg shadow-orange-500/30',
          icon: 'text-orange-600 dark:text-orange-400',
          pulse: '',
        }
      case 'normal':
        return {
          card: 'border-blue-500/50 bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/30 dark:to-blue-800/20 shadow-md shadow-blue-500/10',
          button: 'bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/20',
          icon: 'text-blue-600 dark:text-blue-400',
          pulse: '',
        }
      default:
        return {
          card: 'border-slate-300 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900/50 dark:to-slate-800/30 shadow-sm',
          button: 'bg-slate-600 hover:bg-slate-700 text-white',
          icon: 'text-slate-600 dark:text-slate-400',
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
          "bg-white/50 dark:bg-slate-800/50"
        )}>
          <Zap className="h-6 w-6" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-1">
            {action.label}
          </h3>
          <p className="text-sm text-slate-700 dark:text-slate-300 mb-2">
            {action.reason}
          </p>
          
          {/* Urgency Indicators */}
          {urgencyIndicators && (
            <div className="flex items-center gap-4 mt-3">
              {urgencyIndicators.timeWaiting && (
                <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
                  <Clock className="h-3.5 w-3.5" />
                  <span>{urgencyIndicators.timeWaiting}</span>
                </div>
              )}
              {urgencyIndicators.slaRisk && urgencyIndicators.slaRisk !== 'none' && (
                <div className="flex items-center gap-1.5 text-xs">
                  <AlertCircle className={cn(
                    "h-3.5 w-3.5",
                    urgencyIndicators.slaRisk === 'high' && "text-red-600 dark:text-red-400",
                    urgencyIndicators.slaRisk === 'medium' && "text-orange-600 dark:text-orange-400",
                    urgencyIndicators.slaRisk === 'low' && "text-yellow-600 dark:text-yellow-400"
                  )} />
                  <span className={cn(
                    urgencyIndicators.slaRisk === 'high' && "text-red-600 dark:text-red-400 font-medium",
                    urgencyIndicators.slaRisk === 'medium' && "text-orange-600 dark:text-orange-400",
                    urgencyIndicators.slaRisk === 'low' && "text-yellow-600 dark:text-yellow-400"
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

