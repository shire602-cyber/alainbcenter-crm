'use client'

/**
 * At Risk Leads Widget
 * Shows high-value leads with low recent activity
 */

import { BentoCard } from './BentoCard'
import { Badge } from '@/components/ui/badge'
import { AlertTriangle, DollarSign, MessageSquare, Phone, Loader2 } from 'lucide-react'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

interface AtRiskLead {
  id: number
  contactName: string
  phone: string
  serviceType: string
  expectedRevenueAED: number
  dealProbability: number
  lastInboundAt: string | null
  lastOutboundAt: string | null
  daysSinceLastActivity: number | null
}

export function AtRiskLeadsWidget() {
  const [leads, setLeads] = useState<AtRiskLead[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadAtRiskLeads()
  }, [])

  async function loadAtRiskLeads() {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch('/api/analytics/forecast-metrics')
      if (res.ok) {
        const data = await res.json()
        setLeads(data.atRiskLeads || [])
      } else {
        setError('Failed to load at-risk leads')
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load at-risk leads')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <BentoCard title="At Risk Leads">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </BentoCard>
    )
  }

  if (error) {
    return (
      <BentoCard title="At Risk Leads">
        <div className="text-center py-4 text-sm text-muted-foreground">
          {error}
        </div>
      </BentoCard>
    )
  }

  if (leads.length === 0) {
    return (
      <BentoCard title="At Risk Leads">
        <div className="flex flex-col items-center justify-center py-6 text-center">
          <AlertTriangle className="h-6 w-6 text-green-600 mb-1.5" />
          <p className="text-xs font-medium text-slate-900 mb-0.5">No at-risk leads</p>
          <p className="text-xs text-slate-500">All high-value leads are active!</p>
        </div>
      </BentoCard>
    )
  }

  return (
    <BentoCard
      title="At Risk Leads"
      action={
        <Link href="/leads?filter=at_risk" className="text-xs text-slate-600 hover:text-primary transition-colors">
          View all →
        </Link>
      }
    >
      <div className="space-y-1">
        {leads.slice(0, 5).map((lead) => (
          <Link
            key={lead.id}
            href={`/leads/${lead.id}`}
            className="block p-2 rounded-lg border border-slate-200 hover:bg-slate-100:bg-slate-800/50 hover:border-slate-300:border-slate-700 transition-all group"
          >
            <div className="flex items-start justify-between gap-2 mb-1">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-slate-900 group-hover:text-primary transition-colors truncate">
                  {lead.contactName}
                </p>
                <p className="text-xs text-slate-500 truncate">
                  {lead.serviceType}
                </p>
              </div>
              <Badge
                variant={lead.dealProbability >= 50 ? 'outline' : 'destructive'}
                className={cn(
                  'text-xs flex-shrink-0',
                  lead.dealProbability >= 50 && 'bg-yellow-50 text-yellow-700 border-yellow-200',
                  lead.dealProbability < 50 && 'bg-red-50 text-red-700 border-red-200'
                )}
              >
                {lead.dealProbability}%
              </Badge>
            </div>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1">
                <DollarSign className="h-3 w-3 text-green-600" />
                <span className="text-xs font-medium text-green-600">
                  {lead.expectedRevenueAED.toLocaleString()} AED
                </span>
              </div>
              {lead.daysSinceLastActivity !== null && (
                <span className="text-xs text-slate-500">
                  {lead.daysSinceLastActivity}d ago
                </span>
              )}
            </div>
            {lead.phone && (
              <div className="flex items-center gap-1 mt-1.5 pt-1.5 border-t border-slate-200">
                <a
                  href={`https://wa.me/${lead.phone.replace(/[^0-9]/g, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="p-1 rounded hover:bg-slate-200:bg-slate-700 transition-colors"
                  title="WhatsApp"
                >
                  <MessageSquare className="h-3 w-3 text-green-600" />
                </a>
                <a
                  href={`tel:${lead.phone}`}
                  onClick={(e) => e.stopPropagation()}
                  className="p-1 rounded hover:bg-slate-200:bg-slate-700 transition-colors"
                  title="Call"
                >
                  <Phone className="h-3 w-3 text-blue-600" />
                </a>
              </div>
            )}
          </Link>
        ))}
      </div>
    </BentoCard>
  )
}

