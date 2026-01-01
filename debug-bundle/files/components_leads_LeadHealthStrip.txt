'use client'

/**
 * LEAD HEALTH STRIP
 * 
 * Shows key lead status at a glance:
 * - SLA status (dot + label)
 * - Waiting time
 * - Service label
 * - Stage chip
 * - Owner chip
 * 
 * Clickable to open relevant sections
 */

import { useMemo } from 'react'
import { Clock, AlertCircle, CheckCircle2, User, Target } from 'lucide-react'
import { formatDistanceToNow, differenceInHours } from 'date-fns'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

interface LeadHealthStripProps {
  lead: {
    id: number
    stage?: string | null
    serviceType?: {
      name?: string
    } | null
    lastInboundAt?: Date | string | null
    lastOutboundAt?: Date | string | null
    assignedUser?: {
      id: number
      name: string | null
    } | null
  }
  onStageClick?: () => void
  onOwnerClick?: () => void
  onServiceClick?: () => void
  onSLAClick?: () => void
}

const STAGE_COLORS: Record<string, string> = {
  NEW: 'bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300',
  CONTACTED: 'bg-purple-100 text-purple-700 dark:bg-purple-900/20 dark:text-purple-300',
  ENGAGED: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-300',
  QUALIFIED: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-300',
  PROPOSAL_SENT: 'bg-orange-100 text-orange-700 dark:bg-orange-900/20 dark:text-orange-300',
  IN_PROGRESS: 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-300',
  COMPLETED_WON: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300',
  LOST: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  ON_HOLD: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
}

export function LeadHealthStrip({
  lead,
  onStageClick,
  onOwnerClick,
  onServiceClick,
  onSLAClick,
}: LeadHealthStripProps) {
  // Calculate SLA status
  const slaStatus = useMemo(() => {
    if (!lead.lastInboundAt) return null
    
    const lastInbound = typeof lead.lastInboundAt === 'string' 
      ? new Date(lead.lastInboundAt) 
      : lead.lastInboundAt
    const lastOutbound = lead.lastOutboundAt
      ? (typeof lead.lastOutboundAt === 'string' ? new Date(lead.lastOutboundAt) : lead.lastOutboundAt)
      : null
    
    // If we've replied after the last inbound, no SLA issue
    if (lastOutbound && lastOutbound >= lastInbound) {
      return { status: 'ok', hours: 0, label: 'Replied' }
    }
    
    const hoursSince = differenceInHours(new Date(), lastInbound)
    
    if (hoursSince > 24) {
      return { status: 'breached', hours: hoursSince, label: 'SLA Breached' }
    } else if (hoursSince > 10) {
      return { status: 'warning', hours: hoursSince, label: 'SLA Risk' }
    } else {
      return { status: 'ok', hours: hoursSince, label: 'On Track' }
    }
  }, [lead.lastInboundAt, lead.lastOutboundAt])

  const serviceName = lead.serviceType?.name || 'Not specified'
  const stage = lead.stage || 'NEW'
  const ownerName = lead.assignedUser?.name || 'Unassigned'

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 bg-gradient-to-r from-blue-50/50 to-purple-50/50 dark:from-blue-950/20 dark:to-purple-950/20 border-b border-blue-100 dark:border-blue-900/50">
      {/* SLA Status */}
      {slaStatus && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onSLAClick}
          className={cn(
            "h-7 px-2 gap-1.5 text-xs font-semibold",
            slaStatus.status === 'breached' && "text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20",
            slaStatus.status === 'warning' && "text-orange-700 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/20",
            slaStatus.status === 'ok' && "text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20"
          )}
        >
          <div className={cn(
            "w-2 h-2 rounded-full",
            slaStatus.status === 'breached' && "bg-red-500 animate-pulse",
            slaStatus.status === 'warning' && "bg-orange-500",
            slaStatus.status === 'ok' && "bg-green-500"
          )} />
          {slaStatus.status === 'breached' && <AlertCircle className="h-3 w-3" />}
          {slaStatus.status === 'warning' && <Clock className="h-3 w-3" />}
          {slaStatus.status === 'ok' && <CheckCircle2 className="h-3 w-3" />}
          <span>{slaStatus.label}</span>
          {slaStatus.hours > 0 && (
            <span className="text-xs opacity-75">
              {formatDistanceToNow(
                typeof lead.lastInboundAt === 'string' 
                  ? new Date(lead.lastInboundAt) 
                  : lead.lastInboundAt!,
                { addSuffix: true }
              )}
            </span>
          )}
        </Button>
      )}

      {/* Service Label */}
      <Button
        variant="ghost"
        size="sm"
        onClick={onServiceClick}
        className="h-7 px-2.5 text-xs font-medium text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/30"
      >
        <Target className="h-3 w-3 mr-1" />
        {serviceName}
      </Button>

      {/* Stage Chip */}
      <Button
        variant="ghost"
        size="sm"
        onClick={onStageClick}
        className={cn(
          "h-7 px-2.5 text-xs font-semibold rounded-full",
          STAGE_COLORS[stage] || STAGE_COLORS.NEW
        )}
      >
        {stage.replace(/_/g, ' ')}
      </Button>

      {/* Owner Chip */}
      <Button
        variant="ghost"
        size="sm"
        onClick={onOwnerClick}
        className="h-7 px-2.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
      >
        <User className="h-3 w-3 mr-1" />
        {ownerName}
      </Button>
    </div>
  )
}

