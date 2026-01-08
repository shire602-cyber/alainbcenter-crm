'use client'

/**
 * REDESIGNED LEAD DETAIL PAGE
 * Clean, modern, editable layout with sticky header
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { MainLayout } from '@/components/layout/MainLayout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { InlineEditableField } from '@/components/leads/InlineEditableField'
import { ActivityTimeline } from '@/components/leads/ActivityTimeline'
import { AIRecommendationsCard } from '@/components/leads/AIRecommendationsCard'
import { DocumentsCardEnhanced } from '@/components/leads/DocumentsCardEnhanced'
import TasksSection from './TasksSection'
import ChecklistSection from './ChecklistSection'
import {
  ArrowLeft,
  Phone,
  MessageSquare,
  Mail,
  Calendar,
  User,
  FileText,
  Plus,
  Send,
  CheckCircle2,
  Circle,
  RefreshCw,
  ExternalLink,
  ChevronDown,
  Check,
  X,
} from 'lucide-react'
import { format, formatDistanceToNow, parseISO } from 'date-fns'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/ui/toast'
import {
  PIPELINE_STAGES,
  PIPELINE_STAGE_LABELS,
  LEAD_SOURCE_LABELS,
  getAiScoreCategory,
} from '@/lib/constants'

export default function LeadDetailPageNew({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const router = useRouter()
  const { showToast } = useToast()
  
  const [leadId, setLeadId] = useState<number | null>(null)
  const [lead, setLead] = useState<any>(null)
  const [messages, setMessages] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [messageText, setMessageText] = useState('')
  const [sending, setSending] = useState(false)
  const [users, setUsers] = useState<Array<{ id: number; name: string; email: string }>>([])
  const [serviceTypes, setServiceTypes] = useState<Array<{ id: number; name: string }>>([])
  
  // Conversation scroll container ref
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const conversationSectionRef = useRef<HTMLDivElement>(null)

  // Load users and service types
  useEffect(() => {
    Promise.all([
      fetch('/api/admin/users').then(res => res.json()).then(data => {
        if (Array.isArray(data)) setUsers(data)
      }).catch(() => {}),
      fetch('/api/service-types').then(res => res.json()).then(data => {
        if (Array.isArray(data)) setServiceTypes(data)
      }).catch(() => {}),
    ])
  }, [])

  // Resolve params
  useEffect(() => {
    async function init() {
      try {
        const resolved = await params
        const id = parseInt(resolved.id)
        if (isNaN(id)) {
          router.push('/leads')
          return
        }
        setLeadId(id)
        await Promise.all([loadLead(id), loadMessages(id)])
      } catch (error) {
        console.error('Failed to initialize:', error)
        setLoading(false)
      }
    }
    init()
  }, [params, router])

  // Load lead data
  const loadLead = async (id: number) => {
    try {
      setLoading(true)
      const res = await fetch(`/api/leads/${id}`)
      if (res.ok) {
        const data = await res.json()
        setLead(data.lead || data)
      }
    } catch (error) {
      console.error('Failed to load lead:', error)
      showToast('Failed to load lead', 'error')
    } finally {
      setLoading(false)
    }
  }

  // Load messages
  const loadMessages = async (id: number) => {
    try {
      const res = await fetch(`/api/leads/${id}/messages`)
      if (res.ok) {
        const data = await res.json()
        setMessages(data.messages || [])
        // Scroll to bottom after loading
        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
        }, 100)
      }
    } catch (error) {
      console.error('Failed to load messages:', error)
    }
  }

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (messages.length > 0 && messagesContainerRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages.length])

  // Update lead field
  const updateLeadField = useCallback(async (field: string, value: any) => {
    if (!leadId || !lead) return
    
    try {
      setSaving(true)
      
      // Handle contact fields - need to update contact separately
      if (['fullName', 'phone', 'email', 'nationality'].includes(field)) {
        const contactId = lead.contact?.id
        if (!contactId) {
          throw new Error('Contact not found')
        }
        
        const res = await fetch(`/api/contacts/${contactId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ [field]: value }),
        })
        
        if (res.ok) {
          await loadLead(leadId) // Reload to get updated data
          showToast('Saved', 'success')
        } else {
          throw new Error('Failed to update contact')
        }
      } else {
        // Update lead field directly
        const res = await fetch(`/api/leads/${leadId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ [field]: value }),
        })
        
        if (res.ok) {
          const updated = await res.json()
          setLead(updated.lead || updated)
          showToast('Saved', 'success')
        } else {
          throw new Error('Failed to update')
        }
      }
    } catch (error) {
      console.error('Failed to update:', error)
      showToast('Failed to save', 'error')
      throw error
    } finally {
      setSaving(false)
    }
  }, [leadId, lead, showToast])

  // Send message
  const handleSendMessage = async () => {
    if (!messageText.trim() || !leadId || sending) return

    try {
      setSending(true)
      const res = await fetch(`/api/leads/${leadId}/messages/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: messageText, channel: 'whatsapp' }),
      })

      if (res.ok) {
        setMessageText('')
        await loadMessages(leadId)
        await loadLead(leadId)
        showToast('Message sent', 'success')
      } else {
        throw new Error('Failed to send message')
      }
    } catch (error) {
      console.error('Failed to send message:', error)
      showToast('Failed to send message', 'error')
    } finally {
      setSending(false)
    }
  }

  // Build activity timeline
  const activities = useMemo(() => {
    if (!lead) return []
    
    const items: any[] = []
    
    // Messages
    if (messages && messages.length > 0) {
      messages.slice(-10).forEach((msg: any) => {
        items.push({
          id: `msg-${msg.id}`,
          type: 'message' as const,
          title: msg.direction === 'INBOUND' || msg.direction === 'IN' ? 'Received message' : 'Sent message',
          description: msg.body?.substring(0, 100) || 'Media message',
          timestamp: msg.createdAt,
          channel: msg.channel,
        })
      })
    }
    
    // Tasks
    if (lead.tasks) {
      lead.tasks.slice(0, 5).forEach((task: any) => {
        items.push({
          id: `task-${task.id}`,
          type: 'task' as const,
          title: task.status === 'DONE' ? 'Task completed' : 'Task created',
          description: task.title,
          timestamp: task.status === 'DONE' ? (task.doneAt || task.updatedAt) : task.createdAt,
          user: task.createdByUser,
        })
      })
    }
    
    // Sort by timestamp
    return items.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )
  }, [lead, messages])

  // Jump to conversation
  const scrollToConversation = () => {
    conversationSectionRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  // Loading state
  if (loading || !leadId) {
    return (
      <MainLayout>
        <div className="space-y-6 p-6">
          <Skeleton className="h-20 w-full" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Skeleton className="h-96 lg:col-span-2" />
            <Skeleton className="h-96" />
          </div>
          <Skeleton className="h-[45vh]" />
        </div>
      </MainLayout>
    )
  }

  // Not found
  if (!lead) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-screen">
          <EmptyState
            icon={User}
            title="Lead not found"
            description="The lead you're looking for doesn't exist"
            action={
              <Button onClick={() => router.push('/leads')}>
                Back to Leads
              </Button>
            }
          />
        </div>
      </MainLayout>
    )
  }

  const contact = lead.contact || {}
  const scoreCategory = getAiScoreCategory(lead.aiScore)

  // Get last inbound/outbound timestamps
  const lastInboundAt = lead.lastInboundAt ? formatDistanceToNow(new Date(lead.lastInboundAt), { addSuffix: true }) : 'Never'
  const lastOutboundAt = lead.lastOutboundAt ? formatDistanceToNow(new Date(lead.lastOutboundAt), { addSuffix: true }) : 'Never'

  return (
    <MainLayout>
      <div className="relative">
        {/* Sticky Top Header */}
        <div className="sticky top-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border/50 shadow-sm">
          <div className="p-4 lg:p-6">
            <div className="flex items-center justify-between gap-4">
              {/* Left: Back + Lead Info */}
              <div className="flex items-center gap-4 flex-1 min-w-0">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => router.push('/leads')}
                  className="shrink-0"
                >
                  <ArrowLeft className="h-5 w-5" />
                </Button>
                <div className="min-w-0 flex-1">
                  <h1 className="text-xl font-bold truncate">{contact.fullName || 'Unnamed Lead'}</h1>
                  <p className="text-sm text-muted-foreground truncate">{contact.phone || 'No phone'}</p>
                </div>
              </div>

              {/* Center: Stage + Owner Dropdowns */}
              <div className="flex items-center gap-3 shrink-0">
                <div className="flex items-center gap-2">
                  <label className="text-xs text-muted-foreground whitespace-nowrap">Stage:</label>
                  <Select
                    value={lead.pipelineStage || 'new'}
                    onChange={(e) => updateLeadField('pipelineStage', e.target.value)}
                    className="h-9 min-w-[140px]"
                  >
                    {PIPELINE_STAGES.map(stage => (
                      <option key={stage} value={stage}>
                        {PIPELINE_STAGE_LABELS[stage]}
                      </option>
                    ))}
                  </Select>
                </div>

                <div className="flex items-center gap-2">
                  <label className="text-xs text-muted-foreground whitespace-nowrap">Owner:</label>
                  <Select
                    value={lead.assignedUserId?.toString() || ''}
                    onChange={(e) => updateLeadField('assignedUserId', e.target.value ? parseInt(e.target.value) : null)}
                    className="h-9 min-w-[140px]"
                  >
                    <option value="">Unassigned</option>
                    {users.map(user => (
                      <option key={user.id} value={user.id.toString()}>
                        {user.name}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              {/* Right: Primary Actions */}
              <div className="flex items-center gap-2 shrink-0">
                {contact.phone && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open(`tel:${contact.phone}`)}
                      className="h-9"
                    >
                      <Phone className="h-4 w-4 mr-2" />
                      Call
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => router.push(`/inbox?phone=${encodeURIComponent(contact.phone)}`)}
                      className="h-9"
                    >
                      <MessageSquare className="h-4 w-4 mr-2" />
                      Inbox
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const whatsappUrl = `https://wa.me/${contact.phone.replace(/[^0-9]/g, '')}`
                        window.open(whatsappUrl, '_blank')
                      }}
                      className="h-9"
                    >
                      <MessageSquare className="h-4 w-4 mr-2" />
                      WhatsApp
                    </Button>
                  </>
                )}
                <Button
                  size="sm"
                  onClick={() => {
                    // Create task - you can implement this
                    showToast('Create task feature coming soon', 'info')
                  }}
                  className="h-9"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Task
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="p-4 lg:p-6 space-y-6">
          {/* General Info Section - 2 Column Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column: General Info */}
            <div className="lg:col-span-2 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>General Info</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Identity Section */}
                    <div className="space-y-4">
                      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Identity</h3>
                      <div className="space-y-4">
                        <div>
                          <label className="text-xs text-muted-foreground mb-1.5 block">Full Name</label>
                          <InlineEditableField
                            value={contact.fullName || ''}
                            onSave={(v) => updateLeadField('fullName', v)}
                            placeholder="Click to edit"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground mb-1.5 block">Phone</label>
                          <InlineEditableField
                            value={contact.phone || ''}
                            onSave={(v) => updateLeadField('phone', v)}
                            placeholder="Click to edit"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground mb-1.5 block">Email</label>
                          <Input
                            value={contact.email || ''}
                            onChange={(e) => {
                              setLead({ ...lead, contact: { ...contact, email: e.target.value } })
                            }}
                            onBlur={(e) => updateLeadField('email', e.target.value)}
                            placeholder="Enter email"
                            type="email"
                            className="w-full"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground mb-1.5 block">Nationality</label>
                          <InlineEditableField
                            value={contact.nationality || ''}
                            onSave={(v) => updateLeadField('nationality', v)}
                            placeholder="Click to edit"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Lead Metadata Section */}
                    <div className="space-y-4">
                      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Lead Metadata</h3>
                      <div className="space-y-4">
                        <div>
                          <label className="text-xs text-muted-foreground mb-1.5 block">Source / Channel</label>
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary">
                              {LEAD_SOURCE_LABELS[contact.source as keyof typeof LEAD_SOURCE_LABELS] || contact.source || 'Manual'}
                            </Badge>
                            {lead.lastContactChannel && (
                              <Badge variant="outline">{lead.lastContactChannel}</Badge>
                            )}
                          </div>
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground mb-1.5 block">Created</label>
                          <span className="text-sm text-foreground">
                            {format(new Date(lead.createdAt), 'MMM dd, yyyy')}
                          </span>
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground mb-1.5 block">Last Inbound</label>
                          <span className="text-sm text-foreground">{lastInboundAt}</span>
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground mb-1.5 block">Last Outbound</label>
                          <span className="text-sm text-foreground">{lastOutboundAt}</span>
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground mb-1.5 block">Service</label>
                          <Select
                            value={lead.serviceTypeId?.toString() || ''}
                            onChange={(e) => updateLeadField('serviceTypeId', e.target.value ? parseInt(e.target.value) : null)}
                            className="w-full"
                          >
                            <option value="">Not specified</option>
                            {serviceTypes.map(st => (
                              <option key={st.id} value={st.id.toString()}>{st.name}</option>
                            ))}
                          </Select>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Notes Section - Full Width */}
                  <div className="mt-6 pt-6 border-t">
                    <label className="text-xs text-muted-foreground mb-1.5 block">Notes</label>
                    <Textarea
                      value={lead.notes || ''}
                      onChange={(e) => {
                        setLead({ ...lead, notes: e.target.value })
                      }}
                      onBlur={(e) => updateLeadField('notes', e.target.value)}
                      placeholder="Add notes about this lead..."
                      className="min-h-[120px] resize-none"
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Qualification Checklist */}
              {leadId && (
                <Card>
                  <CardHeader>
                    <CardTitle>Qualification Checklist</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ChecklistSection leadId={leadId} />
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Right Column: Cards */}
            <div className="space-y-6">
              {/* AI Recommendations */}
              {lead && leadId && (
                <AIRecommendationsCard
                  leadId={leadId}
                  lead={{
                    aiScore: lead.aiScore,
                    aiNotes: lead.aiNotes,
                    stage: lead.stage,
                  }}
                  onRescore={async () => loadLead(leadId!)}
                />
              )}

              {/* Activity Timeline */}
              <Card>
                <CardHeader>
                  <CardTitle>Activity Timeline</CardTitle>
                </CardHeader>
                <CardContent>
                  <ActivityTimeline activities={activities} />
                </CardContent>
              </Card>

              {/* Tasks */}
              {leadId && (
                <Card>
                  <CardHeader>
                    <CardTitle>Tasks</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <TasksSection leadId={leadId} />
                  </CardContent>
                </Card>
              )}

              {/* Documents */}
              {leadId && (
                <Card>
                  <CardHeader>
                    <CardTitle>Documents</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <DocumentsCardEnhanced
                      leadId={leadId}
                      serviceType={lead.serviceTypeEnum || undefined}
                    />
                  </CardContent>
                </Card>
              )}
            </div>
          </div>

          {/* Conversation Section - Fixed Height Panel */}
          <div ref={conversationSectionRef} className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Conversation</h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={scrollToConversation}
                className="text-xs"
              >
                <ChevronDown className="h-3 w-3 mr-1" />
                Jump to conversation
              </Button>
            </div>
            
            <Card>
              <CardContent className="p-0">
                {/* Messages Thread - Fixed Height with Scroll */}
                <div
                  ref={messagesContainerRef}
                  className="h-[45vh] overflow-y-auto p-4 space-y-4 bg-muted/20"
                >
                  {messages.length === 0 ? (
                    <div className="flex items-center justify-center h-full">
                      <EmptyState
                        icon={MessageSquare}
                        title="No messages yet"
                        description="Start the conversation by sending a message"
                      />
                    </div>
                  ) : (
                    <>
                      {messages.map((msg: any) => {
                        const isOutbound = msg.direction === 'OUTBOUND' || msg.direction === 'OUT'
                        const hasMedia = msg.mediaProxyUrl || msg.attachments?.length > 0
                        
                        return (
                          <div
                            key={msg.id}
                            className={cn(
                              'flex',
                              isOutbound ? 'justify-end' : 'justify-start'
                            )}
                          >
                            <div
                              className={cn(
                                'max-w-[75%] rounded-lg p-3 shadow-sm',
                                isOutbound
                                  ? 'bg-primary text-primary-foreground'
                                  : 'bg-background border border-border'
                              )}
                            >
                              {hasMedia && (
                                <div className="mb-2">
                                  {msg.type === 'image' && msg.mediaProxyUrl && (
                                    <img
                                      src={msg.mediaProxyUrl}
                                      alt="Attachment"
                                      className="max-w-full rounded-lg cursor-pointer"
                                      onClick={() => window.open(msg.mediaProxyUrl, '_blank')}
                                      style={{ maxHeight: '200px' }}
                                    />
                                  )}
                                  {msg.type === 'document' && (
                                    <a
                                      href={msg.mediaProxyUrl || '#'}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="flex items-center gap-2 p-2 bg-background/50 rounded"
                                    >
                                      <FileText className="h-4 w-4" />
                                      <span className="text-xs">{msg.mediaFilename || 'Document'}</span>
                                    </a>
                                  )}
                                  {msg.type === 'audio' && msg.mediaProxyUrl && (
                                    <audio controls className="w-full">
                                      <source src={msg.mediaProxyUrl} />
                                    </audio>
                                  )}
                                  {msg.type === 'video' && msg.mediaProxyUrl && (
                                    <video controls className="max-w-full rounded-lg" style={{ maxHeight: '200px' }}>
                                      <source src={msg.mediaProxyUrl} />
                                    </video>
                                  )}
                                </div>
                              )}
                              {msg.body && (
                                <p className="text-sm whitespace-pre-wrap break-words">{msg.body}</p>
                              )}
                              <p className={cn(
                                'text-xs mt-1.5',
                                isOutbound
                                  ? 'text-primary-foreground/70'
                                  : 'text-muted-foreground'
                              )}>
                                {format(parseISO(msg.createdAt), 'HH:mm')}
                              </p>
                            </div>
                          </div>
                        )
                      })}
                      <div ref={messagesEndRef} />
                    </>
                  )}
                </div>

                {/* Composer - Sticky at bottom of panel */}
                <div className="p-4 border-t bg-background">
                  <div className="flex gap-2">
                    <Textarea
                      value={messageText}
                      onChange={(e) => setMessageText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          handleSendMessage()
                        }
                      }}
                      placeholder="Type a message..."
                      className="min-h-[80px] resize-none"
                    />
                    <Button
                      onClick={handleSendMessage}
                      disabled={!messageText.trim() || sending}
                      size="lg"
                      className="self-end"
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </MainLayout>
  )
}
