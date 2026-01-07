'use client'

/**
 * REDESIGNED LEAD DETAIL PAGE
 * Clean, modern, task-oriented layout like respond.io
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { MainLayout } from '@/components/layout/MainLayout'
import { Card } from '@/components/ui/card'
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
  
  // Conversation scroll container ref
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)

  // Load users for owner dropdown
  useEffect(() => {
    fetch('/api/admin/users')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setUsers(data)
        }
      })
      .catch(() => {})
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
    if (messages.length > 0) {
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

  // Loading state
  if (loading || !leadId) {
    return (
      <MainLayout>
        <div className="space-y-6 p-6">
          <Skeleton className="h-16 w-full" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Skeleton className="h-96" />
            <Skeleton className="h-96" />
          </div>
          <Skeleton className="h-[520px]" />
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

  return (
    <MainLayout>
      <div className="space-y-6 p-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 pb-6 border-b">
          <div className="flex-1">
            <div className="flex items-center gap-4 mb-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => router.push('/leads')}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div>
                <h1 className="text-2xl font-bold">{contact.fullName || 'Unnamed Lead'}</h1>
                <p className="text-muted-foreground">{contact.phone || 'No phone'}</p>
              </div>
            </div>
            
            <div className="flex items-center gap-4 flex-wrap">
              {/* Stage */}
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium">Stage:</label>
                <Select
                  value={lead.pipelineStage || 'new'}
                  onChange={(e) => updateLeadField('pipelineStage', e.target.value)}
                  className="w-[150px]"
                >
                  {PIPELINE_STAGES.map(stage => (
                    <option key={stage} value={stage}>
                      {PIPELINE_STAGE_LABELS[stage]}
                    </option>
                  ))}
                </Select>
              </div>

              {/* Owner */}
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium">Owner:</label>
                <Select
                  value={lead.assignedUserId?.toString() || ''}
                  onChange={(e) => updateLeadField('assignedUserId', e.target.value ? parseInt(e.target.value) : null)}
                  className="w-[150px]"
                >
                  <option value="">Unassigned</option>
                  {users.map(user => (
                    <option key={user.id} value={user.id}>
                      {user.name}
                    </option>
                  ))}
                </Select>
              </div>

              {/* AI Score Badge */}
              {lead.aiScore !== null && (
                <Badge className={cn(
                  scoreCategory === 'hot' && 'bg-red-500',
                  scoreCategory === 'warm' && 'bg-orange-500',
                  scoreCategory === 'cold' && 'bg-blue-500',
                )}>
                  AI Score: {lead.aiScore}
                </Badge>
              )}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-2">
            {contact.phone && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(`tel:${contact.phone}`)}
                >
                  <Phone className="h-4 w-4 mr-2" />
                  Call
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => router.push(`/inbox?phone=${encodeURIComponent(contact.phone)}`)}
                >
                  <MessageSquare className="h-4 w-4 mr-2" />
                  Open in Inbox
                </Button>
              </>
            )}
            {contact.email && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(`mailto:${contact.email}`)}
              >
                <Mail className="h-4 w-4 mr-2" />
                Email
              </Button>
            )}
          </div>
        </div>

        {/* Main Content: 2-Column Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* LEFT COLUMN */}
          <div className="lg:col-span-2 space-y-6">
            {/* Overview Card */}
            <Card>
              <div className="p-6">
                <h2 className="text-lg font-semibold mb-4">Overview</h2>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Full Name</label>
                    <InlineEditableField
                      value={contact.fullName || ''}
                      onSave={(v) => updateLeadField('fullName', v)}
                      placeholder="Click to edit"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Phone</label>
                    <InlineEditableField
                      value={contact.phone || ''}
                      onSave={(v) => updateLeadField('phone', v)}
                      placeholder="Click to edit"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Email</label>
                    <InlineEditableField
                      value={contact.email || ''}
                      onSave={(v) => updateLeadField('email', v)}
                      placeholder="Click to edit"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Nationality</label>
                    <InlineEditableField
                      value={contact.nationality || ''}
                      onSave={(v) => updateLeadField('nationality', v)}
                      placeholder="Click to edit"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Source</label>
                    <span className="text-sm">
                      {LEAD_SOURCE_LABELS[contact.source as keyof typeof LEAD_SOURCE_LABELS] || contact.source || 'Manual'}
                    </span>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Service</label>
                    <span className="text-sm">
                      {lead.serviceType?.name || lead.serviceTypeEnum || 'Not specified'}
                    </span>
                  </div>
                </div>
                
                {/* Notes */}
                <div className="mt-4">
                  <label className="text-xs text-muted-foreground mb-1 block">Notes</label>
                  <Textarea
                    value={lead.notes || ''}
                    onChange={(e) => setLead({ ...lead, notes: e.target.value })}
                    onBlur={(e) => updateLeadField('notes', e.target.value)}
                    placeholder="Add notes..."
                    className="min-h-[100px]"
                  />
                </div>
              </div>
            </Card>

            {/* Qualification Card */}
            <Card>
              <div className="p-6">
                <h2 className="text-lg font-semibold mb-4">Qualification</h2>
                <div className="space-y-2">
                  {['Passport', 'Photo', 'Emirates ID', 'Visa Copy', 'Sponsor Letter'].map((item) => (
                    <div key={item} className="flex items-center gap-2">
                      <Circle className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>

            {/* Renewals/Expiry Card */}
            <Card>
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold">Renewals & Expiry</h2>
                  <Button size="sm" variant="outline">
                    <Plus className="h-4 w-4 mr-2" />
                    Create Renewal
                  </Button>
                </div>
                {lead.expiryItems && lead.expiryItems.length > 0 ? (
                  <div className="space-y-2">
                    {lead.expiryItems.slice(0, 5).map((expiry: any) => (
                      <div key={expiry.id} className="flex items-center justify-between p-3 border rounded-lg">
                        <div>
                          <p className="text-sm font-medium">{expiry.type}</p>
                          <p className="text-xs text-muted-foreground">
                            {format(parseISO(expiry.expiryDate), 'MMM dd, yyyy')}
                          </p>
                        </div>
                        <Badge variant="outline">{expiry.renewalStatus || 'Active'}</Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No renewals or expiry items</p>
                )}
              </div>
            </Card>
          </div>

          {/* RIGHT COLUMN */}
          <div className="space-y-6">
            {/* AI Recommendations */}
            {lead && (
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
              <div className="p-6">
                <h2 className="text-lg font-semibold mb-4">Activity Timeline</h2>
                <ActivityTimeline activities={activities} />
              </div>
            </Card>

            {/* Documents */}
            <Card>
              <div className="p-6">
                <h2 className="text-lg font-semibold mb-4">Documents</h2>
                {leadId && (
                  <DocumentsCardEnhanced
                    leadId={leadId}
                    serviceType={lead.serviceTypeEnum || undefined}
                  />
                )}
              </div>
            </Card>
          </div>
        </div>

        {/* Conversation Section - FULL WIDTH BELOW */}
        <Card>
          <div className="p-6">
            <h2 className="text-lg font-semibold mb-4">Conversation</h2>
            
            {/* Messages Thread */}
            <div
              ref={messagesContainerRef}
              className="h-[520px] overflow-y-auto border rounded-lg p-4 mb-4 bg-muted/30"
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
                <div className="space-y-4">
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
                            'max-w-[70%] rounded-lg p-3',
                            isOutbound
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-background border'
                          )}
                        >
                          {hasMedia && (
                            <div className="mb-2">
                              {msg.type === 'image' && msg.mediaProxyUrl && (
                                <img
                                  src={msg.mediaProxyUrl}
                                  alt="Attachment"
                                  className="max-w-full rounded"
                                  onClick={() => window.open(msg.mediaProxyUrl, '_blank')}
                                  style={{ cursor: 'pointer', maxHeight: '200px' }}
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
                                <video controls className="max-w-full rounded" style={{ maxHeight: '200px' }}>
                                  <source src={msg.mediaProxyUrl} />
                                </video>
                              )}
                            </div>
                          )}
                          {msg.body && (
                            <p className="text-sm whitespace-pre-wrap">{msg.body}</p>
                          )}
                          <p className={cn(
                            'text-xs mt-1',
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
                </div>
              )}
            </div>

            {/* Sticky Composer */}
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
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </MainLayout>
  )
}

