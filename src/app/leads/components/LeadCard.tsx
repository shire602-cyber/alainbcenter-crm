'use client'

import { memo } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Avatar } from '@/components/ui/avatar'
import { Select } from '@/components/ui/select'
import { MessageSquare, Phone, Mail, Clock } from 'lucide-react'
import { format } from 'date-fns'
import { ExpiryChip } from '@/components/leads/ExpiryChip'
import { RenewalStrip } from '@/components/leads/RenewalStrip'
import {
  PIPELINE_STAGES,
  PIPELINE_STAGE_LABELS,
  getAiScoreCategory,
} from '@/lib/constants'
import { Flame, TrendingUp, Snowflake, DollarSign } from 'lucide-react'

type Lead = {
  id: number
  leadType: string | null
  status: string
  pipelineStage: string
  stage?: string
  aiScore: number | null
  expiryDate: string | null
  nextFollowUpAt: string | null
  createdAt: string
  contact: {
    fullName: string
    phone: string
    email?: string | null
    source?: string | null
  }
  expiryItems?: Array<{ id: number; type: string; expiryDate: string; renewalStatus?: string }>
  renewalProbability?: number | null
  estimatedRenewalValue?: string | null
  dealProbability?: number | null
  expectedRevenueAED?: number | null
}

interface LeadCardProps {
  lead: Lead
  onUpdateStage: (leadId: number, stage: string) => void
  formatSource: (source: string | null) => string
  getNearestExpiry: (lead: Lead) => { type: string; expiryDate: string; daysUntil: number } | null
  getScoreBadgeVariant: (score: number | null) => 'hot' | 'warm' | 'cold' | 'secondary'
  formatDate: (date: string | null) => string
  getWhatsAppLink: (phone: string, name: string) => string
}

export const LeadCard = memo(function LeadCard({
  lead,
  onUpdateStage,
  formatSource,
  getNearestExpiry,
  getScoreBadgeVariant,
  formatDate,
  getWhatsAppLink,
}: LeadCardProps) {
  const scoreCategory = getAiScoreCategory(lead.aiScore)
  const nearestExpiry = getNearestExpiry(lead)

  return (
    <div className="group relative bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-xl p-3 transition-all duration-200 hover:shadow-md hover:border-slate-300 dark:hover:border-slate-700 hover:-translate-y-0.5 cursor-pointer">
      <div className="space-y-2">
        {/* Header with Avatar and Name */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Avatar fallback={lead.contact.fullName} size="md" />
            <div className="flex-1 min-w-0">
              <Link
                href={`/leads/${lead.id}`}
                className="block font-semibold text-sm text-slate-900 dark:text-slate-100 hover:text-primary transition-colors truncate"
                onClick={(e) => e.stopPropagation()}
              >
                {lead.contact.fullName}
              </Link>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{lead.contact.phone}</p>
            </div>
          </div>
          {lead.aiScore !== null && (
            <Badge
              variant={getScoreBadgeVariant(lead.aiScore)}
              className="shrink-0 flex items-center gap-1 text-xs"
            >
              {scoreCategory === 'hot' && <Flame className="h-3 w-3" />}
              {scoreCategory === 'warm' && <TrendingUp className="h-3 w-3" />}
              {scoreCategory === 'cold' && <Snowflake className="h-3 w-3" />}
              {lead.aiScore}
            </Badge>
          )}
        </div>

        {/* Service & Source */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <Badge variant="outline" className="text-xs px-1.5 py-0.5">
            {lead.leadType || 'N/A'}
          </Badge>
          <Badge variant="secondary" className="text-xs px-1.5 py-0.5">
            {formatSource(lead.contact.source || null)}
          </Badge>
        </div>

        {/* Pipeline Stage */}
        <div>
          <label className="block text-xs font-medium mb-1.5 text-slate-700 dark:text-slate-300">Stage</label>
          <Select
            value={lead.pipelineStage || 'new'}
            onChange={(e) => {
              e.stopPropagation()
              onUpdateStage(lead.id, e.target.value)
            }}
            onClick={(e) => e.stopPropagation()}
            className="h-9 text-sm font-medium w-full bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-600 focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors"
          >
            {PIPELINE_STAGES.map((stage) => (
              <option key={stage} value={stage}>
                {PIPELINE_STAGE_LABELS[stage]}
              </option>
            ))}
          </Select>
        </div>

        {/* Expiry Chips */}
        {((lead.expiryItems && lead.expiryItems.length > 0) || lead.expiryDate) && (
          <div className="flex flex-wrap gap-1 pt-1.5 border-t border-slate-200 dark:border-slate-800">
            {lead.expiryItems && lead.expiryItems.length > 0 ? (
              <>
                {lead.expiryItems.slice(0, 3).map((expiry) => (
                  <ExpiryChip
                    key={expiry.id}
                    expiryDate={expiry.expiryDate}
                    type={expiry.type}
                    compact
                  />
                ))}
              </>
            ) : lead.expiryDate ? (
              <ExpiryChip expiryDate={lead.expiryDate} type="LEGACY_EXPIRY" compact />
            ) : null}
          </div>
        )}

        {/* Deal Forecast */}
        {(lead.dealProbability !== null && lead.dealProbability !== undefined) && (
          <div className="flex items-center gap-2 pt-1.5 border-t border-slate-200 dark:border-slate-800">
            <Badge
              variant="outline"
              className={cn(
                'text-xs',
                lead.dealProbability >= 70 && 'bg-green-50 text-green-700 border-green-200',
                lead.dealProbability >= 50 && lead.dealProbability < 70 && 'bg-yellow-50 text-yellow-700 border-yellow-200',
                lead.dealProbability >= 30 && lead.dealProbability < 50 && 'bg-orange-50 text-orange-700 border-orange-200',
                lead.dealProbability < 30 && 'bg-red-50 text-red-700 border-red-200'
              )}
            >
              <TrendingUp className="h-3 w-3 mr-1" />
              {lead.dealProbability}% probability
            </Badge>
            {lead.expectedRevenueAED !== null && lead.expectedRevenueAED !== undefined && (
              <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                <DollarSign className="h-3 w-3 mr-1" />
                {lead.expectedRevenueAED.toLocaleString()} AED
              </Badge>
            )}
          </div>
        )}

        {/* Renewal Strip */}
        {lead.renewalProbability !== null && lead.renewalProbability !== undefined && lead.estimatedRenewalValue && (
          <RenewalStrip
            probability={lead.renewalProbability}
            value={parseFloat(lead.estimatedRenewalValue)}
            compact
          />
        )}

        {/* Next Follow-up */}
        {lead.nextFollowUpAt && (
          <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 pt-1.5 border-t border-slate-200 dark:border-slate-800">
            <Clock className="h-3 w-3" />
            <span>Follow-up: {formatDate(lead.nextFollowUpAt)}</span>
          </div>
        )}

        {/* Quick Actions */}
        <div className="flex items-center gap-1 pt-1.5 border-t border-slate-200 dark:border-slate-800">
          {lead.contact.phone && (
            <a
              href={getWhatsAppLink(lead.contact.phone, lead.contact.fullName)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
              title="WhatsApp"
            >
              <MessageSquare className="h-3.5 w-3.5 text-green-600" />
            </a>
          )}
          {lead.contact.phone && (
            <a
              href={`tel:${lead.contact.phone}`}
              onClick={(e) => e.stopPropagation()}
              className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
              title="Call"
            >
              <Phone className="h-3.5 w-3.5 text-blue-600" />
            </a>
          )}
          {lead.contact.email && (
            <a
              href={`mailto:${lead.contact.email}`}
              onClick={(e) => e.stopPropagation()}
              className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
              title="Email"
            >
              <Mail className="h-3.5 w-3.5 text-slate-600" />
            </a>
          )}
        </div>
      </div>
    </div>
  )
})




