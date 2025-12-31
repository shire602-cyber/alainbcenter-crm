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
import { useSmartPolling } from '@/hooks/useSmartPolling'
import { LeadCommandPalette } from '@/components/leads/LeadCommandPalette'

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
  const [actionSheetOpen, setActionSheetOpen] = useState(false)
  const [composerOpen, setComposerOpen] = useState(true)
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [fallbackInfo, setFallbackInfo] = useState<{ conversationId?: string | null; contactId?: string | null } | null>(null)
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

  // Smart polling for lead page (15s interval)
  useSmartPolling({
    fetcher: () => {
      if (leadId) {
        return loadLead(leadId)
      }
    },
    intervalMs: 15000, // 15s polling for lead detail
    enabled: !!leadId,
    pauseWhenHidden: true,
    onErrorBackoff: true,
  })

  async function loadLead(id: number) {
    try {
      // Get conversationId or contactId from URL search params for fallback
      const searchParams = new URLSearchParams(window.location.search)
      const conversationId = searchParams.get('conversationId')
      const contactId = searchParams.get('contactId')
      
      let url = `/api/leads/${id}`
      if (conversationId) url += `?conversationId=${conversationId}`
      else if (contactId) url += `?contactId=${contactId}`
      
      const res = await fetch(url)
      if (res.ok) {
        const data = await res.json()
        
        // Check if API returned a redirect hint (fallback resolution)
        if (data._redirect && data._redirect !== `/leads/${id}`) {
          console.log(`[Lead Page] Redirecting to ${data._redirect} (${data._fallbackReason})`)
          router.replace(data._redirect)
          return
        }
        
        setLead(data)
      } else if (res.status === 404) {
        const errorData = await res.json()
        setLead(null)
        // Store fallback info for empty state
        setFallbackInfo({
          conversationId: errorData._conversationId,
          contactId: errorData._contactId,
        })
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

  if (!lead && !loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-screen bg-app">
          <div className="text-center max-w-md mx-auto p-6">
            <div className="mb-6">
              <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-4">
                <Info className="h-8 w-8 text-slate-400" />
              </div>
              <h2 className="text-h1 font-semibold text-slate-900 dark:text-slate-100 mb-2">
                Lead Not Found
              </h2>
              <p className="text-body muted-text">
                The lead you're looking for doesn't exist or may have been removed.
              </p>
            </div>
            
            <div className="space-y-3">
              <Button 
                onClick={() => router.push('/leads')} 
                className="w-full"
                variant="default"
              >
                Back to Leads
              </Button>
              
              {fallbackInfo?.conversationId && (
                <Button 
                  onClick={() => router.push(`/inbox?conversationId=${fallbackInfo.conversationId}`)} 
                  className="w-full"
                  variant="outline"
                >
                  <MessageSquare className="h-4 w-4 mr-2" />
                  Open Inbox Conversation
                </Button>
              )}
              
              {fallbackInfo?.contactId && (
                <Button 
                  onClick={() => router.push(`/leads/new?contactId=${fallbackInfo.contactId}`)} 
                  className="w-full"
                  variant="outline"
                >
                  Create New Lead
                </Button>
              )}
            </div>
          </div>
        </div>
      </MainLayout>
    )
  }

  const primaryAction = getPrimaryAction()
  const serviceName = lead?.serviceType?.name || lead?.serviceTypeEnum || lead?.requestedServiceRaw || 'Not specified'

  const isFocusMode = typeof window !== 'undefined' && sessionStorage.getItem('focusMode') === 'true'

  // Keyboard shortcuts - PHASE C
  useEffect(() => {
    if (!leadId) return

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in input/textarea
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return
      }

      // Cmd+K or Ctrl+K: Open command palette
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setCommandPaletteOpen(true)
        return
      }

      // R: Focus reply composer
      if (e.key === 'r' && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        e.preventDefault()
        const composer = document.querySelector('textarea[placeholder*="message"]') as HTMLTextAreaElement
        if (composer) {
          composer.focus()
          composer.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
        setComposerOpen(true)
        return
      }

      // A: Open action panel/sheet
      if (e.key === 'a' && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        e.preventDefault()
        setActionSheetOpen(true)
        return
      }

      // T: Open create task dialog
      if (e.key === 't' && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        e.preventDefault()
        router.push(`/leads/${leadId}?action=task`)
        return
      }

      // S: Open snooze menu
      if (e.key === 's' && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        e.preventDefault()
        router.push(`/leads/${leadId}?action=snooze`)
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [leadId, router])

  return (
    <MainLayout>
      <FocusModeBanner />
      
      {/* Command Palette - PHASE C */}
      <LeadCommandPalette
        leadId={leadId}
        lead={lead}
        open={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
        onComposerFocus={() => {
          setComposerOpen(true)
          const composer = document.querySelector('textarea[placeholder*="message"]') as HTMLTextAreaElement
          if (composer) {
            composer.focus()
            composer.scrollIntoView({ behavior: 'smooth', block: 'center' })
          }
        }}
      />
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
            lead={lead}
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
            <Sheet open={actionSheetOpen} onOpenChange={setActionSheetOpen}>
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
                    onComposerFocus={() => {
                      setComposerOpen(true)
                      setActionSheetOpen(false)
                    }}
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
            "w-80 border-r border-subtle bg-card flex-shrink-0 overflow-y-auto transition-opacity",
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
              lead={lead}
              channel={channel}
              onSend={handleSendMessage}
            />
          </div>

          {/* Right: Next Best Action */}
          <div className={cn(
            "w-96 border-l border-subtle bg-card flex-shrink-0 overflow-y-auto",
            actionPending && "ring-2 ring-primary/20 ring-offset-2"
          )}>
            <NextBestActionPanel
              leadId={leadId}
              lead={lead}
              tasks={lead.tasks || []}
              onActionPending={setActionPending}
              onComposerFocus={() => {
                const composer = document.querySelector('textarea[placeholder*="message"]') as HTMLTextAreaElement
                if (composer) {
                  composer.focus()
                  composer.scrollIntoView({ behavior: 'smooth', block: 'center' })
                }
              }}
            />
          </div>
        </div>
      </div>
    </MainLayout>
  )
}
