'use client'

import { useState, useEffect } from 'react'
import { MainLayout } from '@/components/layout/MainLayout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { 
  MessageSquare, 
  Phone, 
  Mail, 
  Instagram, 
  Facebook,
  CheckCircle2,
  Clock,
  AlertCircle,
  FileText,
  Calendar,
  Sparkles,
  Send,
  Upload,
  Plus,
  Edit,
  Download,
  X,
  Check,
  MoreVertical,
  User,
  Building,
  MapPin,
  Globe,
  ExternalLink
} from 'lucide-react'
import { format, isToday, isYesterday, differenceInDays, parseISO } from 'date-fns'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import {
  getAiScoreCategory,
  PIPELINE_STAGES,
  PIPELINE_STAGE_LABELS,
  PIPELINE_STAGE_COLORS,
  normalizePipelineStage,
  type PipelineStage,
} from '@/lib/constants'
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogContent, DialogClose } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/select'
import { Label } from '@/components/ui/label'

const PIPELINE_STAGE_OPTIONS = PIPELINE_STAGES.map((stage) => ({
  value: stage,
  label: PIPELINE_STAGE_LABELS[stage],
  color: PIPELINE_STAGE_COLORS[stage],
}))

export default function LeadDetailPage({ leadId }: { leadId: number }) {
  const [lead, setLead] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('whatsapp')
  const [messageText, setMessageText] = useState('')
  const [sending, setSending] = useState(false)
  const [showAIDraft, setShowAIDraft] = useState(false)
  const [aiDraft, setAiDraft] = useState<any>(null)
  const [generatingDraft, setGeneratingDraft] = useState(false)
  
  // Modal states
  const [showTaskModal, setShowTaskModal] = useState(false)
  const [showDocumentModal, setShowDocumentModal] = useState(false)
  const [showExpiryModal, setShowExpiryModal] = useState(false)
  const [showNoteModal, setShowNoteModal] = useState(false)
  
  // Form states
  const [taskTitle, setTaskTitle] = useState('')
  const [taskType, setTaskType] = useState('OTHER')
  const [taskDueAt, setTaskDueAt] = useState('')
  const [noteText, setNoteText] = useState('')
  const [expiryType, setExpiryType] = useState('VISA_EXPIRY')
  const [expiryDate, setExpiryDate] = useState('')
  const [expiryNotes, setExpiryNotes] = useState('')
  const [uploadingDoc, setUploadingDoc] = useState(false)

  useEffect(() => {
    loadLead()
  }, [leadId])

  async function loadLead() {
    try {
      setLoading(true)
      const res = await fetch(`/api/leads/${leadId}`)
      if (res.ok) {
        const data = await res.json()
        setLead(data)
      }
    } catch (err) {
      console.error('Failed to load lead:', err)
    } finally {
      setLoading(false)
    }
  }

  async function handleSendMessage(channel: string) {
    if (!messageText.trim()) return

    try {
      setSending(true)
      const res = await fetch(`/api/leads/${leadId}/send-message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: channel.toUpperCase(),
          text: messageText.trim(),
        }),
      })

      if (!res.ok) {
        const error = await res.json()
        alert(error.error || 'Failed to send message')
        return
      }

      setMessageText('')
      await loadLead() // Reload to show new message
    } catch (err) {
      console.error('Failed to send message:', err)
      alert('Failed to send message')
    } finally {
      setSending(false)
    }
  }

  async function handleGenerateAIDraft(objective: string = 'followup') {
    try {
      setGeneratingDraft(true)
      const res = await fetch('/api/ai/draft-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId,
          objective,
        }),
      })

      if (res.ok) {
        const data = await res.json()
        setAiDraft(data)
        setMessageText(data.draftText || '')
        setShowAIDraft(true)
      }
    } catch (err) {
      console.error('Failed to generate draft:', err)
    } finally {
      setGeneratingDraft(false)
    }
  }

  async function handleAddNote() {
    if (!noteText.trim()) return

    try {
      const res = await fetch(`/api/leads/${leadId}/log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: 'internal',
          direction: 'outbound',
          messageSnippet: noteText.substring(0, 200),
          message: noteText,
        }),
      })

      if (!res.ok) {
        throw new Error('Failed to add note')
      }

      setNoteText('')
      await loadLead()
    } catch (err) {
      console.error('Failed to add note:', err)
      alert('Failed to add note')
    }
  }

  async function handleMarkTaskDone(taskId: number) {
    try {
      await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doneAt: new Date().toISOString() }),
      })
      await loadLead()
    } catch (err) {
      console.error('Failed to mark task done:', err)
      alert('Failed to mark task as done')
    }
  }

  async function handleCreateTask() {
    if (!taskTitle.trim()) return

    try {
      const res = await fetch(`/api/leads/${leadId}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: taskTitle,
          type: taskType,
          dueAt: taskDueAt ? new Date(taskDueAt).toISOString() : null,
        }),
      })

      if (!res.ok) {
        throw new Error('Failed to create task')
      }

      setTaskTitle('')
      setTaskType('OTHER')
      setTaskDueAt('')
      setShowTaskModal(false)
      await loadLead()
    } catch (err) {
      console.error('Failed to create task:', err)
      alert('Failed to create task')
    }
  }

  async function handleUploadDocument(file: File, category: string) {
    if (!file) return

    try {
      setUploadingDoc(true)
      const formData = new FormData()
      formData.append('file', file)
      formData.append('category', category)

      const res = await fetch(`/api/leads/${leadId}/documents/upload`, {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        throw new Error('Failed to upload document')
      }

      setShowDocumentModal(false)
      await loadLead()
    } catch (err) {
      console.error('Failed to upload document:', err)
      alert('Failed to upload document')
    } finally {
      setUploadingDoc(false)
    }
  }

  async function handleAddExpiry() {
    if (!expiryDate) return

    try {
      const res = await fetch(`/api/leads/${leadId}/expiry-items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: expiryType,
          expiryDate: new Date(expiryDate).toISOString(),
          notes: expiryNotes || null,
        }),
      })

      if (!res.ok) {
        throw new Error('Failed to add expiry item')
      }

      setExpiryType('VISA_EXPIRY')
      setExpiryDate('')
      setExpiryNotes('')
      setShowExpiryModal(false)
      await loadLead()
    } catch (err) {
      console.error('Failed to add expiry:', err)
      alert('Failed to add expiry item')
    }
  }

  async function handleCreateRenewalLead(expiryItemId: number) {
    if (!confirm('Create a new renewal lead for this expiry?')) return

    try {
      const expiryItem = lead.expiryItems?.find((e: any) => e.id === expiryItemId)
      if (!expiryItem) {
        alert('Expiry item not found')
        return
      }

      // Map expiry type to service type
      const serviceTypeMap: Record<string, string> = {
        VISA_EXPIRY: 'EMPLOYMENT_VISA',
        EMIRATES_ID_EXPIRY: 'EMIRATES_ID',
        TRADE_LICENSE_EXPIRY: 'MAINLAND_BUSINESS_SETUP',
        ESTABLISHMENT_CARD_EXPIRY: 'MAINLAND_BUSINESS_SETUP',
      }

      const serviceType = serviceTypeMap[expiryItem.type] || 'OTHER'

      // Create renewal lead
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactId: lead.contactId,
          serviceTypeEnum: serviceType,
          stage: 'NEW',
          isRenewal: true,
          originalExpiryItemId: expiryItemId,
          source: 'RENEWAL',
        }),
      })

      if (!res.ok) {
        throw new Error('Failed to create renewal lead')
      }

      const newLead = await res.json()

      // Update expiry item with renewal lead ID
      await fetch(`/api/expiry-items/${expiryItemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          renewalLeadId: newLead.id,
          renewalStatus: 'IN_PROGRESS',
        }),
      })

      alert(`Renewal lead created! Opening lead ${newLead.id}...`)
      window.location.href = `/leads/${newLead.id}`
    } catch (err) {
      console.error('Failed to create renewal lead:', err)
      alert('Failed to create renewal lead')
    }
  }

  if (loading) {
    return (
      <MainLayout>
        <div className="p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-gray-200 rounded w-1/4"></div>
            <div className="h-64 bg-gray-200 rounded"></div>
          </div>
        </div>
      </MainLayout>
    )
  }

  if (!lead) {
    return (
      <MainLayout>
        <div className="p-6">
          <p>Lead not found</p>
        </div>
      </MainLayout>
    )
  }

  const contact = lead.contact
  const normalizedStage = normalizePipelineStage(lead.stage, lead.pipelineStage) || 'new'
  const currentStage = PIPELINE_STAGE_OPTIONS.find(s => s.value === normalizedStage) || PIPELINE_STAGE_OPTIONS[0]
  const scoreCategory = getAiScoreCategory(lead.aiScore)
  const aiScoreColor = scoreCategory === 'hot' ? 'text-red-600' : scoreCategory === 'warm' ? 'text-orange-600' : 'text-blue-600'
  const aiScoreLabel = scoreCategory.toUpperCase()
  let metaLead: any = null
  let ingestion: any = null
  try {
    const dataJson = lead.dataJson ? JSON.parse(lead.dataJson) : {}
    metaLead = dataJson?.metaLead || null
    ingestion = dataJson?.ingestion || null
  } catch {
    metaLead = null
    ingestion = null
  }

  // Group tasks
  const tasksOpen = lead.tasksGrouped?.open || []
  const tasksDone = lead.tasksGrouped?.done || []
  const tasksSnoozed = lead.tasksGrouped?.snoozed || []

  // Get nearest expiry
  const nearestExpiry = lead.expiryItems?.[0]
  const daysUntilExpiry = nearestExpiry 
    ? differenceInDays(parseISO(nearestExpiry.expiryDate), new Date())
    : null

  return (
    <MainLayout>
      <div className="flex flex-col h-[calc(100vh-4rem)]">
        {/* Sticky Header */}
        <div className="sticky top-0 z-10 bg-white border-b shadow-sm p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <Link href="/leads" className="text-muted-foreground hover:text-foreground">
                ← Back
              </Link>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">{contact.fullName}</h1>
                <p className="text-sm text-muted-foreground">{contact.phone}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={aiScoreColor}>
                AI: {lead.aiScore}/100 ({aiScoreLabel})
              </Badge>
              <Badge className={currentStage.color}>
                {currentStage.label}
              </Badge>
              {(lead.source === 'META_LEAD_AD' || lead.source === 'meta_lead_ad' || metaLead) && (
                <Badge variant="secondary">Meta Lead Ad</Badge>
              )}
            </div>
          </div>
          {(lead.source === 'META_LEAD_AD' || lead.source === 'meta_lead_ad' || metaLead) && (
            <div className="mt-2 text-sm text-muted-foreground">
              <div className="flex flex-wrap gap-4">
                {metaLead?.campaignName && <span>Campaign: {metaLead.campaignName}</span>}
                {metaLead?.adName && <span>Ad: {metaLead.adName}</span>}
                {metaLead?.formName && <span>Form: {metaLead.formName}</span>}
                {ingestion?.slaDueAt && <span>SLA due: {new Date(ingestion.slaDueAt).toLocaleString()}</span>}
                {lead.assignedUser?.name && <span>Assignee: {lead.assignedUser.name}</span>}
              </div>
            </div>
          )}

          {/* Quick Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={() => handleSendMessage('whatsapp')}>
              <MessageSquare className="h-4 w-4 mr-2" />
              WhatsApp
            </Button>
            <Button size="sm" variant="outline" onClick={() => handleSendMessage('email')}>
              <Mail className="h-4 w-4 mr-2" />
              Email
            </Button>
            <Button size="sm" variant="outline" onClick={() => handleSendMessage('instagram')}>
              <Instagram className="h-4 w-4 mr-2" />
              Instagram
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowTaskModal(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Task
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowDocumentModal(true)}>
              <Upload className="h-4 w-4 mr-2" />
              Upload Docs
            </Button>
            <Button 
              size="sm" 
              variant={normalizedStage === 'won' ? 'default' : 'outline'}
              onClick={async () => {
                const newStage: PipelineStage = normalizedStage === 'won' ? 'completed' : 'won'
                await fetch(`/api/leads/${leadId}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ pipelineStage: newStage }),
                })
                await loadLead()
              }}
            >
              {normalizedStage === 'won' ? 'Mark Completed' : 'Mark Won'}
            </Button>
          </div>
        </div>

        {/* Main Content - 2 Column Layout */}
        <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-3 gap-4 p-4">
          {/* Left Column - Primary Content (2/3 width) */}
          <div className="lg:col-span-2 space-y-4 overflow-y-auto">
            {/* Pipeline Stage Bar */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Pipeline Stage</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 overflow-x-auto pb-2">
                  {PIPELINE_STAGE_OPTIONS.map((stage) => (
                    <button
                      key={stage.value}
                      onClick={async () => {
                        await fetch(`/api/leads/${leadId}`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ pipelineStage: stage.value }),
                        })
                        await loadLead()
                      }}
                      className={cn(
                        'px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors',
                        normalizedStage === stage.value
                          ? stage.color + ' ring-2 ring-offset-2 ring-current'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      )}
                    >
                      {stage.label}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Conversation / Inbox */}
            <Card className="flex-1 flex flex-col min-h-0">
              <CardHeader>
                <CardTitle className="text-sm font-medium">Conversation</CardTitle>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col min-h-0">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
                  <TabsList className="grid w-full grid-cols-5">
                    <TabsTrigger value="whatsapp">WhatsApp</TabsTrigger>
                    <TabsTrigger value="email">Email</TabsTrigger>
                    <TabsTrigger value="instagram">Instagram</TabsTrigger>
                    <TabsTrigger value="facebook">Facebook</TabsTrigger>
                    <TabsTrigger value="notes">Notes</TabsTrigger>
                  </TabsList>

                  {['whatsapp', 'email', 'instagram', 'facebook'].map((channel) => (
                    <TabsContent key={channel} value={channel} className="flex-1 flex flex-col mt-4 min-h-0">
                      <div className="flex-1 overflow-y-auto space-y-3 mb-4">
                        {lead.messages
                          ?.filter((m: any) => m.channel === channel)
                          .map((message: any) => (
                            <div
                              key={message.id}
                              className={cn(
                                'flex gap-3',
                                message.direction === 'outbound' ? 'justify-end' : 'justify-start'
                              )}
                            >
                              <div
                                className={cn(
                                  'max-w-[70%] rounded-lg p-3 text-sm',
                                  message.direction === 'outbound'
                                    ? 'bg-blue-500 text-white'
                                    : 'bg-gray-100 text-gray-900'
                                )}
                              >
                                <p>{message.body}</p>
                                <p className="text-xs mt-1 opacity-70">
                                  {format(parseISO(message.createdAt), 'MMM d, h:mm a')}
                                </p>
                              </div>
                            </div>
                          ))}
                        {(!lead.messages || lead.messages.filter((m: any) => m.channel === channel).length === 0) && (
                          <p className="text-sm text-muted-foreground text-center py-8">
                            No messages yet
                          </p>
                        )}
                      </div>

                      {/* Message Composer */}
                      <div className="border-t pt-4 space-y-2">
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleGenerateAIDraft('followup')}
                            disabled={generatingDraft}
                          >
                            <Sparkles className="h-4 w-4 mr-2" />
                            AI Draft
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleGenerateAIDraft('qualify')}
                            disabled={generatingDraft}
                          >
                            Qualify
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleGenerateAIDraft('renewal')}
                            disabled={generatingDraft}
                          >
                            Renewal
                          </Button>
                        </div>
                        <div className="flex gap-2">
                          <textarea
                            value={messageText}
                            onChange={(e) => setMessageText(e.target.value)}
                            placeholder="Type your message..."
                            className="flex-1 min-h-[80px] p-2 border rounded-md resize-none"
                          />
                          <Button
                            onClick={() => handleSendMessage(channel)}
                            disabled={!messageText.trim() || sending}
                          >
                            <Send className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </TabsContent>
                  ))}

                  <TabsContent value="notes" className="flex-1 flex flex-col mt-4">
                    <div className="flex-1 overflow-y-auto space-y-3 mb-4">
                      {lead.communicationLogs
                        ?.filter((log: any) => log.channel === 'internal')
                        .map((log: any) => (
                          <div key={log.id} className="border rounded-lg p-3">
                            <div className="flex justify-between items-start mb-2">
                              <span className="text-sm font-medium">Internal Note</span>
                              <span className="text-xs text-muted-foreground">
                                {format(parseISO(log.createdAt), 'MMM d, h:mm a')}
                              </span>
                            </div>
                            <p className="text-sm text-gray-700">{log.body || log.messageSnippet}</p>
                          </div>
                        ))}
                    </div>
                    <div className="border-t pt-4">
                      <textarea
                        value={noteText}
                        onChange={(e) => setNoteText(e.target.value)}
                        placeholder="Add internal note..."
                        className="w-full min-h-[80px] p-2 border rounded-md resize-none"
                      />
                      <Button 
                        className="mt-2" 
                        size="sm"
                        onClick={handleAddNote}
                        disabled={!noteText.trim()}
                      >
                        Add Note
                      </Button>
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>

            {/* Chatter / Activity Log */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Activity Timeline</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {[...(lead.communicationLogs || []), ...(lead.messages || [])]
                    .sort((a: any, b: any) => 
                      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                    )
                    .slice(0, 10)
                    .map((item: any, idx: number) => (
                      <div key={idx} className="flex gap-3 text-sm">
                        <div className="w-2 h-2 rounded-full bg-blue-500 mt-2"></div>
                        <div className="flex-1">
                          <p className="text-gray-900">
                            {item.direction === 'inbound' ? '📥' : '📤'} {item.channel} message
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {format(parseISO(item.createdAt), 'MMM d, h:mm a')}
                          </p>
                        </div>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Sidebar (1/3 width) */}
          <div className="space-y-4 overflow-y-auto">
            {/* Contact Card */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Contact</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{contact.fullName}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{contact.phone}</span>
                </div>
                {contact.email && (
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{contact.email}</span>
                  </div>
                )}
                {contact.nationality && (
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{contact.nationality}</span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <Input
                    value={contact.localSponsorName || ''}
                    onBlur={async (e) => {
                      const newValue = e.target.value.trim()
                      if (newValue !== (contact.localSponsorName || '')) {
                        await fetch(`/api/contacts/${contact.id}`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ localSponsorName: newValue || null }),
                        })
                        await loadLead()
                      }
                    }}
                    placeholder="Local Sponsor Name (editable)"
                    className="h-8 text-sm"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Building className="h-4 w-4 text-muted-foreground" />
                  <Input
                    value={contact.companyName || ''}
                    onBlur={async (e) => {
                      const newValue = e.target.value.trim()
                      if (newValue !== (contact.companyName || '')) {
                        await fetch(`/api/contacts/${contact.id}`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ companyName: newValue || null }),
                        })
                        await loadLead()
                      }
                    }}
                    placeholder="Company Name (editable)"
                    className="h-8 text-sm"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Expiry Tracker */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-medium">Expiry Tracker</CardTitle>
                <div className="flex items-center gap-2">
                  <Link href="/renewals">
                    <Button size="sm" variant="outline">
                      Renewals
                      <ExternalLink className="h-3 w-3 ml-1" />
                    </Button>
                  </Link>
                  <Button size="sm" variant="ghost" onClick={() => setShowExpiryModal(true)}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {lead.expiryItems?.map((expiry: any) => {
                  const days = differenceInDays(parseISO(expiry.expiryDate), new Date())
                  const isOverdue = days < 0
                  const renewalStatus = expiry.renewalStatus || 'PENDING'
                  return (
                    <div
                      key={expiry.id}
                      className={cn(
                        'p-3 rounded-lg border',
                        isOverdue ? 'border-red-200 bg-red-50' : days <= 30 ? 'border-orange-200 bg-orange-50' : 'border-gray-200'
                      )}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <p className="text-sm font-medium">{expiry.type.replace(/_/g, ' ')}</p>
                          <p className="text-xs text-muted-foreground">
                            {format(parseISO(expiry.expiryDate), 'MMM d, yyyy')}
                          </p>
                        </div>
                        <Badge variant={isOverdue ? 'destructive' : days <= 30 ? 'default' : 'secondary'}>
                          {isOverdue ? `${Math.abs(days)}d overdue` : `${days}d left`}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between pt-2 border-t">
                        <div className="flex items-center gap-2">
                          <Badge 
                            className={
                              renewalStatus === 'RENEWED' ? 'bg-green-100 text-green-800' :
                              renewalStatus === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-800' :
                              renewalStatus === 'NOT_RENEWING' ? 'bg-gray-100 text-gray-800' :
                              'bg-yellow-100 text-yellow-800'
                            }
                          >
                            {renewalStatus}
                          </Badge>
                          {expiry.lastReminderSentAt && (
                            <span className="text-xs text-muted-foreground">
                              Last: {format(parseISO(expiry.lastReminderSentAt), 'MMM d')}
                            </span>
                          )}
                        </div>
                        {expiry.renewalLeadId ? (
                          <Link href={`/leads/${expiry.renewalLeadId}`}>
                            <Button size="sm" variant="outline">
                              View Renewal
                              <ExternalLink className="h-3 w-3 ml-1" />
                            </Button>
                          </Link>
                        ) : (
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => handleCreateRenewalLead(expiry.id)}
                          >
                            Create Renewal Lead
                          </Button>
                        )}
                      </div>
                    </div>
                  )
                })}
                {(!lead.expiryItems || lead.expiryItems.length === 0) && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No expiry items
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Tasks */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-medium">Tasks</CardTitle>
                <Button size="sm" variant="ghost" onClick={() => setShowTaskModal(true)}>
                  <Plus className="h-4 w-4" />
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                {tasksOpen.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2">Today / Upcoming</p>
                    <div className="space-y-2">
                      {tasksOpen.map((task: any) => (
                        <div key={task.id} className="flex items-start gap-2 p-2 rounded border">
                          <input 
                            type="checkbox" 
                            className="mt-1" 
                            onChange={() => handleMarkTaskDone(task.id)}
                          />
                          <div className="flex-1">
                            <p className="text-sm">{task.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {task.dueAt ? format(parseISO(task.dueAt), 'MMM d') : 'No due date'}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {tasksDone.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2">Done</p>
                    <div className="space-y-2">
                      {tasksDone.slice(0, 3).map((task: any) => (
                        <div key={task.id} className="flex items-start gap-2 p-2 rounded border opacity-60">
                          <CheckCircle2 className="h-4 w-4 text-green-600 mt-1" />
                          <div className="flex-1">
                            <p className="text-sm line-through">{task.title}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {tasksOpen.length === 0 && tasksDone.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No tasks
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Documents */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-medium">Documents</CardTitle>
                <Button size="sm" variant="ghost" onClick={() => setShowDocumentModal(true)}>
                  <Upload className="h-4 w-4" />
                </Button>
              </CardHeader>
              <CardContent className="space-y-2">
                {lead.documents?.map((doc: any) => (
                  <div key={doc.id} className="flex items-center justify-between p-2 rounded border hover:bg-gray-50">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">{doc.fileName}</span>
                    </div>
                    <Button 
                      size="sm" 
                      variant="ghost"
                      onClick={() => window.open(`/api/documents/${doc.id}/download`, '_blank')}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                {(!lead.documents || lead.documents.length === 0) && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No documents
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Modals */}
      {/* Create Task Modal */}
      <Dialog open={showTaskModal} onOpenChange={setShowTaskModal}>
        <DialogHeader>
          <DialogTitle>Create Task</DialogTitle>
          <DialogDescription>Add a new task for this lead</DialogDescription>
          <DialogClose onClick={() => setShowTaskModal(false)} />
        </DialogHeader>
        <DialogContent>
          <div className="space-y-4">
            <div>
              <Label htmlFor="task-title">Title *</Label>
              <Input
                id="task-title"
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                placeholder="Task title"
              />
            </div>
            <div>
              <Label htmlFor="task-type">Type</Label>
              <Select
                id="task-type"
                value={taskType}
                onChange={(e) => setTaskType(e.target.value)}
              >
                <option value="CALL">Call</option>
                <option value="EMAIL">Email</option>
                <option value="WHATSAPP">WhatsApp</option>
                <option value="MEETING">Meeting</option>
                <option value="DOCUMENT_REQUEST">Document Request</option>
                <option value="OTHER">Other</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="task-due">Due Date</Label>
              <Input
                id="task-due"
                type="datetime-local"
                value={taskDueAt}
                onChange={(e) => setTaskDueAt(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowTaskModal(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateTask} disabled={!taskTitle.trim()}>
                Create Task
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Upload Document Modal */}
      <Dialog open={showDocumentModal} onOpenChange={setShowDocumentModal}>
        <DialogHeader>
          <DialogTitle>Upload Document</DialogTitle>
          <DialogDescription>Upload a document for this lead</DialogDescription>
          <DialogClose onClick={() => setShowDocumentModal(false)} />
        </DialogHeader>
        <DialogContent>
          <div className="space-y-4">
            <div>
              <Label htmlFor="doc-category">Category</Label>
              <Select
                id="doc-category"
                defaultValue="other"
                onChange={(e) => {
                  const fileInput = document.getElementById('doc-file') as HTMLInputElement
                  if (fileInput?.files?.[0]) {
                    handleUploadDocument(fileInput.files[0], e.target.value)
                  }
                }}
              >
                <option value="passport">Passport</option>
                <option value="eid">Emirates ID</option>
                <option value="visa">Visa</option>
                <option value="photo">Photo</option>
                <option value="trade_license">Trade License</option>
                <option value="other">Other</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="doc-file">File *</Label>
              <Input
                id="doc-file"
                type="file"
                accept="image/*,application/pdf,.doc,.docx"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  const category = (document.getElementById('doc-category') as HTMLSelectElement)?.value || 'other'
                  if (file) {
                    handleUploadDocument(file, category)
                  }
                }}
                disabled={uploadingDoc}
              />
            </div>
            {uploadingDoc && (
              <p className="text-sm text-muted-foreground">Uploading...</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Expiry Modal */}
      <Dialog open={showExpiryModal} onOpenChange={setShowExpiryModal}>
        <DialogHeader>
          <DialogTitle>Add Expiry Item</DialogTitle>
          <DialogDescription>Track an expiry date for this contact</DialogDescription>
          <DialogClose onClick={() => setShowExpiryModal(false)} />
        </DialogHeader>
        <DialogContent>
          <div className="space-y-4">
            <div>
              <Label htmlFor="expiry-type">Type *</Label>
              <Select
                id="expiry-type"
                value={expiryType}
                onChange={(e) => setExpiryType(e.target.value)}
              >
                <option value="VISA_EXPIRY">Visa Expiry</option>
                <option value="EMIRATES_ID_EXPIRY">Emirates ID Expiry</option>
                <option value="PASSPORT_EXPIRY">Passport Expiry</option>
                <option value="TRADE_LICENSE_EXPIRY">Trade License Expiry</option>
                <option value="ESTABLISHMENT_CARD_EXPIRY">Establishment Card Expiry</option>
                <option value="MEDICAL_FITNESS_EXPIRY">Medical Fitness Expiry</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="expiry-date">Expiry Date *</Label>
              <Input
                id="expiry-date"
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="expiry-notes">Notes</Label>
              <Textarea
                id="expiry-notes"
                value={expiryNotes}
                onChange={(e) => setExpiryNotes(e.target.value)}
                placeholder="Optional notes"
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowExpiryModal(false)}>
                Cancel
              </Button>
              <Button onClick={handleAddExpiry} disabled={!expiryDate}>
                Add Expiry
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </MainLayout>
  )
}
