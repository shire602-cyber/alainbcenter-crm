'use client'

/**
 * ACTION COCKPIT CARD - PREMIUM RECOMMENDED ACTION CARD
 * 
 * Reusable card component for displaying the primary recommended action
 * with impact pills, badges, and micro-actions.
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
}

function ImpactPill({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  const colorClass = value >= 70 
    ? 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400'
    : value >= 50
    ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400'
    : 'bg-slate-50 text-slate-700 dark:bg-slate-800 dark:text-slate-300'

  return (
    <div className={cn('pill flex items-center gap-1.5', colorClass)}>
      {icon}
      <span className="text-[11px] font-medium">{label}: {value}</span>
    </div>
  )
}

export const ActionCockpitCard = memo(function ActionCockpitCard({
  action,
  onPrimaryAction,
  onSnooze,
  onMarkHandled,
  onAssign,
}: ActionCockpitCardProps) {
  const hasMicroActions = onSnooze || onMarkHandled || onAssign

  return (
    <Card className={cn(
      "card-premium p-6",
      "hover:-translate-y-0.5 transition-all duration-200"
    )}>
      <div className="flex items-start gap-3 mb-4">
        <div className="flex-shrink-0 w-10 h-10 rounded-[12px] bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
          <Target className="h-5 w-5 text-blue-600 dark:text-blue-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-2">
            <h3 className="text-body font-semibold text-slate-900 dark:text-slate-100">
              Recommended
            </h3>
            {hasMicroActions && (
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
          
          <p className="text-body font-medium text-slate-900 dark:text-slate-100 mb-3">
            {action.title}
          </p>
          
          <p className="text-body muted-text mb-4">
            {action.why}
          </p>

          {/* Impact Pills */}
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            {action.impact.urgency > 0 && (
              <ImpactPill
                label="Urgency"
                value={action.impact.urgency}
                icon={<Clock className="h-3 w-3" />}
              />
            )}
            {action.impact.revenue > 0 && (
              <ImpactPill
                label="Revenue"
                value={action.impact.revenue}
                icon={<DollarSign className="h-3 w-3" />}
              />
            )}
            {action.impact.risk > 0 && (
              <ImpactPill
                label="Risk"
                value={action.impact.risk}
                icon={<AlertTriangle className="h-3 w-3" />}
              />
            )}
          </div>

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
        </div>
      </div>
    </Card>
  )
})

