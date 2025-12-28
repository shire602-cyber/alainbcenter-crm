'use client'

/**
 * SIGNALS PANEL
 * 
 * Right column with 3 compact cards:
 * - Renewals Coming Up (max 5)
 * - Waiting on Customer (max 5)
 * - Alerts (only true system alerts)
 */

import { useState, useEffect } from 'react'
import { Calendar, Hourglass, AlertTriangle, ArrowRight } from 'lucide-react'
import { format, differenceInDays } from 'date-fns'
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

export function SignalsPanel() {
  const [renewals, setRenewals] = useState<RenewalItem[]>([])
  const [waiting, setWaiting] = useState<WaitingItem[]>([])
  const [alerts, setAlerts] = useState<AlertItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
    const interval = setInterval(loadData, 60000)
    return () => clearInterval(interval)
  }, [])

  async function loadData() {
    try {
      // Load renewals
      const renewalsRes = await fetch('/api/dashboard/command-center')
      if (renewalsRes.ok) {
        const data = await renewalsRes.json()
        // Extract renewals from operations (expiring items)
        const renewalItems = (data.operations || [])
          .filter((item: any) => item.title.includes('expires'))
          .slice(0, 5)
          .map((item: any) => ({
            id: parseInt(item.id.split('_')[1]) || 0,
            leadId: item.leadId,
            contactName: item.contactName,
            serviceType: item.serviceType,
            expiryType: item.title.split(' expires')[0] || 'Expiry',
            expiryDate: item.dueDate || '',
            daysUntil: parseInt(item.reason.match(/(\d+)/)?.[0] || '0'),
          }))
        setRenewals(renewalItems)
      }

      // Load waiting on customer
      const waitingRes = await fetch('/api/dashboard/waiting-on-customer')
      if (waitingRes.ok) {
        const data = await waitingRes.json()
        const waitingItems = (data.items || []).slice(0, 5).map((item: any) => ({
          id: item.id,
          leadId: item.leadId,
          contactName: item.contactName,
          serviceType: item.serviceType,
          daysWaiting: item.daysWaiting || 0,
        }))
        setWaiting(waitingItems)
      }

      // Load system alerts (only true alerts, not "reply due" spam)
      const alertsRes = await fetch('/api/notifications')
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
          <Card key={i} className="p-4 rounded-xl border border-slate-200 dark:border-slate-800">
            <div className="h-32 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
          </Card>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Renewals Coming Up */}
      <Card className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Renewals Coming Up
            </h4>
          </div>
          {renewals.length > 5 && (
            <Link href="/renewals">
              <Badge variant="outline" className="text-xs">
                View all
              </Badge>
            </Link>
          )}
        </div>
        {renewals.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">No renewals in next 30 days</p>
        ) : (
          <div className="space-y-2">
            {renewals.map((item) => (
              <Link
                key={item.id}
                href={`/leads/${item.leadId}`}
                className="block p-2 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-smooth"
              >
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-medium text-slate-900 dark:text-slate-100 truncate">
                    {item.contactName}
                  </p>
                  <Badge 
                    variant={item.daysUntil <= 7 ? 'destructive' : 'outline'} 
                    className="text-xs"
                  >
                    {item.daysUntil}d
                  </Badge>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  {item.expiryType} • {item.serviceType || 'Service'}
                </p>
              </Link>
            ))}
          </div>
        )}
      </Card>

      {/* Waiting on Customer */}
      <Card className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Hourglass className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Customer hasn't replied yet
            </h4>
          </div>
          {waiting.length > 5 && (
            <Link href="/leads?filter=waiting">
              <Badge variant="outline" className="text-xs">
                View all
              </Badge>
            </Link>
          )}
        </div>
        {waiting.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">No items waiting</p>
        ) : (
          <div className="space-y-2">
            {waiting.map((item) => (
              <Link
                key={item.id}
                href={`/leads/${item.leadId}`}
                className="block p-2 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-smooth"
              >
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-medium text-slate-900 dark:text-slate-100 truncate">
                    {item.contactName}
                  </p>
                  <span className={cn(
                    "text-xs font-medium",
                    item.daysWaiting > 7 ? "text-amber-600 dark:text-amber-400" : "text-slate-500 dark:text-slate-400"
                  )}>
                    {item.daysWaiting === 1 ? 'Since yesterday' : `${item.daysWaiting} days`}
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  {item.serviceType || 'Service'}
                </p>
              </Link>
            ))}
          </div>
        )}
      </Card>

      {/* Alerts */}
      {alerts.length > 0 && (
        <Card className="p-4 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/10">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              System Alerts
            </h4>
          </div>
          <div className="space-y-2">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800"
              >
                <p className="text-xs font-medium text-slate-900 dark:text-slate-100 mb-1">
                  {alert.title}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
                  {alert.message}
                </p>
                {alert.leadId && (
                  <Link
                    href={`/leads/${alert.leadId}`}
                    className="text-xs text-amber-600 dark:text-amber-400 hover:underline mt-1 inline-flex items-center gap-1"
                  >
                    View lead
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}

