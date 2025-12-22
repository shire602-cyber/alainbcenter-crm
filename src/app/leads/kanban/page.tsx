'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { MainLayout } from '@/components/layout/MainLayout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Avatar } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import {
  PIPELINE_STAGES,
  PIPELINE_STAGE_LABELS,
  PIPELINE_STAGE_COLORS,
  getAiScoreCategory,
  LEAD_SOURCE_LABELS,
  type PipelineStage,
} from '@/lib/constants'
import {
  KanbanSquare,
  MessageSquare,
  Calendar,
  AlertCircle,
  ExternalLink,
  Loader2,
  Zap,
  Eye,
} from 'lucide-react'
import { format, isToday, isPast, differenceInDays } from 'date-fns'
import { cn } from '@/lib/utils'

type Contact = {
  id: number
  fullName: string
  phone: string
  email?: string | null
  source?: string | null
}

type Lead = {
  id: number
  leadType: string | null
  serviceType?: { name: string } | null
  status: string
  pipelineStage: string
  aiScore: number | null
  expiryDate: string | null
  nextFollowUpAt: string | null
  createdAt: string
  contact: Contact
}

export default function KanbanPage() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [draggedLead, setDraggedLead] = useState<Lead | null>(null)
  const [updating, setUpdating] = useState<number | null>(null)

  async function loadLeads() {
    try {
      setLoading(true)
      const res = await fetch('/api/leads')
      const data = await res.json()
      // Handle both old format (array) and new format (object with leads and pagination)
      setLeads(Array.isArray(data) ? data : (data.leads || []))
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadLeads()
  }, [])

  async function handleStageChange(leadId: number, newStage: PipelineStage) {
    try {
      setUpdating(leadId)
      const res = await fetch(`/api/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pipelineStage: newStage }),
      })

      if (!res.ok) throw new Error('Failed to update stage')

      // Update local state optimistically
      setLeads((prev) =>
        prev.map((lead) =>
          lead.id === leadId ? { ...lead, pipelineStage: newStage } : lead
        )
      )
    } catch (err) {
      console.error('Error updating stage:', err)
      loadLeads()
    } finally {
      setUpdating(null)
    }
  }

  function handleDragStart(e: React.DragEvent, lead: Lead) {
    setDraggedLead(lead)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', lead.id.toString())
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  function handleDrop(e: React.DragEvent, targetStage: PipelineStage) {
    e.preventDefault()
    if (!draggedLead) return

    // Only update if stage changed
    if (draggedLead.pipelineStage !== targetStage) {
      handleStageChange(draggedLead.id, targetStage)
    }

    setDraggedLead(null)
  }

  function getWhatsAppLink(phone: string, name: string) {
    const cleanPhone = phone.replace(/[^0-9]/g, '')
    const message = encodeURIComponent(
      `Hello ${name}, this is Alain Business Center. How can we assist you today?`
    )
    return `https://wa.me/${cleanPhone}?text=${message}`
  }

  function getWarningBadges(lead: Lead) {
    const warnings: Array<{ text: string; variant: 'destructive' | 'warning' }> = []
    const today = new Date()
    today.setUTCHours(0, 0, 0, 0)

    // Check expiry date (within 90 days)
    if (lead.expiryDate) {
      const expiryDate = new Date(lead.expiryDate)
      expiryDate.setUTCHours(0, 0, 0, 0)
      const daysUntilExpiry = differenceInDays(expiryDate, today)

      if (daysUntilExpiry >= 0 && daysUntilExpiry <= 90) {
        warnings.push({
          text: daysUntilExpiry === 0 ? 'Expires today!' : `Expires in ${daysUntilExpiry} days`,
          variant: daysUntilExpiry <= 7 ? 'destructive' : 'warning',
        })
      } else if (daysUntilExpiry < 0) {
        warnings.push({
          text: `Expired ${Math.abs(daysUntilExpiry)} days ago`,
          variant: 'destructive',
        })
      }
    }

    // Check follow-up (today or overdue)
    if (lead.nextFollowUpAt) {
      const followUpDate = new Date(lead.nextFollowUpAt)
      followUpDate.setUTCHours(0, 0, 0, 0)
      const daysUntilFollowUp = differenceInDays(followUpDate, today)

      if (daysUntilFollowUp <= 0) {
        warnings.push({
          text: daysUntilFollowUp === 0 ? 'Follow-up today' : 'Follow-up overdue',
          variant: 'destructive',
        })
      }
    }

    return warnings
  }

  // Group leads by stage
  const leadsByStage = PIPELINE_STAGES.reduce(
    (acc, stage) => {
      acc[stage] = leads.filter((lead) => lead.pipelineStage === stage)
      return acc
    },
    {} as Record<PipelineStage, Lead[]>
  )

  if (loading) {
    return (
      <MainLayout>
        <div className="space-y-8 animate-fade-in">
          <div className="flex items-center justify-between">
            <Skeleton className="h-12 w-64" />
            <Skeleton className="h-10 w-32" />
          </div>
          <div className="flex gap-4 overflow-x-auto">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-96 w-72 flex-shrink-0" />
            ))}
          </div>
        </div>
      </MainLayout>
    )
  }

  return (
    <MainLayout>
      <div className="space-y-8 animate-fade-in">
        {/* Premium Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/20">
                <KanbanSquare className="h-6 w-6 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <h1 className="text-3xl font-semibold tracking-tight">
                  Leads Pipeline
                </h1>
                <p className="text-muted-foreground mt-1 text-lg">
                  Drag cards between columns to update pipeline stage
                </p>
              </div>
            </div>
          </div>
          <Button variant="outline" asChild>
            <Link href="/leads">
              <ExternalLink className="h-4 w-4 mr-2" />
              List View
            </Link>
          </Button>
        </div>

        {/* Kanban Board */}
        <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent">
          {PIPELINE_STAGES.map((stage) => {
            const stageLeads = leadsByStage[stage]
            const stageColorClass = PIPELINE_STAGE_COLORS[stage] || 'bg-gray-100'

            return (
              <div
                key={stage}
                className={cn(
                  'flex-shrink-0 w-80 bg-card rounded-lg border shadow-sm',
                  draggedLead && draggedLead.pipelineStage !== stage
                    ? 'ring-2 ring-primary ring-offset-2'
                    : ''
                )}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, stage)}
              >
                {/* Column Header */}
                <CardHeader className={cn('rounded-t-lg border-b', stageColorClass)}>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-sm font-semibold text-foreground">
                        {PIPELINE_STAGE_LABELS[stage]}
                      </CardTitle>
                      <p className="text-xs text-muted-foreground mt-1">
                        {stageLeads.length} {stageLeads.length === 1 ? 'lead' : 'leads'}
                      </p>
                    </div>
                  </div>
                </CardHeader>

                {/* Cards Container */}
                <CardContent className="p-3 space-y-3 min-h-[400px] max-h-[calc(100vh-300px)] overflow-y-auto">
                  {stageLeads.map((lead) => {
                    const scoreCategory = getAiScoreCategory(lead.aiScore)
                    const warnings = getWarningBadges(lead)
                    const isUpdating = updating === lead.id

                    return (
                      <Card
                        key={lead.id}
                        draggable={!isUpdating}
                        onDragStart={(e) => handleDragStart(e, lead)}
                        className={cn(
                          'cursor-move transition-all duration-200 hover:shadow-lg group',
                          isUpdating && 'opacity-50 cursor-not-allowed',
                          draggedLead?.id === lead.id && 'opacity-50 scale-95'
                        )}
                      >
                        <CardContent className="p-4 space-y-3">
                          {/* Header with Name and Actions */}
                          <div className="flex items-start justify-between gap-2">
                            <Link
                              href={`/leads/${lead.id}`}
                              className="flex items-center gap-2 flex-1 min-w-0 group/link"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Avatar 
                                fallback={lead.contact.fullName}
                                size="sm"
                                className="flex-shrink-0"
                              />
                              <div className="min-w-0 flex-1">
                                <p className="font-semibold text-sm text-foreground truncate group-hover/link:text-primary transition-colors">
                                  {lead.contact.fullName}
                                </p>
                                <p className="text-xs text-muted-foreground truncate">
                                  {lead.contact.phone}
                                </p>
                              </div>
                            </Link>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              {lead.contact.phone && (
                                <a
                                  href={getWhatsAppLink(lead.contact.phone, lead.contact.fullName)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-1.5 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded transition-colors"
                                  title="Open WhatsApp"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <MessageSquare className="h-4 w-4" />
                                </a>
                              )}
                              <Link
                                href={`/leads/${lead.id}`}
                                className="p-1.5 text-muted-foreground hover:bg-muted rounded transition-colors"
                                title="View Details"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Eye className="h-4 w-4" />
                              </Link>
                              {isUpdating && (
                                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                              )}
                            </div>
                          </div>

                          {/* Service & Source */}
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="outline" className="text-xs">
                              {lead.serviceType?.name || lead.leadType || 'General'}
                            </Badge>
                            {lead.contact.source && (
                              <Badge variant="secondary" className="text-xs">
                                {LEAD_SOURCE_LABELS[lead.contact.source as keyof typeof LEAD_SOURCE_LABELS] ||
                                  lead.contact.source}
                              </Badge>
                            )}
                          </div>

                          {/* AI Score */}
                          {lead.aiScore !== null && (
                            <div>
                              <Badge
                                variant={scoreCategory}
                                className="text-xs"
                              >
                                {scoreCategory} ({lead.aiScore})
                              </Badge>
                            </div>
                          )}

                          {/* Warning Badges */}
                          {warnings.length > 0 && (
                            <div className="space-y-1">
                              {warnings.map((warning, idx) => (
                                <Badge
                                  key={idx}
                                  variant={warning.variant}
                                  className="text-xs w-full justify-start gap-1"
                                >
                                  <AlertCircle className="h-3 w-3" />
                                  {warning.text}
                                </Badge>
                              ))}
                            </div>
                          )}

                          {/* Created Date */}
                          <p className="text-xs text-muted-foreground">
                            Created {format(new Date(lead.createdAt), 'MMM dd, yyyy')}
                          </p>
                        </CardContent>
                      </Card>
                    )
                  })}
                  {stageLeads.length === 0 && (
                    <div className="text-center text-xs text-muted-foreground py-12 border-2 border-dashed rounded-lg">
                      <KanbanSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>No leads in this stage</p>
                      <p className="text-[10px] mt-1">Drag cards here to move them</p>
                    </div>
                  )}
                </CardContent>
              </div>
            )
          })}
        </div>
      </div>
    </MainLayout>
  )
}
