'use client'

/**
 * LEAD DNA - INTERACTIVE PROFILE + PROGRESS
 * 
 * Premium, Odoo-like but modern component showing:
 * - Identity (name, phone, email, channels, owner)
 * - Qualification Progress (checklist with 0/5...5/5 progress)
 * - Expiry Timeline (explicit dates only)
 * - Sponsor Name (searchable + linkable)
 * - Documents (upload placeholders)
 * 
 * UX RATIONALE:
 * - Qualification progress = staff know exactly what's missing
 * - Expiry timeline = no surprises, clear renewal schedule
 * - Sponsor search = quick linking to existing sponsors
 * - Interactive = staff can update fields inline
 */

import { useState, useEffect, useMemo, memo } from 'react'
import { User, Phone, Mail, Target, MessageSquare, Calendar, FileText, Search, Plus, CheckCircle2, Circle, Clock, AlertCircle } from 'lucide-react'
import { format, differenceInDays, parseISO } from 'date-fns'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/ui/toast'
import { getServiceDisplayLabel } from '@/lib/services/labels'

interface LeadDNAProps {
  lead: {
    id: number
    contact?: {
      id?: number
      fullName?: string | null
      phone?: string | null
      email?: string | null
      nationality?: string | null
      localSponsorName?: string | null
    } | null
    serviceTypeEnum?: string | null
    requestedServiceRaw?: string | null
    serviceType?: {
      name: string
    } | null
    expiryDate?: Date | string | null
    visaExpiryDate?: Date | string | null
    permitExpiryDate?: Date | string | null
    businessActivityRaw?: string | null
    ownerId?: number | null
    assignedUser?: {
      id: number
      name: string | null
    } | null
    conversations?: Array<{
      channel: string
    }> | null
  }
}

interface QualificationField {
  key: string
  label: string
  value: string | null | undefined
  required: boolean
}

function QualificationProgress({ lead }: { lead: LeadDNAProps['lead'] }) {
  const [knownFields, setKnownFields] = useState<any>({})
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const { showToast } = useToast()

  useEffect(() => {
    loadQualificationData()
  }, [lead.id])

  async function loadQualificationData() {
    try {
      // Load conversation state to get knownFields
      const res = await fetch(`/api/leads/${lead.id}/conversation-state`)
      if (res.ok) {
        const data = await res.json()
        setKnownFields(data.knownFields || {})
      }
    } catch (error) {
      console.error('Failed to load qualification data:', error)
    } finally {
      setLoading(false)
    }
  }

  const serviceKey = lead.serviceTypeEnum?.toLowerCase() || ''
  const isBusinessSetup = serviceKey.includes('business') || serviceKey.includes('setup')
  const isFreelanceVisa = serviceKey.includes('freelance')

  // Determine required fields based on service type
  const requiredFields: QualificationField[] = useMemo(() => {
    if (isBusinessSetup) {
      return [
        { key: 'name', label: 'Full Name', value: lead.contact?.fullName || knownFields.name, required: true },
        { key: 'businessActivity', label: 'Business Activity', value: lead.businessActivityRaw || knownFields.businessActivity, required: true },
        { key: 'mainlandOrFreezone', label: 'Mainland or Freezone', value: knownFields.mainlandOrFreezone, required: true },
        { key: 'partnersCount', label: '# Partners', value: knownFields.partnersCount?.toString() || knownFields.counts?.partners?.toString(), required: false },
        { key: 'visasCount', label: '# Visas', value: knownFields.visasCount?.toString() || knownFields.counts?.visas?.toString(), required: false },
      ]
    } else if (isFreelanceVisa) {
      return [
        { key: 'name', label: 'Full Name', value: lead.contact?.fullName || knownFields.name, required: true },
        { key: 'nationality', label: 'Nationality', value: lead.contact?.nationality || knownFields.nationality, required: true },
        { key: 'passport', label: 'Passport', value: knownFields.passport, required: false },
        { key: 'photo', label: 'Photo', value: knownFields.photo, required: false },
      ]
    } else {
      // Default: name, service, nationality
      return [
        { key: 'name', label: 'Full Name', value: lead.contact?.fullName || knownFields.name, required: true },
        { key: 'service', label: 'Service', value: lead.serviceType?.name || lead.serviceTypeEnum || lead.requestedServiceRaw, required: true },
        { key: 'nationality', label: 'Nationality', value: lead.contact?.nationality || knownFields.nationality, required: true },
      ]
    }
  }, [lead, knownFields, isBusinessSetup, isFreelanceVisa])

  const completedCount = requiredFields.filter(f => f.value && f.value.trim() !== '').length
  const totalCount = requiredFields.length
  const progressPercent = (completedCount / totalCount) * 100

  function handleAskNextQuestion() {
    // Open composer and focus
    const composer = document.querySelector('textarea[placeholder*="message"]') as HTMLTextAreaElement
    if (composer) {
      composer.focus()
      composer.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
    showToast('Composer opened - ask the next question', 'info')
  }

  const missingFields = requiredFields.filter(f => f.required && (!f.value || f.value.trim() === ''))

  if (loading) {
    return (
      <Card className="card-premium p-4">
        <div className="h-24 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
      </Card>
    )
  }

  return (
    <Card className="card-premium p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-body font-semibold text-slate-900 dark:text-slate-100">
          Qualification Progress
        </h3>
        <Badge className="chip">
          {completedCount}/{totalCount}
        </Badge>
      </div>

      {/* Progress Bar */}
      <div className="mb-4">
        <div className="w-full bg-slate-200 dark:bg-slate-800 rounded-full h-2 mb-2">
          <div
            className={cn(
              "h-2 rounded-full transition-all duration-300",
              progressPercent === 100 ? "bg-green-500" : progressPercent >= 60 ? "bg-blue-500" : "bg-amber-500"
            )}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <p className="text-meta muted-text">
          {progressPercent === 100 ? 'Complete' : `${Math.round(progressPercent)}% complete`}
        </p>
      </div>

      {/* Checklist */}
      <div className="space-y-2 mb-4">
        {requiredFields.map((field) => {
          const isComplete = field.value && field.value.trim() !== ''
          return (
            <div key={field.key} className="flex items-center gap-2">
              {isComplete ? (
                <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 flex-shrink-0" />
              ) : (
                <Circle className="h-4 w-4 text-slate-400 flex-shrink-0" />
              )}
              <span className={cn(
                "text-body",
                isComplete ? "text-slate-900 dark:text-slate-100" : "muted-text"
              )}>
                {field.label}
              </span>
              {isComplete && (
                <Badge className="chip ml-auto">
                  {field.value}
                </Badge>
              )}
            </div>
          )
        })}
      </div>

      {/* Missing Fields + CTA */}
      {missingFields.length > 0 && (
        <div className="pt-3 border-t border-slate-200/60 dark:border-slate-800/60">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="text-meta muted-text">Missing:</span>
            {missingFields.map((field) => (
              <Badge key={field.key} className="chip bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
                {field.label}
              </Badge>
            ))}
          </div>
          <Button
            size="sm"
            variant="outline"
            className="w-full rounded-[12px]"
            onClick={handleAskNextQuestion}
          >
            Ask next question
          </Button>
        </div>
      )}
    </Card>
  )
}

function ExpiryTimeline({ lead }: { lead: LeadDNAProps['lead'] }) {
  const expiries = useMemo(() => {
    const items: Array<{ type: string; date: Date; daysUntil: number }> = []
    
    if (lead.expiryDate) {
      const date = typeof lead.expiryDate === 'string' ? parseISO(lead.expiryDate) : lead.expiryDate
      const daysUntil = differenceInDays(date, new Date())
      if (daysUntil > 0 && daysUntil <= 365) {
        items.push({ type: 'General Expiry', date, daysUntil })
      }
    }
    if (lead.visaExpiryDate) {
      const date = typeof lead.visaExpiryDate === 'string' ? parseISO(lead.visaExpiryDate) : lead.visaExpiryDate
      const daysUntil = differenceInDays(date, new Date())
      if (daysUntil > 0 && daysUntil <= 365) {
        items.push({ type: 'Visa Expiry', date, daysUntil })
      }
    }
    if (lead.permitExpiryDate) {
      const date = typeof lead.permitExpiryDate === 'string' ? parseISO(lead.permitExpiryDate) : lead.permitExpiryDate
      const daysUntil = differenceInDays(date, new Date())
      if (daysUntil > 0 && daysUntil <= 365) {
        items.push({ type: 'Permit Expiry', date, daysUntil })
      }
    }

    return items.sort((a, b) => a.daysUntil - b.daysUntil)
  }, [lead.expiryDate, lead.visaExpiryDate, lead.permitExpiryDate])

  if (expiries.length === 0) {
    return null
  }

  function getExpiryBadge(daysUntil: number) {
    if (daysUntil <= 7) return <Badge className="chip bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400">{daysUntil}d</Badge>
    if (daysUntil <= 30) return <Badge className="chip bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">{daysUntil}d</Badge>
    if (daysUntil <= 60) return <Badge className="chip bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400">{daysUntil}d</Badge>
    return <Badge className="chip">{daysUntil}d</Badge>
  }

  return (
    <Card className="card-premium p-4">
      <div className="flex items-center gap-2 mb-3">
        <Calendar className="h-4 w-4 text-slate-500" />
        <h3 className="text-body font-semibold text-slate-900 dark:text-slate-100">
          Expiry Timeline
        </h3>
      </div>
      <div className="space-y-2">
        {expiries.map((expiry, idx) => (
          <div key={idx} className="flex items-center justify-between p-2 rounded-[10px] bg-slate-50 dark:bg-slate-900/50">
            <div>
              <p className="text-body font-medium text-slate-900 dark:text-slate-100">
                {expiry.type}
              </p>
              <p className="text-meta muted-text">
                {format(expiry.date, 'MMM d, yyyy')}
              </p>
            </div>
            {getExpiryBadge(expiry.daysUntil)}
          </div>
        ))}
      </div>
    </Card>
  )
}

function SponsorSearch({ lead, onUpdate }: { lead: LeadDNAProps['lead']; onUpdate?: () => void }) {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Array<{ name: string; count: number; lastUsedAt: string }>>([])
  const [searching, setSearching] = useState(false)
  const { showToast } = useToast()

  async function handleSearch(query: string) {
    if (query.length < 2) {
      setSearchResults([])
      return
    }

    setSearching(true)
    try {
      const res = await fetch(`/api/sponsors/search?q=${encodeURIComponent(query)}`)
      if (res.ok) {
        const data = await res.json()
        setSearchResults(data.sponsors || [])
      }
    } catch (error) {
      console.error('Failed to search sponsors:', error)
    } finally {
      setSearching(false)
    }
  }

  async function handleSelectSponsor(sponsorName: string) {
    try {
      // Update contact's localSponsorName (sponsor is stored on contact, not lead)
      const contactId = lead.contact?.id
      if (contactId) {
        const res = await fetch(`/api/contacts/${contactId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ localSponsorName: sponsorName }),
        })
        if (res.ok) {
          showToast('Sponsor updated', 'success')
          setSearchQuery('')
          setSearchResults([])
          if (onUpdate) onUpdate()
        }
      } else {
        showToast('Contact not found', 'error')
      }
    } catch (error) {
      console.error('Failed to update sponsor:', error)
      showToast('Failed to update sponsor', 'error')
    }
  }

  return (
    <Card className="card-premium p-4">
      <div className="flex items-center gap-2 mb-3">
        <Search className="h-4 w-4 text-slate-500" />
        <h3 className="text-body font-semibold text-slate-900 dark:text-slate-100">
          Sponsor
        </h3>
      </div>
      <div className="space-y-2">
        <Input
          value={searchQuery || lead.contact?.localSponsorName || ''}
          onChange={(e) => {
            setSearchQuery(e.target.value)
            handleSearch(e.target.value)
          }}
          placeholder="Search or enter sponsor name..."
          className="rounded-[12px] text-body"
        />
        {searchResults.length > 0 && (
          <div className="space-y-1">
            {searchResults.slice(0, 3).map((sponsor, idx) => (
              <button
                key={idx}
                onClick={() => handleSelectSponsor(sponsor.name)}
                className="w-full text-left p-2 rounded-[10px] hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <p className="text-body font-medium text-slate-900 dark:text-slate-100">
                  {sponsor.name}
                </p>
                <p className="text-meta muted-text">
                  Used {sponsor.count} time{sponsor.count !== 1 ? 's' : ''}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>
    </Card>
  )
}

export const LeadDNA = memo(function LeadDNA({ lead }: LeadDNAProps) {
  const contact = lead.contact
  
  // Use service label map for consistent display (even if serviceTypeId is null)
  const serviceName = useMemo(() => {
    return getServiceDisplayLabel(
      lead.serviceTypeEnum,
      lead.serviceType?.name,
      lead.requestedServiceRaw
    )
  }, [lead.serviceTypeEnum, lead.serviceType?.name, lead.requestedServiceRaw])
  
  const channels = useMemo(() => {
    return lead.conversations?.map(c => c.channel) || []
  }, [lead.conversations])

  return (
    <div className="h-full overflow-y-auto">
      <div className="space-y-4 p-4 sm:p-6">
        {/* Identity Section */}
        <Card className="card-premium p-4">
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                <User className="h-5 w-5 text-slate-500 dark:text-slate-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-body font-semibold text-slate-900 dark:text-slate-100 truncate">
                  {contact?.fullName || 'Unknown'}
                </p>
                {contact?.nationality && (
                  <p className="text-meta muted-text mt-0.5">
                    {contact.nationality}
                  </p>
                )}
              </div>
            </div>

            {contact?.phone && (
              <div className="flex items-center gap-2 text-body pl-13">
                <Phone className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                <a 
                  href={`tel:${contact.phone}`}
                  className="text-slate-600 dark:text-slate-400 hover:text-primary transition-colors truncate"
                >
                  {contact.phone}
                </a>
              </div>
            )}

            {contact?.email && (
              <div className="flex items-center gap-2 text-body pl-13">
                <Mail className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                <a 
                  href={`mailto:${contact.email}`}
                  className="text-slate-600 dark:text-slate-400 hover:text-primary transition-colors truncate"
                >
                  {contact.email}
                </a>
              </div>
            )}

            {/* Channel Badges */}
            {channels.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap pl-13">
                {channels.map((channel) => (
                  <Badge key={channel} className="chip capitalize">
                    {channel}
                  </Badge>
                ))}
              </div>
            )}

            {/* Assigned Owner */}
            {lead.assignedUser && (
              <div className="flex items-center gap-2 text-meta muted-text pl-13">
                <User className="h-3.5 w-3.5" />
                <span>Assigned to: {lead.assignedUser.name}</span>
              </div>
            )}
          </div>
        </Card>

        {/* Service */}
        <Card className="card-premium p-4">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-slate-500" />
            <span className="text-body font-medium text-slate-900 dark:text-slate-100">
              {serviceName}
            </span>
          </div>
          {lead.requestedServiceRaw && lead.requestedServiceRaw !== serviceName && (
            <p className="text-meta muted-text italic mt-1 pl-6">
              "{lead.requestedServiceRaw}"
            </p>
          )}
        </Card>

        {/* Qualification Progress */}
        <QualificationProgress lead={lead} />

        {/* Expiry Timeline */}
        <ExpiryTimeline lead={lead} />

        {/* Sponsor Search */}
        <SponsorSearch lead={lead} />

        {/* Documents Placeholder */}
        <Card className="card-premium p-4">
          <div className="flex items-center gap-2 mb-3">
            <FileText className="h-4 w-4 text-slate-500" />
            <h3 className="text-body font-semibold text-slate-900 dark:text-slate-100">
              Documents
            </h3>
          </div>
          <p className="text-meta muted-text">
            Document upload coming soon
          </p>
        </Card>
      </div>
    </div>
  )
})
