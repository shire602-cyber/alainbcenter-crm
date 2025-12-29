'use client'

/**
 * ACTION COCKPIT CARD - Premium Recommended Action Card
 * 
 * Reusable card component for displaying the primary recommended action
 * with impact indicators, badges, and micro-actions.
 */

import { memo } from 'react'
import { Target, Clock, DollarSign, AlertTriangle, MoreVertical, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { NextBestAction } from '@/lib/leads/nextBestAction'

interface ActionCockpitCardProps {
  action: NextBestAction
  onPrimaryAction: () => void
  onSnooze?: () => void
  onMarkHandled?: () => void
  onAssign?: () => void
  className?: string
}

export const ActionCockpitCard = memo(function ActionCockpitCard({
  action,
  onPrimaryAction,
  onSnooze,
  onMarkHandled,
  onAssign,
  className,
}: ActionCockpitCardProps) {
  const urgencyColor = action.impact.urgency >= 80 ? 'red' : action.impact.urgency >= 60 ? 'amber' : 'blue'
  const revenueColor = action.impact.revenue >= 70 ? 'green' : 'blue'
  const riskColor = action.impact.risk >= 70 ? 'red' : action.impact.risk >= 40 ? 'amber' : 'blue'

  return (
    <Card 
      className={cn(
        "card-premium p-6",
        "hover:-translate-y-0.5 transition-all duration-200",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-start gap-3 mb-4">
        <div className="flex-shrink-0 w-10 h-10 rounded-[12px] bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
          <Target className="h-5 w-5 text-blue-600 dark:text-blue-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <h3 className="text-body font-semibold text-slate-900 dark:text-slate-100">
              {action.title}
            </h3>
            {(onSnooze || onMarkHandled || onAssign) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8 rounded-[10px]"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="rounded-[12px]">
                  {onSnooze && (
                    <DropdownMenuItem onClick={onSnooze}>
                      Snooze 30m
                    </DropdownMenuItem>
                  )}
                  {onMarkHandled && (
                    <DropdownMenuItem onClick={onMarkHandled}>
                      Mark handled
                    </DropdownMenuItem>
                  )}
                  {onAssign && (
                    <DropdownMenuItem onClick={onAssign}>
                      Assign to...
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
          
          {/* Why line */}
          <p className="text-body muted-text mb-4">
            {action.why}
          </p>

          {/* Badges */}
          {action.badges.length > 0 && (
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              {action.badges.map((badge, idx) => (
                <Badge 
                  key={idx}
                  className={cn(
                    "chip",
                    badge.includes('SLA') || badge.includes('breach')
                      ? "bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400"
                      : badge.includes('Expiry')
                      ? "bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400"
                      : "bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400"
                  )}
                >
                  {badge}
                </Badge>
              ))}
            </div>
          )}

          {/* Primary CTA */}
          <Button
            onClick={onPrimaryAction}
            className={cn(
              "w-full h-11 rounded-[14px] font-semibold",
              "bg-primary hover:bg-primary/90 text-primary-foreground",
              "transition-all duration-200 hover:shadow-md active:scale-95"
            )}
          >
            {action.ctaLabel}
          </Button>

          {/* Impact Pills */}
          {(action.impact.urgency > 0 || action.impact.revenue > 0 || action.impact.risk > 0) && (
            <div className="mt-4 pt-4 divider-soft">
              <div className="flex items-center gap-3 text-meta">
                {action.impact.urgency > 0 && (
                  <div className="flex items-center gap-1.5">
                    <Clock className={cn(
                      "h-3.5 w-3.5",
                      urgencyColor === 'red' && "text-red-500",
                      urgencyColor === 'amber' && "text-amber-500",
                      urgencyColor === 'blue' && "text-blue-500"
                    )} />
                    <span className="muted-text">Urgency</span>
                  </div>
                )}
                {action.impact.revenue > 0 && (
                  <div className="flex items-center gap-1.5">
                    <DollarSign className={cn(
                      "h-3.5 w-3.5",
                      revenueColor === 'green' && "text-green-500",
                      revenueColor === 'blue' && "text-blue-500"
                    )} />
                    <span className="muted-text">Revenue</span>
                  </div>
                )}
                {action.impact.risk > 0 && (
                  <div className="flex items-center gap-1.5">
                    <AlertTriangle className={cn(
                      "h-3.5 w-3.5",
                      riskColor === 'red' && "text-red-500",
                      riskColor === 'amber' && "text-amber-500"
                    )} />
                    <span className="muted-text">Risk</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  )
})

