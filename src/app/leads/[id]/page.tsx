'use client'

/**
 * LEAD DETAIL PAGE - MOBILE-FIRST
 * Mobile: Chat-first with bottom action dock + info drawer
 * Desktop: 3-column layout
 */

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { MainLayout } from '@/components/layout/MainLayout'
import { LeadDNA } from '@/components/leads/LeadDNA'
import { ConversationWorkspace } from '@/components/leads/ConversationWorkspace'
import { NextBestActionPanel } from '@/components/leads/NextBestActionPanel'
import { LeadProgressBar } from '@/components/leads/LeadProgressBar'
import { FocusModeBanner } from '@/components/dashboard/FocusModeBanner'
import { ArrowLeft, Info, MessageSquare, Phone, Send, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'

export default function LeadDetailPage({ 
  params
}: {
  params: Promise<{ id: string }>
}) {
  const [leadId, setLeadId] = useState<number | null>(null)
  const [lead, setLead] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [channel, setChannel] = useState('whatsapp')
  const [actionPending, setActionPending] = useState(false)
  const [infoSheetOpen, setInfoSheetOpen] = useState(false)
  const [composerOpen, setComposerOpen] = useState(true)
  const router = useRouter()

  useEffect(() => {
    async function init() {
      const resolved = await params
      const id = parseInt(resolved.id)
      if (isNaN(id)) {
        router.push('/leads')
        return
      }
      setLeadId(id)
      await loadLead(id)
    }
    init()
  }, [params, router])

  async function loadLead(id: number) {
    try {
      const res = await fetch(`/api/leads/${id}`)
      if (res.ok) {
        const data = await res.json()
        setLead(data.lead)
      }
    } catch (error) {
      console.error('Failed to load lead:', error)
    } finally {
      setLoading(false)
    }
  }

  async function handleStageChange(newStage: string) {
    if (!leadId) return
    
    try {
      const res = await fetch(`/api/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: newStage }),
      })
      if (res.ok) {
        await loadLead(leadId)
      }
    } catch (error) {
      console.error('Failed to update stage:', error)
    }
  }

  async function handleSendMessage(message: string) {
    if (!leadId) return
    
    try {
      const res = await fetch(`/api/leads/${leadId}/messages/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: channel.toUpperCase(),
          body: message,
        }),
      })
      if (res.ok) {
        await loadLead(leadId)
      }
    } catch (error) {
      console.error('Failed to send message:', error)
    }
  }

  function getPrimaryAction() {
    if (!lead) return null
    if (lead.lastInboundAt) {
      const hoursSince = (new Date().getTime() - new Date(lead.lastInboundAt).getTime()) / (1000 * 60 * 60)
      if (hoursSince > 24) {
        return { label: 'Reply Now', urgency: 'urgent', url: `#reply` }
      }
    }
    if (lead.stage === 'PROPOSAL_SENT' || lead.stage === 'QUOTE_SENT') {
      return { label: 'Follow Up', urgency: 'high', url: `#followup` }
    }
    return { label: 'Continue', urgency: 'normal', url: `#continue` }
  }

  if (loading || !leadId) {
    return (
      <MainLayout>
        <div className="h-screen flex flex-col">
          <div className="h-16 border-b">
            <Skeleton className="h-full" />
          </div>
          <div className="flex-1">
            <Skeleton className="h-full" />
          </div>
        </div>
      </MainLayout>
    )
  }

  if (!lead) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-screen">
          <div className="text-center">
            <p className="text-slate-500">Lead not found</p>
            <Button onClick={() => router.push('/leads')} className="mt-4">
              Back to Leads
            </Button>
          </div>
        </div>
      </MainLayout>
    )
  }

  const primaryAction = getPrimaryAction()
  const serviceName = lead?.serviceType?.name || lead?.serviceTypeEnum || lead?.requestedServiceRaw || 'Not specified'

  const isFocusMode = typeof window !== 'undefined' && sessionStorage.getItem('focusMode') === 'true'

  return (
    <MainLayout>
      <FocusModeBanner />
      {/* Mobile Layout (<1024px) */}
      <div className={cn(
        "lg:hidden h-screen flex flex-col transition-opacity duration-300",
        isFocusMode && "opacity-100"
      )}>
        {/* Sticky Header */}
        <div className="h-16 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between px-4 flex-shrink-0 z-20">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push('/leads')}
              className="rounded-lg flex-shrink-0"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="flex-1 min-w-0">
              <h1 className="text-base font-semibold text-slate-900 dark:text-slate-100 truncate">
                {lead.contact?.fullName || 'Unknown Lead'}
              </h1>
              <div className="flex items-center gap-2 mt-0.5">
                <Badge variant="outline" className="text-xs">
                  {serviceName}
                </Badge>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {primaryAction && (
              <Button
                size="sm"
                className={cn(
                  "rounded-lg text-xs font-semibold",
                  primaryAction.urgency === 'urgent' && "bg-blue-600 hover:bg-blue-700 border-2 border-red-500",
                  primaryAction.urgency === 'high' && "bg-orange-600 hover:bg-orange-700",
                  "bg-blue-600 hover:bg-blue-700"
                )}
                onClick={() => setComposerOpen(true)}
              >
                {primaryAction.label}
              </Button>
            )}
            <Sheet open={infoSheetOpen} onOpenChange={setInfoSheetOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="sm" className="rounded-lg">
                  <Info className="h-4 w-4" />
                </Button>
              </SheetTrigger>
              <SheetContent side="bottom" className="max-h-[85vh]">
                <SheetHeader>
                  <SheetTitle>Lead Details</SheetTitle>
                </SheetHeader>
                <div className="p-6">
                  <LeadDNA lead={lead} />
                  {lead.tasks && lead.tasks.length > 0 && (
                    <div className="mt-6 space-y-3">
                      <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Tasks</h3>
                      {lead.tasks.slice(0, 5).map((task: any) => (
                        <div key={task.id} className="p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{task.title}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>

        {/* Conversation - Full Screen */}
        <div className="flex-1 flex flex-col min-h-0 pb-20">
          <ConversationWorkspace
            leadId={leadId}
            channel={channel}
            onSend={handleSendMessage}
            composerOpen={composerOpen}
            onComposerChange={setComposerOpen}
          />
        </div>

        {/* Bottom Action Dock */}
        <div className="fixed bottom-0 left-0 right-0 z-30 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 lg:hidden">
          <div className="grid grid-cols-4 h-16">
            <Button
              variant="ghost"
              className="flex flex-col items-center justify-center gap-1 rounded-none"
              onClick={() => setComposerOpen(true)}
            >
              <MessageSquare className="h-5 w-5" />
              <span className="text-xs">Reply</span>
            </Button>
            <Button
              variant="ghost"
              className="flex flex-col items-center justify-center gap-1 rounded-none"
              onClick={() => window.location.href = `tel:${lead.contact?.phone}`}
            >
              <Phone className="h-5 w-5" />
              <span className="text-xs">Call</span>
            </Button>
            <Button
              variant="ghost"
              className="flex flex-col items-center justify-center gap-1 rounded-none"
              onClick={() => window.open(`https://wa.me/${lead.contact?.phone?.replace(/[^0-9]/g, '')}`, '_blank')}
            >
              <Send className="h-5 w-5" />
              <span className="text-xs">WhatsApp</span>
            </Button>
            <Sheet open={infoSheetOpen} onOpenChange={setInfoSheetOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  className="flex flex-col items-center justify-center gap-1 rounded-none"
                >
                  <Zap className="h-5 w-5" />
                  <span className="text-xs">Action</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="bottom" className="max-h-[85vh]">
                <SheetHeader>
                  <SheetTitle>Next Best Action</SheetTitle>
                </SheetHeader>
                <div className="p-6">
                  <NextBestActionPanel
                    leadId={leadId}
                    lead={lead}
                    tasks={lead.tasks || []}
                    onActionPending={setActionPending}
                  />
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>

      {/* Desktop Layout (>=1024px) */}
      <div className={cn(
        "hidden lg:flex h-screen flex-col transition-opacity duration-300",
        isFocusMode && "opacity-100"
      )}>
        {/* Sticky Header */}
        <div className="h-16 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between px-4 sm:px-6 flex-shrink-0 z-10">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push('/leads')}
              className="rounded-lg"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              <span>Back</span>
            </Button>
            <div>
              <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                {lead.contact?.fullName || 'Unknown Lead'}
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Lead #{lead.id}
              </p>
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <LeadProgressBar
          currentStage={lead.stage}
          leadId={leadId}
          onStageChange={handleStageChange}
        />

        {/* 3-Column Layout */}
        <div className={cn(
          "flex-1 flex overflow-hidden transition-opacity duration-300",
          actionPending && "opacity-60"
        )}>
          {/* Left: Lead DNA */}
          <div className={cn(
            "w-72 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex-shrink-0 overflow-y-auto transition-opacity",
            actionPending && "opacity-50"
          )}>
            <LeadDNA lead={lead} />
          </div>

          {/* Center: Conversation */}
          <div className={cn(
            "flex-1 flex flex-col min-w-0 transition-opacity",
            actionPending && "opacity-50"
          )}>
            <ConversationWorkspace
              leadId={leadId}
              channel={channel}
              onSend={handleSendMessage}
            />
          </div>

          {/* Right: Next Best Action */}
          <div className={cn(
            "w-96 border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex-shrink-0 overflow-y-auto",
            actionPending && "ring-2 ring-primary ring-offset-2"
          )}>
            <NextBestActionPanel
              leadId={leadId}
              lead={lead}
              tasks={lead.tasks || []}
              onActionPending={setActionPending}
            />
          </div>
        </div>
      </div>
    </MainLayout>
  )
}
