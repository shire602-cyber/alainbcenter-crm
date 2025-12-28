'use client'

/**
 * LEAD DNA COMPONENT - LIGHTER VERSION
 * Read-only, sticky left sidebar showing lead identity and insights
 * Visually lighter to not compete with Command Center action
 */

import { User, Phone, Mail, Target, Sparkles, Clock, ChevronDown, ChevronUp } from 'lucide-react'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion'

interface LeadDNAProps {
  lead: {
    id: number
    contact?: {
      fullName?: string | null
      phone?: string | null
      email?: string | null
      nationality?: string | null
    } | null
    serviceTypeEnum?: string | null
    requestedServiceRaw?: string | null
    serviceType?: {
      name: string
    } | null
    dealProbability?: number | null
    expectedRevenueAED?: number | null
    aiScore?: number | null
    stage?: string | null
    createdAt: Date
    lastInboundAt?: Date | null
    lastOutboundAt?: Date | null
    forecastReasonJson?: string | null
  }
}

export function LeadDNA({ lead }: LeadDNAProps) {
  const contact = lead.contact
  const serviceName = lead.serviceType?.name || lead.serviceTypeEnum || lead.requestedServiceRaw || 'Not specified'
  
  // Parse forecast reasons
  let forecastReasons: string[] = []
  if (lead.forecastReasonJson) {
    try {
      forecastReasons = JSON.parse(lead.forecastReasonJson)
    } catch {
      // Invalid JSON, ignore
    }
  }

  const getProbabilityColor = (prob: number | null | undefined) => {
    if (!prob) return 'text-slate-500'
    if (prob >= 70) return 'text-green-600 dark:text-green-400'
    if (prob >= 40) return 'text-yellow-600 dark:text-yellow-400'
    return 'text-orange-600 dark:text-orange-400'
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="space-y-4 p-4 sm:p-6">
        {/* Identity - Always Visible */}
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
              <User className="h-5 w-5 text-slate-500 dark:text-slate-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                {contact?.fullName || 'Unknown'}
              </p>
              {contact?.nationality && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {contact.nationality}
                </p>
              )}
            </div>
          </div>

          {contact?.phone && (
            <div className="flex items-center gap-2 text-sm pl-13">
              <Phone className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
              <a 
                href={`tel:${contact.phone}`}
                className="text-slate-600 dark:text-slate-400 hover:text-primary transition-colors truncate text-xs"
              >
                {contact.phone}
              </a>
            </div>
          )}

          {contact?.email && (
            <div className="flex items-center gap-2 text-sm pl-13">
              <Mail className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
              <a 
                href={`mailto:${contact.email}`}
                className="text-slate-600 dark:text-slate-400 hover:text-primary transition-colors truncate text-xs"
              >
                {contact.email}
              </a>
            </div>
          )}
        </div>

        {/* Service - Always Visible */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Target className="h-3.5 w-3.5 text-slate-400" />
            <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
              {serviceName}
            </span>
          </div>
          
          {lead.requestedServiceRaw && lead.requestedServiceRaw !== serviceName && (
            <p className="text-xs text-slate-500 dark:text-slate-400 italic pl-5">
              "{lead.requestedServiceRaw}"
            </p>
          )}
        </div>

        {/* Collapsible Sections */}
        <Accordion type="multiple" defaultValue={[]}>
          {/* AI Insights */}
          {(lead.dealProbability !== null || lead.aiScore !== null || forecastReasons.length > 0) && (
            <AccordionItem value="insights">
              <AccordionTrigger className="text-xs">
                AI Insights
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3">
                  {lead.dealProbability !== null && lead.dealProbability !== undefined && (
                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-slate-600 dark:text-slate-400">Deal Probability</span>
                        <span className={cn("text-base font-bold", getProbabilityColor(lead.dealProbability))}>
                          {lead.dealProbability}%
                        </span>
                      </div>
                      {lead.expectedRevenueAED && (
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Expected: AED {lead.expectedRevenueAED.toLocaleString()}
                        </p>
                      )}
                    </div>
                  )}

                  {lead.aiScore !== null && lead.aiScore !== undefined && (
                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-600 dark:text-slate-400">AI Score</span>
                        <span className={cn(
                          "text-base font-bold",
                          lead.aiScore >= 70 ? 'text-green-600 dark:text-green-400' :
                          lead.aiScore >= 40 ? 'text-yellow-600 dark:text-yellow-400' :
                          'text-slate-500'
                        )}>
                          {lead.aiScore}
                        </span>
                      </div>
                    </div>
                  )}

                  {forecastReasons.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-slate-700 dark:text-slate-300">Why:</p>
                      <ul className="space-y-1">
                        {forecastReasons.slice(0, 3).map((reason, idx) => (
                          <li key={idx} className="text-xs text-slate-600 dark:text-slate-400 flex items-start gap-2">
                            <span className="text-slate-400 mt-0.5">•</span>
                            <span>{reason}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
          )}

          {/* Timeline */}
          <AccordionItem value="timeline">
            <AccordionTrigger className="text-xs">
              Timeline
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-2.5 text-sm">
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Created</p>
                  <p className="text-slate-700 dark:text-slate-300 text-xs">
                    {format(new Date(lead.createdAt), 'MMM d, yyyy')}
                  </p>
                </div>
                
                {lead.lastInboundAt && (
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Last Inbound</p>
                    <p className="text-slate-700 dark:text-slate-300 text-xs">
                      {format(new Date(lead.lastInboundAt), 'MMM d, h:mm a')}
                    </p>
                  </div>
                )}
                
                {lead.lastOutboundAt && (
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Last Outbound</p>
                    <p className="text-slate-700 dark:text-slate-300 text-xs">
                      {format(new Date(lead.lastOutboundAt), 'MMM d, h:mm a')}
                    </p>
                  </div>
                )}
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </div>
  )
}
