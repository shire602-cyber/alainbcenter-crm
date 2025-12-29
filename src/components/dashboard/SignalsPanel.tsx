'use client'

/**
 * SIGNALS PANEL - CONTROL TOWER
 * 
 * Radar-like data display: Renewals, Waiting, Alerts
 * Compact, informative, scannable in <5 seconds
 */

import { useState, useEffect, memo } from 'react'
import { Calendar, Hourglass, AlertTriangle, ChevronRight } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'

interface RenewalItem {
  id: number
  leadId: number
  contactName: string
  serviceType?: string
  expiryType: string
  expiryDate: string
  daysUntil: number
}

interface WaitingItem {
  id: string
  leadId: number
  contactName: string
  serviceType?: string
  daysWaiting: number
}

interface AlertItem {
  id: number
  type: string
  title: string
  message: string
  leadId?: number
}

function RenewalBadge({ daysUntil }: { daysUntil: number }) {
  if (daysUntil <= 7) return <Badge className="pill bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400">{daysUntil}d</Badge>
  if (daysUntil <= 30) return <Badge className="pill bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">{daysUntil}d</Badge>
  if (daysUntil <= 60) return <Badge className="pill bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400">{daysUntil}d</Badge>
  return <Badge className="pill">{daysUntil}d</Badge>
}

const SignalRow = memo(function SignalRow({ 
  href, 
  children, 
  hovered 
}: { 
  href: string
  children: React.ReactNode
  hovered: boolean
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group flex items-center gap-3 p-2.5 rounded-[10px]",
        "bg-card-muted border border-slate-200/60 dark:border-slate-800/60",
        "hover:bg-card hover:border-slate-300 dark:hover:border-slate-700",
        "hover:shadow-sm transition-all duration-200"
      )}
    >
      <div className="flex-1 min-w-0">
        {children}
      </div>
      <ChevronRight 
        className={cn(
          "h-3.5 w-3.5 text-slate-400 transition-opacity duration-200",
          hovered ? "opacity-100" : "opacity-0"
        )} 
      />
    </Link>
  )
})

export const SignalsPanel = memo(function SignalsPanel() {
  const [renewals, setRenewals] = useState<RenewalItem[]>([])
  const [waiting, setWaiting] = useState<WaitingItem[]>([])
  const [alerts, setAlerts] = useState<AlertItem[]>([])
  const [loading, setLoading] = useState(true)
  const [hoveredIds, setHoveredIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    loadData()
    const interval = setInterval(loadData, 60000)
    return () => clearInterval(interval)
  }, [])

  async function loadData() {
    try {
      const [renewalsRes, waitingRes, alertsRes] = await Promise.all([
        fetch('/api/dashboard/command-center'),
        fetch('/api/dashboard/waiting-on-customer'),
        fetch('/api/notifications')
      ])

      if (renewalsRes.ok) {
        const data = await renewalsRes.json()
        const renewalItems = (data.operations || [])
          .filter((item: any) => item.title?.includes('expires'))
          .slice(0, 5)
          .map((item: any) => ({
            id: parseInt(item.id.split('_')[1]) || 0,
            leadId: item.leadId,
            contactName: item.contactName,
            serviceType: item.serviceType,
            expiryType: item.title?.split(' expires')[0] || 'Expiry',
            expiryDate: item.dueDate || '',
            daysUntil: parseInt(item.reason?.match(/(\d+)/)?.[0] || '0'),
          }))
        setRenewals(renewalItems)
      }

      if (waitingRes.ok) {
        const data = await waitingRes.json()
        setWaiting((data.items || []).slice(0, 5).map((item: any) => ({
          id: item.id,
          leadId: item.leadId,
          contactName: item.contactName,
          serviceType: item.serviceType,
          daysWaiting: item.daysWaiting || 0,
        })))
      }

      if (alertsRes.ok) {
        const data = await alertsRes.json()
        const systemAlerts = (data.notifications || [])
          .filter((n: any) => 
            n.type === 'system' || 
            n.type === 'ai_untrained' ||
            (n.type === 'deadline_today' && !n.isRead)
          )
          .slice(0, 5)
          .map((n: any) => ({
            id: n.id,
            type: n.type,
            title: n.title,
            message: n.message,
            leadId: n.leadId,
          }))
        setAlerts(systemAlerts)
      }
    } catch (error) {
      console.error('Failed to load signals:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="card-premium p-4">
            <div className="h-24 bg-slate-200 dark:bg-slate-800 rounded-[10px] animate-pulse" />
          </Card>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Renewals */}
      {renewals.length > 0 && (
        <Card className="card-premium p-4">
          <div className="flex items-center gap-2 mb-3">
            <Calendar className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <h4 className="text-body font-semibold text-slate-900 dark:text-slate-100">
              Renewals Coming Up
            </h4>
          </div>
          <div className="space-y-1.5">
            {renewals.map((item) => (
              <SignalRow
                key={item.id}
                href={`/leads/${item.leadId}`}
                hovered={hoveredIds.has(`renewal-${item.id}`)}
              >
                <div 
                  onMouseEnter={() => setHoveredIds(prev => new Set(prev).add(`renewal-${item.id}`))}
                  onMouseLeave={() => setHoveredIds(prev => {
                    const next = new Set(prev)
                    next.delete(`renewal-${item.id}`)
                    return next
                  })}
                >
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-body font-medium text-slate-900 dark:text-slate-100 truncate">
                      {item.contactName}
                    </p>
                    <RenewalBadge daysUntil={item.daysUntil} />
                  </div>
                  <p className="text-meta text-slate-600 dark:text-slate-400 truncate">
                    {item.expiryType} • {item.serviceType || 'Service'}
                  </p>
                </div>
              </SignalRow>
            ))}
          </div>
        </Card>
      )}

      {/* Waiting on Customer */}
      {waiting.length > 0 && (
        <Card className="card-premium p-4">
          <div className="flex items-center gap-2 mb-3">
            <Hourglass className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <h4 className="text-body font-semibold text-slate-900 dark:text-slate-100">
              Customer hasn't replied yet
            </h4>
          </div>
          <div className="space-y-1.5">
            {waiting.map((item) => (
              <SignalRow
                key={item.id}
                href={`/leads/${item.leadId}`}
                hovered={hoveredIds.has(`waiting-${item.id}`)}
              >
                <div
                  onMouseEnter={() => setHoveredIds(prev => new Set(prev).add(`waiting-${item.id}`))}
                  onMouseLeave={() => setHoveredIds(prev => {
                    const next = new Set(prev)
                    next.delete(`waiting-${item.id}`)
                    return next
                  })}
                >
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-body font-medium text-slate-900 dark:text-slate-100 truncate">
                      {item.contactName}
                    </p>
                    <span className={cn(
                      "text-meta font-medium",
                      item.daysWaiting > 7 ? "text-amber-600 dark:text-amber-400" : "muted-text"
                    )}>
                      Last reply: {item.daysWaiting === 1 ? 'yesterday' : `${item.daysWaiting} days ago`}
                    </span>
                  </div>
                  <p className="text-meta muted-text truncate">
                    {item.serviceType || 'Service'}
                  </p>
                </div>
              </SignalRow>
            ))}
          </div>
        </Card>
      )}

      {/* Alerts */}
      {alerts.length > 0 && (
        <Card className="card-premium p-4 border-amber-200/60 dark:border-amber-800/60 bg-amber-50/50 dark:bg-amber-900/5">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <h4 className="text-body font-semibold text-slate-900 dark:text-slate-100">
              System Alerts
            </h4>
          </div>
          <div className="space-y-1.5">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className="p-2.5 rounded-[10px] bg-card border border-amber-200/60 dark:border-amber-800/60"
              >
                <p className="text-body font-medium text-slate-900 dark:text-slate-100 mb-1">
                  {alert.title}
                </p>
                <p className="text-meta muted-text line-clamp-2">
                  {alert.message}
                </p>
                {alert.leadId && (
                  <Link
                    href={`/leads/${alert.leadId}`}
                    className="text-meta text-amber-600 dark:text-amber-400 hover:underline mt-1.5 inline-flex items-center gap-1"
                  >
                    View lead
                    <ChevronRight className="h-3 w-3" />
                  </Link>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
})
