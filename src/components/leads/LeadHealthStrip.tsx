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
  NEW: 'bg-blue-100 text-blue-700',
  CONTACTED: 'bg-purple-100 text-purple-700',
  ENGAGED: 'bg-indigo-100 text-indigo-700',
  QUALIFIED: 'bg-yellow-100 text-yellow-700',
  PROPOSAL_SENT: 'bg-orange-100 text-orange-700',
  IN_PROGRESS: 'bg-green-100 text-green-700',
  COMPLETED_WON: 'bg-emerald-100 text-emerald-700',
  LOST: 'bg-slate-100 text-slate-700',
  ON_HOLD: 'bg-gray-100 text-gray-700',
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
    <div className="flex items-center gap-3 px-4 py-2.5 bg-gradient-to-r from-blue-50/50 to-purple-50/50 border-b border-blue-100">
      {/* SLA Status */}
      {slaStatus && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onSLAClick}
          className={cn(
            "h-7 px-2 gap-1.5 text-xs font-semibold",
            slaStatus.status === 'breached' && "text-red-700 hover:bg-red-50:bg-red-900/20",
            slaStatus.status === 'warning' && "text-orange-700 hover:bg-orange-50:bg-orange-900/20",
            slaStatus.status === 'ok' && "text-green-700 hover:bg-green-50:bg-green-900/20"
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
        className="h-7 px-2.5 text-xs font-medium text-blue-700 hover:bg-blue-100:bg-blue-900/30"
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
        className="h-7 px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-100:bg-slate-800"
      >
        <User className="h-3 w-3 mr-1" />
        {ownerName}
      </Button>
    </div>
  )
}

