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
import { LeadErrorBoundary } from '@/components/leads/LeadErrorBoundary'

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
  // CRITICAL: ALL useState hooks must be declared BEFORE any useEffect hooks
  // STEP 0: Build stamp for deployment verification
  const [buildInfo, setBuildInfo] = useState<{ buildId?: string; buildTime?: string } | null>(null)
  
  // CRITICAL: useRouter must be called after all useState hooks but before useEffect hooks
  const router = useRouter()

  // CRITICAL: All hooks must be called before any conditional returns
  useEffect(() => {
    async function init() {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/a9581599-2981-434f-a784-3293e02077df',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'page.tsx:46',message:'init() entry',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      const resolved = await params
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/a9581599-2981-434f-a784-3293e02077df',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'page.tsx:48',message:'params resolved',data:{resolvedId:resolved?.id,resolvedType:typeof resolved?.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      const id = parseInt(resolved.id)
      // #region agent log
      console.log('[LEAD-PAGE] parsed id:', { rawId: resolved.id, parsedId: id, isNaN: isNaN(id) })
      fetch('http://127.0.0.1:7242/ingest/a9581599-2981-434f-a784-3293e02077df',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'page.tsx:50',message:'parsed id',data:{rawId:resolved.id,parsedId:id,isNaN:isNaN(id)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      if (isNaN(id)) {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/a9581599-2981-434f-a784-3293e02077df',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'page.tsx:52',message:'redirecting due to NaN id',data:{rawId:resolved.id,parsedId:id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        router.push('/leads')
        return
      }
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/a9581599-2981-434f-a784-3293e02077df',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'page.tsx:55',message:'setting leadId',data:{leadId:id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      setLeadId(id)
      await loadLead(id)
    }
    init()
  }, [params, router])

  // Build stamp useEffect - called after all useState hooks
  useEffect(() => {
    fetch('/api/health')
      .then(res => res.json())
      .then(data => setBuildInfo({ buildId: data.buildId, buildTime: data.buildTime }))
      .catch(() => {})
  }, [])

  // Smart polling for lead page (15s interval) - ALWAYS call hook
  // CRITICAL: Must be called AFTER all other useState hooks to maintain consistent hook order
  useSmartPolling({
    fetcher: () => {
      if (leadId) {
        return loadLead(leadId)
      }
      return Promise.resolve() // Return resolved promise if no leadId
    },
    intervalMs: 15000, // 15s polling for lead detail
    enabled: !!leadId,
    pauseWhenHidden: true,
    onErrorBackoff: true,
  })

  // Keyboard shortcuts - PHASE C (client-only)
  // CRITICAL: Hook must be called unconditionally - guard logic inside
  useEffect(() => {
    // Guard logic inside hook - this is safe
    if (typeof window === 'undefined' || !leadId) return

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

      // Escape: Close command palette
      if (e.key === 'Escape' && commandPaletteOpen) {
        setCommandPaletteOpen(false)
        return
      }

      // 'i' key: Toggle info sheet
      if (e.key === 'i' && !commandPaletteOpen) {
        e.preventDefault()
        setInfoSheetOpen(!infoSheetOpen)
        return
      }

      // 'c' key: Focus composer
      if (e.key === 'c' && !commandPaletteOpen) {
        e.preventDefault()
        const composer = document.querySelector('textarea[placeholder*="message"]') as HTMLTextAreaElement
        if (composer) {
          composer.focus()
          composer.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [leadId, router, commandPaletteOpen, infoSheetOpen])

  async function loadLead(id: number) {
    // #region agent log
    console.log('[LEAD-PAGE] loadLead() entry:', { leadId: id })
    fetch('http://127.0.0.1:7242/ingest/a9581599-2981-434f-a784-3293e02077df',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'page.tsx:133',message:'loadLead() entry',data:{leadId:id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    try {
      // Get conversationId or contactId from URL search params for fallback
      const conversationId = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('conversationId') : null
      const contactId = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('contactId') : null
      
      let url = `/api/leads/${id}`
      if (conversationId) url += `?conversationId=${conversationId}`
      else if (contactId) url += `?contactId=${contactId}`
      
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/a9581599-2981-434f-a784-3293e02077df',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'page.tsx:143',message:'fetching API',data:{url,leadId:id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      const res = await fetch(url)
      // #region agent log
      console.log('[LEAD-PAGE] API response received:', { status: res.status, statusText: res.statusText, ok: res.ok, url })
      fetch('http://127.0.0.1:7242/ingest/a9581599-2981-434f-a784-3293e02077df',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'page.tsx:145',message:'API response received',data:{status:res.status,statusText:res.statusText,ok:res.ok},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      if (res.ok) {
        const data = await res.json()
        // #region agent log
        console.log('[LEAD-PAGE] API response data:', { hasRedirect: !!data._redirect, hasLead: !!data.lead, hasId: !!data.id, dataKeys: Object.keys(data), leadId: data.lead?.id || data.id })
        fetch('http://127.0.0.1:7242/ingest/a9581599-2981-434f-a784-3293e02077df',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'page.tsx:148',message:'API data parsed',data:{hasRedirect:!!data._redirect,redirectUrl:data._redirect,hasLead:!!data.lead,hasId:!!data.id,leadId:data.lead?.id || data.id,dataKeys:Object.keys(data)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
        // #endregion
        
        // Check if API returned a redirect hint (fallback resolution)
        if (data._redirect && data._redirect !== `/leads/${id}`) {
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/a9581599-2981-434f-a784-3293e02077df',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'page.tsx:151',message:'redirect triggered',data:{redirectUrl:data._redirect,reason:data._fallbackReason},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
          // #endregion
          console.log(`[Lead Page] Redirecting to ${data._redirect} (${data._fallbackReason})`)
          router.replace(data._redirect)
          return
        }
        
        // #region agent log
        console.log('[LEAD-PAGE] Setting lead data:', { hasDataLead: !!data.lead, hasDataId: !!data.id, leadId: data.lead?.id || data.id })
        fetch('http://127.0.0.1:7242/ingest/a9581599-2981-434f-a784-3293e02077df',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'page.tsx:156',message:'setting lead data',data:{leadId:data.lead?.id || data.id,hasContact:!!(data.lead?.contact || data.contact),usingFallback:!data.lead,hasDataLead:!!data.lead,dataKeys:Object.keys(data)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        // API returns { lead: {...} } structure (user changed it)
        // Handle both formats for backward compatibility
        const leadData = data.lead || data
        console.log('[LEAD-PAGE] Lead data to set:', { leadId: leadData?.id, hasContact: !!leadData?.contact, contactName: leadData?.contact?.fullName })
        setLead(leadData)
        setLoading(false)
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/a9581599-2981-434f-a784-3293e02077df',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'page.tsx:158',message:'loading set to false',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
        // #endregion
      } else if (res.status === 404) {
        const errorData = await res.json()
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/a9581599-2981-434f-a784-3293e02077df',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'page.tsx:162',message:'404 error',data:{errorData},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        setLead(null)
        setLoading(false)
        // Store fallback info for empty state
        setFallbackInfo({
          conversationId: errorData._conversationId,
          contactId: errorData._contactId,
        })
      } else {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/a9581599-2981-434f-a784-3293e02077df',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'page.tsx:170',message:'non-404 error',data:{status:res.status},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        setLoading(false)
      }
    } catch (error) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/a9581599-2981-434f-a784-3293e02077df',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'page.tsx:173',message:'loadLead() error',data:{errorMessage:error instanceof Error ? error.message : String(error)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      console.error('Failed to load lead:', error)
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
        const updated = await res.json()
        console.log('[LEAD-PAGE] Stage update response:', { hasLead: !!updated.lead, hasId: !!updated.id, leadId: updated.lead?.id || updated.id })
        setLead(updated.lead || updated)
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
        body: JSON.stringify({ message, channel }),
      })
      if (res.ok) {
        // Refresh lead data
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

  // PHASE 1 DEBUG: All hooks called before conditional returns
  // Loading state - render AFTER all hooks
  // CRITICAL: No hooks or conditional logic before early returns
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

  // Not found state - render AFTER all hooks
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

  return (
    <LeadErrorBoundary>
      <MainLayout>
        <FocusModeBanner />
      
      {/* Command Palette - PHASE C */}
      <LeadCommandPalette
        open={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
        leadId={leadId!}
        lead={lead}
      />

      {/* Mobile: Chat-first layout */}
      <div className="flex flex-col h-screen md:hidden" data-testid="lead-detail">
        {/* Header */}
        <div className="h-16 border-b border-subtle bg-app flex items-center justify-between px-4 shrink-0">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.push('/leads')}
              className="h-8 w-8"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="flex-1 min-w-0">
              <h1 className="text-h2 font-semibold text-slate-900 dark:text-slate-100 truncate">
                {lead?.contact?.fullName || 'Lead'}
              </h1>
              <p className="text-meta muted-text truncate">
                {serviceName}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setInfoSheetOpen(true)}
            className="h-8 w-8"
          >
            <Info className="h-4 w-4" />
          </Button>
        </div>

        {/* Conversation */}
        <div className="flex-1 min-h-0">
          <ConversationWorkspace
            leadId={leadId!}
            lead={lead}
            channel={channel}
            onSend={handleSendMessage}
            composerOpen={composerOpen}
            onComposerChange={setComposerOpen}
          />
        </div>

        {/* Bottom Action Dock */}
        <div className="h-16 border-t border-subtle bg-app flex items-center justify-between px-4 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setActionSheetOpen(true)}
            className="flex-1"
          >
            <Zap className="h-4 w-4 mr-2" />
            Actions
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setInfoSheetOpen(true)}
            className="flex-1"
          >
            <Info className="h-4 w-4 mr-2" />
            Info
          </Button>
        </div>

        {/* Info Sheet */}
        <Sheet open={infoSheetOpen} onOpenChange={setInfoSheetOpen}>
          <SheetContent side="bottom" className="h-[80vh] overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Lead Information</SheetTitle>
            </SheetHeader>
            <div className="mt-4">
              <LeadDNA lead={lead} />
            </div>
          </SheetContent>
        </Sheet>

        {/* Action Sheet */}
        <Sheet open={actionSheetOpen} onOpenChange={setActionSheetOpen}>
          <SheetContent side="bottom" className="h-[60vh] overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Quick Actions</SheetTitle>
            </SheetHeader>
            <div className="mt-4">
              <NextBestActionPanel leadId={leadId!} lead={lead} />
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* Desktop: 3-column layout */}
      <div className="hidden md:flex h-screen" data-testid="lead-detail">
        {/* Left: Conversation */}
        <div className="flex-1 flex flex-col min-w-0 border-r border-subtle">
          <div className="h-16 border-b border-subtle bg-app flex items-center justify-between px-4 shrink-0">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => router.push('/leads')}
                className="h-8 w-8"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div>
                <h1 className="text-h2 font-semibold text-slate-900 dark:text-slate-100">
                  {lead?.contact?.fullName || 'Lead'}
                </h1>
                <p className="text-meta muted-text">
                  {serviceName}
                </p>
              </div>
            </div>
            <Badge variant="outline" className="chip">
              {lead?.stage || 'NEW'}
            </Badge>
          </div>
          <div className="flex-1 min-h-0">
            <ConversationWorkspace
              leadId={leadId!}
              lead={lead}
              channel={channel}
              onSend={handleSendMessage}
              composerOpen={composerOpen}
              onComposerChange={setComposerOpen}
            />
          </div>
        </div>

        {/* Middle: Lead DNA */}
        <div className="w-80 border-r border-subtle overflow-y-auto">
          <div className="p-4 border-b border-subtle bg-app sticky top-0 z-10">
            <h2 className="text-h2 font-semibold text-slate-900 dark:text-slate-100">
              Lead Details
            </h2>
          </div>
          <div className="p-4">
            <LeadDNA lead={lead} />
          </div>
        </div>

        {/* Right: Actions */}
        <div className="w-80 overflow-y-auto">
          <div className="p-4 border-b border-subtle bg-app sticky top-0 z-10">
            <h2 className="text-h2 font-semibold text-slate-900 dark:text-slate-100">
              Next Actions
            </h2>
          </div>
          <div className="p-4">
            <NextBestActionPanel leadId={leadId!} lead={lead} />
          </div>
        </div>
      </div>
      
      {/* STEP 0: Build stamp for deployment verification */}
      {buildInfo && (
        <div className="fixed bottom-2 right-2 text-xs text-slate-400 dark:text-slate-600 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded z-50">
          Build: {buildInfo.buildId || 'unknown'}
        </div>
      )}
      </MainLayout>
    </LeadErrorBoundary>
  )
}
