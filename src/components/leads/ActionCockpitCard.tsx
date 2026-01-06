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
        "card-premium inset-hero",
        "card-pressable",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-start gap-4 mb-4">
        <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
          <Target className="h-6 w-6 text-blue-600 dark:text-blue-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-2">
            <h3 className="text-h2 font-semibold text-slate-900 dark:text-slate-100">
              {action.title}
            </h3>
            {(onSnooze || onMarkHandled || onAssign) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    type="button"
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8 rounded-lg btn-pressable"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="radius-xl">
                  {onSnooze && (
                    <DropdownMenuItem 
                      onSelect={(e) => {
                        e.preventDefault()
                        onSnooze()
                      }}
                    >
                      Snooze 30m
                    </DropdownMenuItem>
                  )}
                  {onMarkHandled && (
                    <DropdownMenuItem 
                      onSelect={(e) => {
                        e.preventDefault()
                        onMarkHandled()
                      }}
                    >
                      Mark handled
                    </DropdownMenuItem>
                  )}
                  {onAssign && (
                    <DropdownMenuItem 
                      onSelect={(e) => {
                        e.preventDefault()
                        onAssign()
                      }}
                    >
                      Assign to...
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
          
          {/* Why line */}
          <p className="text-body muted-text mb-4 leading-relaxed">
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

          {/* Impact Pills (before CTA) */}
          {(action.impact.urgency > 0 || action.impact.revenue > 0 || action.impact.risk > 0) && (
            <div className="mb-4 flex items-center gap-2 flex-wrap">
              {action.impact.urgency > 0 && (
                <Badge className={cn(
                  "pill px-3 py-1.5",
                  urgencyColor === 'red' && "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400 border-red-200/60 dark:border-red-800/60",
                  urgencyColor === 'amber' && "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 border-amber-200/60 dark:border-amber-800/60",
                  urgencyColor === 'blue' && "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400 border-blue-200/60 dark:border-blue-800/60"
                )}>
                  <Clock className="h-3.5 w-3.5 mr-1.5" />
                  <span className="text-meta font-medium">Urgency</span>
                </Badge>
              )}
              {action.impact.revenue > 0 && (
                <Badge className={cn(
                  "pill px-3 py-1.5",
                  revenueColor === 'green' && "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400 border-green-200/60 dark:border-green-800/60",
                  revenueColor === 'blue' && "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400 border-blue-200/60 dark:border-blue-800/60"
                )}>
                  <DollarSign className="h-3.5 w-3.5 mr-1.5" />
                  <span className="text-meta font-medium">Revenue</span>
                </Badge>
              )}
              {action.impact.risk > 0 && (
                <Badge className={cn(
                  "pill px-3 py-1.5",
                  riskColor === 'red' && "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400 border-red-200/60 dark:border-red-800/60",
                  riskColor === 'amber' && "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 border-amber-200/60 dark:border-amber-800/60"
                )}>
                  <AlertTriangle className="h-3.5 w-3.5 mr-1.5" />
                  <span className="text-meta font-medium">Risk</span>
                </Badge>
              )}
            </div>
          )}

          {/* Primary CTA */}
          <Button
            onClick={onPrimaryAction}
            className={cn(
              "w-full h-12 radius-xl font-semibold",
              "bg-primary hover:bg-primary/90 text-primary-foreground",
              "shadow-soft hover:shadow-premium",
              "transition-all duration-200 hover:-translate-y-0.5 btn-pressable"
            )}
          >
            {action.ctaLabel}
          </Button>
        </div>
      </div>
    </Card>
  )
})

