'use client'

/**
 * PREMIUM LEAD DETAIL PAGE
 * Modern 3-pane cockpit layout for managing leads
 * Features:
 * - Sticky header bar with actions
 * - Left: Lead Snapshot (Contact, Pipeline, AI)
 * - Middle: Conversation + Activity Timeline
 * - Right: Expiry, Tasks, Documents, AI Panel
 */

import { useState, useEffect, useRef, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { MainLayout } from '@/components/layout/MainLayout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/components/ui/toast'
import { PipelineProgress } from '@/components/leads/PipelineProgress'
import { ActivityTimeline } from '@/components/leads/ActivityTimeline'
import { AIScoreBadgePremium } from '@/components/leads/AIScoreBadgePremium'
import { AIScoreCircleAnimated } from '@/components/leads/AIScoreCircleAnimated'
import { QuickActionsMenu } from '@/components/leads/QuickActionsMenu'
import { MessageComposerEnhanced } from '@/components/leads/MessageComposerEnhanced'
import { AutomationInspector } from '@/components/leads/AutomationInspector'
import { RevenueWidget } from '@/components/leads/RevenueWidget'
import { RenewalRevenueWidget } from '@/components/leads/RenewalRevenueWidget'
import { RenewalRevenueCard } from '@/components/leads/RenewalRevenueCard'
import { DocumentsCardEnhanced } from '@/components/leads/DocumentsCardEnhanced'
import { InlineEditableField } from '@/components/leads/InlineEditableField'
import { ExpiryCountdown } from '@/components/leads/ExpiryCountdown'
import { AutopilotCard } from '@/components/leads/AutopilotCard'
import { RemindersCard } from '@/components/leads/RemindersCard'
import { DarkModeToggle } from '@/components/layout/DarkModeToggle'
import { ExtractedDataPanel } from '@/components/leads/ExtractedDataPanel'
import { NextBestAction } from '@/components/leads/NextBestAction'
import { LeadSummary } from '@/components/leads/LeadSummary'
import { ForecastCard } from '@/components/leads/ForecastCard'
import {
  ArrowLeft,
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
  Globe,
  Copy,
  Loader2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Trash2,
  RefreshCw,
  Target,
  FileCheck,
  Zap,
  CheckCheck,
  XCircle,
} from 'lucide-react'
import { format, differenceInDays, parseISO, isToday, isYesterday } from 'date-fns'
import { cn } from '@/lib/utils'
// Token interpolation is handled by the AI draft endpoint
import Link from 'next/link'
import { getAiScoreCategory } from '@/lib/constants'

const PIPELINE_STAGES = [
  'NEW',
  'CONTACTED',
  'ENGAGED',
  'QUALIFIED',
  'PROPOSAL_SENT',
  'IN_PROGRESS',
  'COMPLETED_WON',
  'LOST',
]

const DOCUMENT_CATEGORIES = [
  { value: 'PASSPORT', label: 'Passport' },
  { value: 'EID', label: 'Emirates ID' },
  { value: 'VISA', label: 'Visa' },
  { value: 'TRADE_LICENSE', label: 'Trade License' },
  { value: 'PHOTO', label: 'Photo' },
  { value: 'CONTRACT', label: 'Contract' },
  { value: 'OTHER', label: 'Other' },
]

const EXPIRY_TYPES = [
  { value: 'VISA_EXPIRY', label: 'Visa Expiry' },
  { value: 'EMIRATES_ID_EXPIRY', label: 'Emirates ID Expiry' },
  { value: 'PASSPORT_EXPIRY', label: 'Passport Expiry' },
  { value: 'TRADE_LICENSE_EXPIRY', label: 'Trade License Expiry' },
  { value: 'ESTABLISHMENT_CARD_EXPIRY', label: 'Establishment Card Expiry' },
  { value: 'MEDICAL_FITNESS_EXPIRY', label: 'Medical Fitness Expiry' },
]

const TASK_TYPES = [
  { value: 'FOLLOW_UP', label: 'Follow-up' },
  { value: 'DOC_COLLECTION', label: 'Document Collection' },
  { value: 'RENEWAL', label: 'Renewal' },
  { value: 'CALL', label: 'Call' },
  { value: 'EMAIL', label: 'Email' },
  { value: 'WHATSAPP', label: 'WhatsApp' },
  { value: 'MEETING', label: 'Meeting' },
  { value: 'CUSTOM', label: 'Custom' },
]

export default function LeadDetailPagePremium({ leadId }: { leadId: number }) {
  const { showToast } = useToast()
  const [lead, setLead] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [activeChannel, setActiveChannel] = useState('whatsapp')
  const [messageText, setMessageText] = useState('')
  const [sending, setSending] = useState(false)
  const [messages, setMessages] = useState<any[]>([])
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [conversationId, setConversationId] = useState<number | null>(null)
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [deletingChat, setDeletingChat] = useState(false)
  
  // Modal states
  const [showTaskModal, setShowTaskModal] = useState(false)
  const [showDocumentModal, setShowDocumentModal] = useState(false)
  const [showExpiryModal, setShowExpiryModal] = useState(false)
  const [showWonLostModal, setShowWonLostModal] = useState(false)
  const [pendingStage, setPendingStage] = useState<string | null>(null)
  
  // Form states
  const [taskTitle, setTaskTitle] = useState('')
  const [taskType, setTaskType] = useState('FOLLOW_UP')
  const [taskDueAt, setTaskDueAt] = useState('')
  const [taskAssignedUserId, setTaskAssignedUserId] = useState<number | null>(null)
  const [expiryType, setExpiryType] = useState('VISA_EXPIRY')
  const [expiryDate, setExpiryDate] = useState('')
  const [expiryNotes, setExpiryNotes] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [selectedDocCategory, setSelectedDocCategory] = useState('OTHER')
  const [uploadingDoc, setUploadingDoc] = useState(false)
  const [users, setUsers] = useState<any[]>([])
  const [serviceTypes, setServiceTypes] = useState<any[]>([])
  
  // AI states
  const [generatingAI, setGeneratingAI] = useState<string | null>(null)
  const [aiOutput, setAiOutput] = useState<{ type: string; content: string } | null>(null)
  
  // Compliance state
  const [compliance, setCompliance] = useState<any>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadLead()
    loadUsers()
    loadServiceTypes()
    loadCompliance()
    // Load current user for admin check
    fetch('/api/auth/me')
      .then(res => res.json())
      .then(data => setCurrentUser(data.user))
      .catch(() => {})
  }, [leadId])

  useEffect(() => {
    if (lead) {
      loadMessages()
      // Reload conversation ID when channel changes
      loadConversationId()
    }
  }, [lead, activeChannel])

  async function loadConversationId() {
    if (!lead?.contactId) return
    try {
      const channelMap: Record<string, string> = {
        whatsapp: 'whatsapp',
        email: 'email',
        instagram: 'instagram',
        facebook: 'facebook',
      }
      const dbChannel = channelMap[activeChannel] || 'whatsapp'
      const convRes = await fetch(`/api/inbox/conversations?channel=${dbChannel}`)
      if (convRes.ok) {
        const convData = await convRes.json()
        const conversation = convData.conversations?.find((c: any) => c.contact.id === lead.contactId)
        if (conversation) {
          setConversationId(conversation.id)
        } else {
          setConversationId(null)
        }
      }
    } catch (err) {
      console.error('Failed to load conversation ID:', err)
      setConversationId(null)
    }
  }

  async function loadCompliance() {
    try {
      const res = await fetch(`/api/leads/${leadId}/compliance`)
      if (res.ok) {
        const data = await res.json()
        setCompliance(data.compliance)
      }
    } catch (err) {
      console.error('Failed to load compliance:', err)
    }
  }

  async function loadLead() {
    try {
      setLoading(true)
      const res = await fetch(`/api/leads/${leadId}`)
      if (res.ok) {
        const data = await res.json()
        setLead(data)
      } else {
        const errorData = await res.json().catch(() => ({ error: 'Unknown error' }))
        console.error(`Failed to load lead ${leadId}:`, errorData)
        showToast(`Lead ${leadId} not found: ${errorData.error || 'Unknown error'}`, 'error')
      }
    } catch (err: any) {
      console.error('Failed to load lead:', err)
      showToast(`Failed to load lead: ${err.message || 'Network error'}`, 'error')
    } finally {
      setLoading(false)
    }
  }

  async function loadUsers() {
    try {
      const res = await fetch('/api/admin/users')
      if (res.ok) {
        const users = await res.json()
        setUsers(users || [])
      }
    } catch (err) {
      console.error('Failed to load users:', err)
    }
  }

  async function loadServiceTypes() {
    try {
      const res = await fetch('/api/service-types')
      if (res.ok) {
        const services = await res.json()
        setServiceTypes(services || [])
      }
    } catch (err) {
      console.error('Failed to load service types:', err)
    }
  }

  async function handleStageChange(newStage: string) {
    if (newStage === 'COMPLETED_WON' || newStage === 'LOST') {
      setPendingStage(newStage)
      setShowWonLostModal(true)
      return
    }

    try {
      // Optimistic update
      const oldLead = { ...lead }
      setLead({ ...lead, stage: newStage, pipelineStage: newStage.toLowerCase() })

      const res = await fetch(`/api/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: newStage, pipelineStage: newStage.toLowerCase() }),
      })

      if (!res.ok) {
        setLead(oldLead)
        showToast('Failed to update stage', 'error')
      } else {
        showToast('Stage updated successfully', 'success')
        await loadLead()
      }
    } catch (err) {
      showToast('Failed to update stage', 'error')
      await loadLead()
    }
  }

  async function handleSaveField(field: string, value: any) {
    try {
      const res = await fetch(`/api/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      })

      if (!res.ok) {
        showToast(`Failed to update ${field}`, 'error')
        await loadLead()
      } else {
        showToast(`${field} updated successfully`, 'success')
        await loadLead()
      }
    } catch (err) {
      showToast(`Failed to update ${field}`, 'error')
      await loadLead()
    }
  }

  async function loadMessages() {
    if (!lead) return
    
    try {
      setLoadingMessages(true)
      const channelMap: Record<string, string> = {
        whatsapp: 'WHATSAPP',
        email: 'EMAIL',
        instagram: 'INSTAGRAM',
        facebook: 'FACEBOOK',
      }
      const channel = channelMap[activeChannel] || 'WHATSAPP'
      
      const res = await fetch(`/api/leads/${leadId}/messages?channel=${channel}`)
      if (res.ok) {
        const data = await res.json()
        setMessages(data.messages || [])
      }
    } catch (err) {
      console.error('Failed to load messages:', err)
    } finally {
      setLoadingMessages(false)
    }
  }

  async function handleSendMessage() {
    if (!messageText.trim()) return

    // Optimistic update - add message to UI immediately
    const optimisticMessage = {
      id: `temp-${Date.now()}`,
      direction: 'OUTBOUND',
      channel: activeChannel,
      body: messageText.trim(),
      status: 'PENDING',
      createdAt: new Date().toISOString(),
    }
    setMessages([...messages, optimisticMessage])
    const previousMessages = [...messages]
    const previousText = messageText
    
    setMessageText('')
    setSending(true)

    try {
      const channelMap: Record<string, string> = {
        whatsapp: 'WHATSAPP',
        email: 'EMAIL',
        instagram: 'INSTAGRAM',
        facebook: 'FACEBOOK',
      }
      const channel = channelMap[activeChannel] || 'WHATSAPP'
      
      const res = await fetch(`/api/leads/${leadId}/messages/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel,
          body: previousText.trim(),
        }),
      })

      if (!res.ok) {
        // Revert optimistic update
        setMessages(previousMessages)
        setMessageText(previousText)
        const error = await res.json()
        showToast(error.error || 'Failed to send message', 'error')
        return
      }

      const data = await res.json()
      
      // Replace optimistic message with real one
      setMessages((prev) => 
        prev.map((m) => 
          m.id === optimisticMessage.id 
            ? { ...optimisticMessage, ...data.message, id: data.message.id }
            : m
        )
      )

      showToast('Message sent successfully', 'success')
      
      // Reload messages to get full details
      await loadMessages()
      await loadLead()
    } catch (err: any) {
      // Revert optimistic update
      setMessages(previousMessages)
      setMessageText(previousText)
      showToast('Failed to send message', 'error')
    } finally {
      setSending(false)
    }
  }

  async function handleGenerateAIDraft(mode: string) {
    try {
      setGeneratingAI(mode)
      
      const channelMap: Record<string, string> = {
        whatsapp: 'WHATSAPP',
        email: 'EMAIL',
        instagram: 'INSTAGRAM',
        facebook: 'FACEBOOK',
      }
      const channel = channelMap[activeChannel] || 'WHATSAPP'
      
      const res = await fetch(`/api/leads/${leadId}/messages/ai-draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: mode.toUpperCase(),
          channel,
        }),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to generate draft')
      }

      const data = await res.json()
      const draftText = data.draft || ''
      
      if (draftText) {
        setMessageText(draftText)
        showToast('AI draft generated', 'success')
      } else {
        showToast('No draft generated', 'info')
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to generate AI draft', 'error')
    } finally {
      setGeneratingAI(null)
    }
  }

  async function handleCreateTask() {
    if (!taskTitle.trim()) {
      showToast('Task title is required', 'error')
      return
    }

    try {
      const res = await fetch(`/api/leads/${leadId}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: taskTitle,
          type: taskType,
          dueAt: taskDueAt ? new Date(taskDueAt).toISOString() : null,
          assignedUserId: taskAssignedUserId,
        }),
      })

      if (!res.ok) {
        throw new Error('Failed to create task')
      }

      setTaskTitle('')
      setTaskType('FOLLOW_UP')
      setTaskDueAt('')
      setTaskAssignedUserId(null)
      setShowTaskModal(false)
      showToast('Task created successfully', 'success')
      await loadLead()
    } catch (err) {
      showToast('Failed to create task', 'error')
    }
  }

  async function handleToggleTask(taskId: number, currentStatus: string) {
    try {
      const newStatus = currentStatus === 'OPEN' ? 'DONE' : 'OPEN'
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })

      if (!res.ok) throw new Error('Failed to update task')

      showToast('Task updated', 'success')
      await loadLead()
    } catch (err) {
      showToast('Failed to update task', 'error')
    }
  }

  async function handleUploadDocument() {
    if (!selectedFile) {
      showToast('Please select a file', 'error')
      return
    }

    try {
      setUploadingDoc(true)
      const formData = new FormData()
      formData.append('file', selectedFile)
      formData.append('category', selectedDocCategory)

      const res = await fetch(`/api/leads/${leadId}/documents/upload`, {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        throw new Error('Failed to upload document')
      }

      setSelectedFile(null)
      setSelectedDocCategory('OTHER')
      setShowDocumentModal(false)
      showToast('Document uploaded successfully', 'success')
      await loadLead()
    } catch (err) {
      showToast('Failed to upload document', 'error')
    } finally {
      setUploadingDoc(false)
    }
  }

  async function handleDeleteDocument(docId: number) {
    if (!confirm('Are you sure you want to delete this document?')) return

    try {
      const res = await fetch(`/api/leads/${leadId}/documents/${docId}`, {
        method: 'DELETE',
      })

      if (!res.ok) throw new Error('Failed to delete document')

      showToast('Document deleted', 'success')
      await loadLead()
      await loadCompliance()
    } catch (err) {
      showToast('Failed to delete document', 'error')
    }
  }

  async function handleAddExpiry() {
    if (!expiryDate) {
      showToast('Expiry date is required', 'error')
      return
    }

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
      showToast('Expiry item added', 'success')
      await loadLead()
    } catch (err) {
      showToast('Failed to add expiry item', 'error')
    }
  }

  function copyToClipboard(text: string, label: string) {
    navigator.clipboard.writeText(text)
    showToast(`${label} copied to clipboard`, 'success')
  }

  const router = useRouter()
  
  function openWhatsApp(phone: string, text?: string) {
    // Navigate to inbox with this contact's conversation instead of external WhatsApp
    const cleanPhone = phone.replace(/[^0-9]/g, '')
    router.push(`/inbox?phone=${encodeURIComponent(cleanPhone)}`)
  }

  function formatMessageTime(dateString: string) {
    const date = new Date(dateString)
    if (isToday(date)) {
      return format(date, 'HH:mm')
    } else if (isYesterday(date)) {
      return `Yesterday ${format(date, 'HH:mm')}`
    } else {
      return format(date, 'MMM dd, HH:mm')
    }
  }

  if (loading) {
    return (
      <MainLayout>
        <div className="p-6 space-y-4">
          <Skeleton className="h-16 w-full" />
          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-3"><Skeleton className="h-96" /></div>
            <div className="col-span-6"><Skeleton className="h-96" /></div>
            <div className="col-span-3"><Skeleton className="h-96" /></div>
          </div>
        </div>
      </MainLayout>
    )
  }

  if (!lead) {
    return (
      <MainLayout>
        <div className="p-6 text-center">
          <AlertCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-lg text-muted-foreground">Lead not found</p>
          <Link href="/leads">
            <Button className="mt-4">Back to Leads</Button>
          </Link>
        </div>
      </MainLayout>
    )
  }

  // Build activity timeline from messages, tasks, expiries, etc.
  const activities = [
    ...(messages || []).map((msg: any) => ({
      id: `msg-${msg.id}`,
      type: 'message' as const,
      title: (msg.direction === 'INBOUND' || msg.direction === 'IN' || msg.direction === 'inbound') ? 'Inbound message' : 'Outbound message',
      description: msg.body || msg.messageSnippet,
      timestamp: msg.createdAt,
      channel: msg.channel,
    })),
    ...(lead.tasks || []).slice(0, 10).map((task: any) => ({
      id: `task-${task.id}`,
      type: 'task' as const,
      title: task.status === 'DONE' ? 'Task completed' : 'Task created',
      description: task.title,
      timestamp: task.status === 'DONE' ? task.doneAt || task.updatedAt : task.createdAt,
      user: task.createdByUser,
    })),
    ...(lead.expiryItems || []).map((expiry: any) => ({
      id: `expiry-${expiry.id}`,
      type: 'expiry' as const,
      title: `${expiry.type} expiry tracked`,
      description: `Expires ${format(parseISO(expiry.expiryDate), 'MMM dd, yyyy')}`,
      timestamp: expiry.createdAt,
    })),
  ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 20)

  // Messages are loaded via loadMessages() and stored in state

  return (
    <MainLayout>
      <div className="flex flex-col h-[calc(100vh-4rem)]">
        {/* Sticky Header Bar */}
        <div className="sticky top-0 z-30 glass-medium border-b shadow-conversation">
          <div className="px-6 py-4">
            <div className="flex items-center justify-between gap-6">
              {/* Left: Breadcrumb + Lead Info */}
              <div className="flex items-center gap-6 flex-1 min-w-0">
                <Link href="/leads">
                  <Button variant="ghost" size="sm" className="gap-2">
                    <ArrowLeft className="h-4 w-4" />
                    Back
                  </Button>
                </Link>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-4">
                    <h1 className="text-3xl font-bold truncate">
                      {lead.contact?.fullName && lead.contact.fullName !== 'Unknown' && !lead.contact.fullName.startsWith('Contact +')
                        ? lead.contact.fullName
                        : lead.contact?.phone
                        ? `Contact ${lead.contact.phone.replace(/^\+/, '')}`
                        : 'Unnamed Lead'}
                    </h1>
                    <AIScoreBadgePremium score={lead.aiScore} />
                    {compliance && compliance.status !== 'GOOD' && (
                      <Badge
                        className={cn(
                          'text-xs',
                          compliance.status === 'CRITICAL' && 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400',
                          compliance.status === 'WARNING' && 'bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400'
                        )}
                        title={compliance.notes}
                      >
                        Compliance: {compliance.status}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-2">
                    {lead.contact?.phone && (
                      <Badge variant="outline" className="text-sm px-3 py-1">
                        <Phone className="h-4 w-4 mr-1.5" />
                        {lead.contact.phone}
                      </Badge>
                    )}
                    {lead.contact?.email && (
                      <Badge variant="outline" className="text-sm px-3 py-1">
                        <Mail className="h-4 w-4 mr-1.5" />
                        {lead.contact.email}
                      </Badge>
                    )}
                    {lead.contact?.source && (
                      <Badge variant="outline" className="text-sm px-3 py-1 capitalize">
                        {lead.contact.source}
                      </Badge>
                    )}
                    <span className="text-sm text-muted-foreground">
                      Created {differenceInDays(new Date(), parseISO(lead.createdAt))} days ago
                    </span>
                  </div>
                </div>
              </div>

              {/* Right: Action Buttons */}
              <div className="flex items-center gap-3 flex-shrink-0">
                <DarkModeToggle />
                {lead.contact?.phone && (
                  <Button
                    onClick={() => openWhatsApp(lead.contact.phone, messageText || undefined)}
                    className="bg-green-600 hover:bg-green-700 text-white shadow-lg"
                    size="lg"
                  >
                    <MessageSquare className="h-5 w-5 mr-2" />
                    WhatsApp
                  </Button>
                )}
                {lead.contact?.phone && (
                  <Button variant="outline" size="sm" onClick={() => window.open(`tel:${lead.contact.phone}`)}>
                    <Phone className="h-4 w-4" />
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => setShowTaskModal(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Task
                </Button>
                <Button variant="ghost" size="sm">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Main 3-Column Layout */}
        <div className="flex-1 overflow-hidden grid grid-cols-12 gap-6 p-6 relative min-h-0">
          {/* LEFT COLUMN: Lead Snapshot */}
          <div className="col-span-12 lg:col-span-3 flex flex-col gap-4 overflow-y-auto">
            {/* Contact Card */}
            <Card className="rounded-2xl glass-soft shadow-snapshot border-2 border-transparent hover:border-primary/10 transition-colors">
              <CardHeader className="pb-3 pt-4 px-5 border-b border-border/50">
                <CardTitle className="text-base font-semibold text-section-header flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Contact
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 px-5 pb-5 pt-4">
                <div>
                  <Label className="text-sm font-medium text-muted-foreground mb-2 block">Name</Label>
                  <InlineEditableField
                    value={
                      lead.contact?.fullName && 
                      lead.contact.fullName !== 'Unknown' && 
                      !lead.contact.fullName.startsWith('Contact +')
                        ? lead.contact.fullName
                        : lead.contact?.phone
                        ? `Contact ${lead.contact.phone.replace(/^\+/, '')}`
                        : 'Unknown Contact'
                    }
                    onSave={async (value) => {
                      // Would need contact update endpoint
                      showToast('Contact update coming soon', 'info')
                      return Promise.resolve()
                    }}
                    className="text-base font-medium"
                    placeholder="Enter contact name"
                  />
                </div>
                {lead.contact?.phone && (
                  <div className="group">
                    <Label className="text-sm font-medium text-muted-foreground mb-2 block">Phone</Label>
                    <div className="flex items-center gap-2">
                      <span className="text-base flex-1">{lead.contact.phone}</span>
                      <QuickActionsMenu 
                        type="phone" 
                        value={lead.contact.phone}
                        phone={lead.contact.phone}
                      />
                    </div>
                  </div>
                )}
                {lead.contact?.email && (
                  <div className="group">
                    <Label className="text-sm font-medium text-muted-foreground mb-2 block">Email</Label>
                    <div className="flex items-center gap-2">
                      <a href={`mailto:${lead.contact.email}`} className="text-base flex-1 hover:underline">
                        {lead.contact.email}
                      </a>
                      <QuickActionsMenu 
                        type="email" 
                        value={lead.contact.email}
                        email={lead.contact.email}
                      />
                    </div>
                  </div>
                )}
                {lead.contact?.nationality && (
                  <div>
                    <Label className="text-sm font-medium text-muted-foreground mb-2 block">Nationality</Label>
                    <span className="text-base">{lead.contact.nationality}</span>
                  </div>
                )}
                <div>
                  <Label className="text-sm font-medium text-muted-foreground mb-2 block">Service Type</Label>
                  <Select
                    value={(() => {
                      if (lead.serviceTypeId) return lead.serviceTypeId.toString()
                      if (lead.serviceTypeEnum && serviceTypes) {
                        const matched = serviceTypes.find(st => st.key?.toLowerCase() === lead.serviceTypeEnum?.toLowerCase())
                        return matched?.id.toString() || ''
                      }
                      return ''
                    })()}
                        onChange={(e) => {
                          const serviceTypeId = e.target.value ? parseInt(e.target.value) : null
                          handleSaveField('serviceTypeId', serviceTypeId)
                        }}
                        className="text-base"
                      >
                        <option value="">Select service...</option>
                        {serviceTypes.map((st) => (
                          <option key={st.id} value={st.id.toString()}>
                            {st.name}
                          </option>
                        ))}
                      </Select>
                  {lead.serviceTypeEnum && !lead.serviceTypeId && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Detected: {lead.serviceTypeEnum.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}
                    </p>
                  )}
                  {lead.requestedServiceRaw && (
                    <p className="text-xs text-blue-600 dark:text-blue-400 mt-1 italic">
                      Customer mentioned: "{lead.requestedServiceRaw}"
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Pipeline Card */}
            <Card className="rounded-2xl glass-soft shadow-snapshot border-2 border-transparent hover:border-primary/10 transition-colors">
              <CardHeader className="pb-4 pt-4 px-5 border-b border-border/50">
                <CardTitle className="text-base font-semibold text-section-header flex items-center gap-2">
                  <Target className="h-4 w-4" />
                  Pipeline
                </CardTitle>
              </CardHeader>
              <CardContent className="px-5 pb-6 pt-4">
                <div className="pipeline-highlight">
                  <PipelineProgress
                    currentStage={lead.stage || lead.pipelineStage || 'NEW'}
                    onStageClick={handleStageChange}
                  />
                </div>
              </CardContent>
            </Card>

            {/* AI Insight Card */}
            <Card className="rounded-2xl glass-soft shadow-snapshot border-2 border-transparent hover:border-primary/10 transition-colors">
              <CardHeader className="pb-3 border-b border-border/50">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-semibold text-section-header flex items-center gap-2">
                    <Sparkles className="h-4 w-4" />
                    AI Insight
                  </CardTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      setGeneratingAI('refresh')
                      try {
                        const res = await fetch(`/api/leads/${leadId}/ai-refresh`, {
                          method: 'POST',
                        })
                        if (res.ok) {
                          showToast('AI insight refreshed', 'success')
                          await loadLead()
                        }
                      } catch (err) {
                        showToast('Failed to refresh AI insight', 'error')
                      } finally {
                        setGeneratingAI(null)
                      }
                    }}
                    disabled={generatingAI === 'refresh'}
                  >
                    {generatingAI === 'refresh' ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 px-5 pb-6">
                <div className="flex justify-center py-2">
                  <AIScoreCircleAnimated 
                    score={lead.aiScore} 
                    size={80}
                    animateOnUpdate={true}
                  />
                </div>
                {lead.aiNotes ? (
                  <div>
                    <Label className="text-sm font-medium text-muted-foreground mb-2 block">Notes</Label>
                    <p className="text-sm text-muted-foreground leading-relaxed">{lead.aiNotes}</p>
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <p className="text-sm text-muted-foreground">No AI insights yet</p>
                    <p className="text-xs text-muted-foreground mt-1">AI will analyze this lead as more data is collected</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Lead Summary - Phase 5 Feature */}
            <LeadSummary leadId={leadId} lead={lead} />

            {/* Forecast Card - Deal Probability & Revenue */}
            <ForecastCard
              leadId={leadId}
              dealProbability={lead.dealProbability}
              expectedRevenueAED={lead.expectedRevenueAED}
              forecastReasonJson={lead.forecastReasonJson}
            />

            {/* Extracted Data Panel - Phase 5 Feature */}
                <ExtractedDataPanel
                  dataJson={lead.dataJson}
                  serviceTypeEnum={lead.serviceTypeEnum}
                  nationality={lead.contact?.nationality}
                  businessActivityRaw={lead.businessActivityRaw || undefined}
                  expiryDate={lead.expiryDate || undefined}
                />
          </div>

          {/* MIDDLE COLUMN: Conversation + Activity */}
          <div className="col-span-12 lg:col-span-6 flex flex-col gap-4 overflow-hidden">
            {/* Conversation Tabs */}
            <Card className="rounded-2xl glass-medium shadow-conversation flex-[2] flex flex-col overflow-hidden min-h-0">
              <CardHeader className="pb-3 flex-shrink-0 p-0">
                <div className="sticky top-16 z-20 glass-medium border-b px-4 py-2">
                  <div className="flex items-center justify-between mb-2">
                  <Tabs value={activeChannel} onValueChange={setActiveChannel}>
                    <TabsList>
                    <TabsTrigger value="whatsapp">
                      <MessageSquare className="h-4 w-4 mr-2" />
                      WhatsApp
                    </TabsTrigger>
                    <TabsTrigger value="email">
                      <Mail className="h-4 w-4 mr-2" />
                      Email
                    </TabsTrigger>
                    <TabsTrigger value="instagram">
                      <Instagram className="h-4 w-4 mr-2" />
                      Instagram
                    </TabsTrigger>
                    <TabsTrigger value="facebook">
                      <Facebook className="h-4 w-4 mr-2" />
                      Facebook
                    </TabsTrigger>
                    <TabsTrigger value="notes">
                      <FileText className="h-4 w-4 mr-2" />
                      Notes
                    </TabsTrigger>
                  </TabsList>
                  </Tabs>
                    {currentUser?.role === 'ADMIN' && conversationId && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1.5 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                        onClick={async () => {
                          if (!confirm('⚠️ Delete this conversation and all messages? This action cannot be undone. This is for testing purposes only.')) {
                            return
                          }
                          try {
                            setDeletingChat(true)
                            const res = await fetch(`/api/admin/conversations/${conversationId}/delete`, {
                              method: 'DELETE',
                              credentials: 'include',
                            })
                            const data = await res.json()
                            if (data.ok) {
                              showToast(`Deleted conversation and ${data.deletedMessages} messages`, 'success')
                              setConversationId(null)
                              setMessages([])
                              await loadLead()
                              await loadMessages()
                            } else {
                              showToast(data.error || 'Failed to delete conversation', 'error')
                            }
                          } catch (err: any) {
                            showToast('Failed to delete conversation', 'error')
                          } finally {
                            setDeletingChat(false)
                          }
                        }}
                        disabled={deletingChat}
                      >
                        {deletingChat ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                        Delete Chat
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>

              <CardContent className="flex-1 flex flex-col overflow-hidden p-0 min-h-0">
                <Tabs value={activeChannel} onValueChange={setActiveChannel} className="flex-1 flex flex-col overflow-hidden min-h-0">
                  {/* WhatsApp Tab */}
                  <TabsContent value="whatsapp" className="flex-1 flex flex-col overflow-hidden m-0 min-h-0">
                    <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4 min-h-0" style={{ maxHeight: 'calc(100vh - 400px)' }} ref={(el) => {
                      // Auto-scroll to bottom
                      if (el && messages.length > 0) {
                        setTimeout(() => {
                          el.scrollTop = el.scrollHeight
                        }, 100)
                      }
                    }}>
                      {loadingMessages ? (
                        <div className="text-center py-4 text-muted-foreground">
                          <Loader2 className="h-6 w-6 mx-auto mb-2 animate-spin" />
                          <p className="text-xs">Loading messages...</p>
                        </div>
                      ) : messages.length === 0 ? (
                        <div className="text-center py-4 text-muted-foreground">
                          <MessageSquare className="h-8 w-8 mx-auto mb-1 opacity-50" />
                          <p className="text-xs">No messages yet. Start a conversation below.</p>
                        </div>
                      ) : (
                        messages
                          .slice()
                          .reverse()
                          .map((msg: any, idx: number) => {
                            const isInbound = msg.direction === 'INBOUND' || msg.direction === 'IN' || msg.direction === 'inbound'
                            const isNewMessage = idx === messages.length - 1 && !isInbound && sending
                            return (
                              <div
                                key={msg.id}
                                className={cn(
                                  'flex gap-3 animate-slide-in',
                                  isInbound ? 'justify-start' : 'justify-end',
                                  isNewMessage && 'animate-message-send'
                                )}
                                style={{ animationDelay: `${idx * 0.05}s` }}
                              >
                                {isInbound && (
                                  <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                                    <User className="h-3 w-3" />
                                  </div>
                                )}
                                                                <div
                                  className={cn(
                                    'rounded-xl px-5 py-3 max-w-[75%] shadow-sm transition-all',
                                    isInbound
                                      ? 'bg-gray-100 dark:bg-gray-800 rounded-tl-none hover:shadow-md'
                                      : 'bg-primary text-primary-foreground rounded-tr-none hover:shadow-md'
                                  )}
                                >
                                  <p className="text-base whitespace-pre-wrap break-words leading-relaxed">{msg.body || msg.messageSnippet}</p>
                                  <div className="flex items-center justify-between mt-3">
                                    <p className={cn('text-xs', isInbound ? 'text-muted-foreground' : 'text-primary-foreground/70')}>
                                      {formatMessageTime(msg.createdAt)}
                                    </p>
                                    {!isInbound && msg.status && (
                                      <div className="flex items-center gap-1 ml-2">
                                                                                {msg.status === 'READ' ? (
                                          <span title="Read"><CheckCheck className="h-3 w-3 text-blue-500" /></span>
                                        ) : msg.status === 'DELIVERED' ? (
                                          <span title="Delivered"><CheckCheck className="h-3 w-3 text-gray-400" /></span>
                                        ) : msg.status === 'SENT' ? (
                                          <span title="Sent"><CheckCircle2 className="h-3 w-3 text-gray-400" /></span>
                                        ) : msg.status === 'FAILED' ? (
                                          <span title="Failed"><XCircle className="h-3 w-3 text-red-500" /></span>
                                        ) : (
                                          <span title="Pending"><Clock className="h-3 w-3 text-gray-400" /></span>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </div>
                                {!isInbound && (
                                  <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                                    <User className="h-3 w-3 text-primary-foreground" />
                                  </div>
                                )}
                              </div>
                            )
                          })
                      )}
                    </div>

                    {/* Message Composer */}
                    <div className="border-t p-4 bg-card/50 flex-shrink-0">
                      <MessageComposerEnhanced
                        value={messageText}
                        onChange={setMessageText}
                        onSend={handleSendMessage}
                        sending={sending}
                        onAIDraft={handleGenerateAIDraft}
                        generatingAI={generatingAI}
                        leadName={lead.contact?.fullName}
                        expiryDate={lead.expiryItems?.[0]?.expiryDate}
                        serviceType={lead.serviceType?.name}
                      />
                    </div>
                  </TabsContent>

                  {/* Email Tab */}
                  <TabsContent value="email" className="flex-1 flex flex-col overflow-hidden m-0 min-h-0">
                    <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4 min-h-0" style={{ maxHeight: 'calc(100vh - 400px)' }}>
                      {loadingMessages ? (
                        <div className="text-center py-4 text-muted-foreground">
                          <Loader2 className="h-6 w-6 mx-auto mb-2 animate-spin" />
                          <p className="text-xs">Loading messages...</p>
                        </div>
                      ) : messages.filter((m: any) => m.channel === 'email').length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">
                          <Mail className="h-12 w-12 mx-auto mb-3 opacity-50" />
                          <p className="text-sm">No email messages yet. Start a conversation below.</p>
                        </div>
                      ) : (
                        messages
                          .filter((m: any) => m.channel === 'email')
                          .slice()
                          .reverse()
                          .map((msg: any, idx: number) => {
                            const isInbound = msg.direction === 'INBOUND' || msg.direction === 'IN' || msg.direction === 'inbound'
                            return (
                              <div
                                key={msg.id}
                                className={cn(
                                  'flex gap-3 animate-slide-in',
                                  isInbound ? 'justify-start' : 'justify-end'
                                )}
                              >
                                {isInbound && (
                                  <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                                    <User className="h-3 w-3" />
                                  </div>
                                )}
                                <div
                                  className={cn(
                                    'rounded-xl px-4 py-2.5 max-w-[70%] shadow-sm transition-all',
                                    isInbound
                                      ? 'bg-gray-100 dark:bg-gray-800 rounded-tl-none hover:shadow-md'
                                      : 'bg-primary text-primary-foreground rounded-tr-none hover:shadow-md'
                                  )}
                                >
                                  <p className="text-sm whitespace-pre-wrap break-words">{msg.body}</p>
                                  <div className="flex items-center justify-between mt-2">
                                    <p className={cn('text-xs', isInbound ? 'text-muted-foreground' : 'text-primary-foreground/70')}>
                                      {formatMessageTime(msg.createdAt)}
                                    </p>
                                    {!isInbound && msg.status && (
                                      <div className="flex items-center gap-1 ml-2">
                                        {msg.status === 'READ' ? (
                                          <span title="Read"><CheckCheck className="h-3 w-3 text-blue-500" /></span>
                                        ) : msg.status === 'DELIVERED' ? (
                                          <span title="Delivered"><CheckCheck className="h-3 w-3 text-gray-400" /></span>
                                        ) : msg.status === 'SENT' ? (
                                          <span title="Sent"><CheckCircle2 className="h-3 w-3 text-gray-400" /></span>
                                        ) : msg.status === 'FAILED' ? (
                                          <span title="Failed"><XCircle className="h-3 w-3 text-red-500" /></span>
                                        ) : (
                                          <span title="Pending"><Clock className="h-3 w-3 text-gray-400" /></span>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </div>
                                {!isInbound && (
                                  <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                                    <User className="h-3 w-3 text-primary-foreground" />
                                  </div>
                                )}
                              </div>
                            )
                          })
                      )}
                    </div>
                    {/* Email Composer */}
                    <div className="border-t p-4 bg-card/50 flex-shrink-0">
                      <MessageComposerEnhanced
                        value={messageText}
                        onChange={setMessageText}
                        onSend={handleSendMessage}
                        sending={sending}
                        onAIDraft={handleGenerateAIDraft}
                        generatingAI={generatingAI}
                        leadName={lead.contact?.fullName}
                        expiryDate={lead.expiryItems?.[0]?.expiryDate}
                        serviceType={lead.serviceType?.name}
                      />
                    </div>
                  </TabsContent>

                  <TabsContent value="instagram" className="flex-1 flex items-center justify-center p-4">
                    <div className="text-center text-muted-foreground">
                      <Instagram className="h-8 w-8 mx-auto mb-1 opacity-50" />
                      <p className="text-xs">Instagram integration coming soon</p>
                    </div>
                  </TabsContent>

                  <TabsContent value="facebook" className="flex-1 flex items-center justify-center p-4">
                    <div className="text-center text-muted-foreground">
                      <Facebook className="h-8 w-8 mx-auto mb-1 opacity-50" />
                      <p className="text-xs">Facebook integration coming soon</p>
                    </div>
                  </TabsContent>

                  <TabsContent value="notes" className="flex-1 px-5 py-4">
                    <div className="space-y-3">
                      {lead.communicationLogs
                        ?.filter((log: any) => log.channel === 'internal')
                        .map((log: any) => (
                          <div key={log.id} className="border rounded-lg p-3">
                            <p className="text-sm">{log.message || log.messageSnippet}</p>
                            <p className="text-xs text-muted-foreground mt-2">
                              {formatMessageTime(log.createdAt)}
                            </p>
                          </div>
                        ))}
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>

            {/* Activity Timeline */}
            <Card className="rounded-2xl glass-soft shadow-snapshot flex-1 flex flex-col overflow-hidden min-h-0">
              <CardHeader className="pb-4 pt-4 px-5 flex-shrink-0">
                <CardTitle className="text-base font-semibold text-section-header">Activity Timeline</CardTitle>
              </CardHeader>
              <CardContent className="px-5 pb-6 flex-1 overflow-y-auto min-h-0">
                <div className="space-y-3">
                  <ActivityTimeline activities={activities} />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* RIGHT COLUMN: Expiry, Tasks, Docs, AI */}
          <div className="col-span-12 lg:col-span-3 flex flex-col gap-4 overflow-y-auto">
            {/* Next Best Action - Phase 5 Feature */}
            <NextBestAction leadId={leadId} />

            {/* Expiry Tracker */}
            <Card className="rounded-2xl glass-soft shadow-sidebar">
              <CardHeader className="pb-4 pt-4 px-5 sticky top-16 bg-card/95 backdrop-blur z-10">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-semibold text-section-header">Expiry Tracker</CardTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowExpiryModal(true)}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 px-5 pb-5">
                {/* Unverified Expiry Hints */}
                {lead.dataJson && (() => {
                  try {
                    const data = JSON.parse(lead.dataJson)
                    if (data.expiry_hint_text) {
                      return (
                        <div className="p-3 rounded-lg border border-yellow-200 bg-yellow-50/50 dark:bg-yellow-900/10 dark:border-yellow-800/50">
                          <div className="flex items-start gap-2 mb-2">
                            <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 mt-0.5 flex-shrink-0" />
                            <div className="flex-1">
                              <p className="text-xs font-medium text-yellow-900 dark:text-yellow-100 mb-1">
                                Unverified Expiry Hint
                              </p>
                              <p className="text-xs text-yellow-700 dark:text-yellow-300 italic">
                                "{data.expiry_hint_text}"
                              </p>
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            className="w-full mt-2 text-xs h-7 border-yellow-300 dark:border-yellow-700"
                            onClick={() => setShowExpiryModal(true)}
                          >
                            <Calendar className="h-3 w-3 mr-1" />
                            Confirm Date
                          </Button>
                        </div>
                      )
                    }
                  } catch (e) {
                    // Invalid JSON, ignore
                  }
                  return null
                })()}

                {/* Verified Expiry Items */}
                {lead.expiryItems && lead.expiryItems.length > 0 ? (
                  lead.expiryItems.map((expiry: any) => {
                    const daysLeft = differenceInDays(parseISO(expiry.expiryDate), new Date())
                    const isOverdue = daysLeft < 0
                    const isUrgent = daysLeft >= 0 && daysLeft <= 7
                    const isWarning = daysLeft > 7 && daysLeft <= 30

                    return (
                      <div
                        key={expiry.id}
                        className={cn(
                          'group p-4 rounded-lg border text-sm hover:shadow-md transition-all cursor-pointer',
                          isOverdue && 'border-red-200 bg-red-50/50 dark:bg-red-900/10 dark:border-red-800/50',
                          isUrgent && 'border-orange-200 bg-orange-50/50 dark:bg-orange-900/10 dark:border-orange-800/50',
                          isWarning && 'border-amber-200 bg-amber-50/50 dark:bg-amber-900/10 dark:border-amber-800/50',
                          !isOverdue && !isUrgent && !isWarning && 'border-border bg-card hover:bg-muted/50'
                        )}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <Badge variant="outline" className="text-sm px-2.5 py-1">
                            {expiry.type.replace(/_/g, ' ')}
                          </Badge>
                          <ExpiryCountdown expiryDate={expiry.expiryDate} type={expiry.type} />
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {format(parseISO(expiry.expiryDate), 'MMM dd, yyyy')}
                        </p>
                        <QuickActionsMenu 
                          type="expiry" 
                          value={expiry.type}
                          expiryDate={expiry.expiryDate}
                          onAction={(action) => {
                            if (action === 'add-task') {
                              setTaskTitle(`Renewal: ${expiry.type.replace(/_/g, ' ')}`)
                              setTaskType('RENEWAL')
                              setShowTaskModal(true)
                            } else if (action === 'renew') {
                              handleGenerateAIDraft('renewal')
                            }
                          }}
                        />
                      </div>
                    )
                  })
                ) : (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No expiry items</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Renewal Revenue Card */}
            {lead.expiryItems && lead.expiryItems.length > 0 && (
              <RenewalRevenueCard
                leadId={leadId}
                estimatedRenewalValue={lead.estimatedRenewalValue}
                renewalProbability={lead.renewalProbability}
                renewalNotes={lead.renewalNotes}
                expiryItems={lead.expiryItems}
                onDraftRenewalMessage={() => handleGenerateAIDraft('renewal')}
                onRefresh={loadLead}
              />
            )}

            {/* Tasks Card */}
            <Card className="rounded-2xl glass-soft shadow-sidebar">
              <CardHeader className="pb-4 pt-4 px-5 sticky top-16 bg-card/95 backdrop-blur z-10">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-semibold text-section-header">Tasks</CardTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowTaskModal(true)}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 px-5 pb-5">
                {lead.tasks && lead.tasks.length > 0 ? (
                  lead.tasks
                    .filter((t: any) => t.status === 'OPEN')
                    .slice(0, 5)
                    .map((task: any) => (
                      <div
                        key={task.id}
                        className="flex items-start gap-3 p-3 rounded-lg border hover:bg-muted/50 cursor-pointer"
                        onClick={() => handleToggleTask(task.id, task.status)}
                      >
                        <input
                          type="checkbox"
                          checked={task.status === 'DONE'}
                          onChange={() => handleToggleTask(task.id, task.status)}
                          className="mt-1 w-4 h-4"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium line-clamp-2 leading-relaxed">{task.title}</p>
                          {task.dueAt && (
                            <p className="text-xs text-muted-foreground mt-2">
                              Due {format(parseISO(task.dueAt), 'MMM dd, yyyy')}
                            </p>
                          )}
                        </div>
                      </div>
                    ))
                ) : (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    <CheckCircle2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No tasks</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Autopilot Card */}
            <AutopilotCard 
              leadId={leadId}
              lead={{
                autoReplyEnabled: lead.autoReplyEnabled,
                allowOutsideHours: lead.allowOutsideHours,
                autoReplyMode: lead.autoReplyMode,
              }}
              onUpdate={loadLead}
            />

            {/* Reminders Card */}
            <RemindersCard leadId={leadId} />

            {/* Alerts/Notifications Card */}
            {lead.notifications && lead.notifications.length > 0 && (
              <Card className="rounded-2xl glass-soft shadow-sidebar">
                <CardHeader className="pb-4 pt-4 px-5 sticky top-16 bg-card/95 backdrop-blur z-10">
                  <CardTitle className="text-base font-semibold text-section-header flex items-center gap-2">
                    <AlertCircle className="h-4 w-4" />
                    Alerts
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 px-5 pb-5">
                  {lead.notifications
                    .filter((n: any) => !n.isRead)
                    .slice(0, 5)
                    .map((notification: any) => (
                      <div
                        key={notification.id}
                        className="flex items-start gap-3 p-3 rounded-lg border bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800"
                      >
                        <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-yellow-900 dark:text-yellow-100">
                            {notification.title}
                          </p>
                          <p className="text-xs text-yellow-700 dark:text-yellow-300 mt-1">
                            {notification.message}
                          </p>
                          <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">
                            {format(parseISO(notification.createdAt), 'MMM dd, yyyy HH:mm')}
                          </p>
                        </div>
                      </div>
                    ))}
                  {lead.notifications.filter((n: any) => !n.isRead).length === 0 && (
                    <div className="text-center py-4 text-muted-foreground text-sm">
                      <CheckCircle2 className="h-6 w-6 mx-auto mb-2 opacity-50" />
                      <p>No unread alerts</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Documents Card - Enhanced with Compliance */}
            <DocumentsCardEnhanced 
              leadId={leadId}
              serviceType={lead.serviceTypeEnum || lead.serviceType?.name}
            />
            
            {/* Legacy Documents Card - Hidden, using enhanced version above */}
            <Card className="hidden rounded-2xl glass-soft shadow-sidebar">
              <CardHeader className="pb-2 pt-3 sticky top-16 bg-card/95 backdrop-blur z-10">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold text-section-header">Documents</CardTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowDocumentModal(true)}
                  >
                    <Upload className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {lead.documents && lead.documents.length > 0 ? (
                  lead.documents.slice(0, 5).map((doc: any) => (
                    <div
                      key={doc.id}
                      className="flex items-center justify-between p-1.5 rounded-lg border hover:bg-muted/50"
                    >
                      <div className="group flex items-center gap-2 flex-1 min-w-0">
                        <FileText className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">{doc.fileName || 'Document'}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {doc.category || 'Other'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <QuickActionsMenu 
                          type="document" 
                          value={doc.fileName || 'Document'}
                          documentId={doc.id}
                          onAction={(action) => {
                            if (action === 'send' && lead.contact?.phone) {
                              setActiveChannel('whatsapp')
                              setMessageText(`Please find attached: ${doc.fileName || 'document'}`)
                            }
                          }}
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteDocument(doc.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-3 text-muted-foreground text-xs">
                    <FileText className="h-6 w-6 mx-auto mb-1 opacity-50" />
                    <p>No documents</p>
                  </div>
                )}
              </CardContent>
            </Card>

            
            {/* Revenue Widget */}
            <RevenueWidget 
              leadId={leadId}
              expiryItems={lead.expiryItems}
              serviceType={lead.serviceType?.name}
              />

              {/* Automation Inspector */}
              <AutomationInspector leadId={leadId} />
  
              {/* AI Assistant Panel */}
            <Card className="rounded-2xl glass-soft shadow-sidebar">
              <CardHeader className="pb-2 pt-3">
                <CardTitle className="text-sm font-semibold text-section-header flex items-center gap-2">
                  <Sparkles className="h-3.5 w-3.5" />
                  AI Assistant
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start text-sm h-10"
                  onClick={async () => {
                    setGeneratingAI('summary')
                    try {
                      const res = await fetch(`/api/leads/${leadId}/ai/summary`, {
                        method: 'POST',
                      })
                      if (res.ok) {
                        const data = await res.json()
                        setAiOutput({ type: 'summary', content: data.summary })
                      }
                    } catch (err) {
                      showToast('Failed to generate summary', 'error')
                    } finally {
                      setGeneratingAI(null)
                    }
                  }}
                  disabled={generatingAI === 'summary'}
                >
                  {generatingAI === 'summary' ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <FileText className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  Summarize
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start text-sm h-10"
                  onClick={async () => {
                    setGeneratingAI('next-action')
                    try {
                      const res = await fetch(`/api/leads/${leadId}/ai/next-action`, {
                        method: 'POST',
                      })
                      if (res.ok) {
                        const data = await res.json()
                        setAiOutput({ type: 'next-action', content: data.actions })
                      }
                    } catch (err) {
                      showToast('Failed to generate next actions', 'error')
                    } finally {
                      setGeneratingAI(null)
                    }
                  }}
                  disabled={generatingAI === 'next-action'}
                >
                  {generatingAI === 'next-action' ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Target className="h-4 w-4 mr-2" />
                  )}
                  Next Best Action
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => handleGenerateAIDraft('renewal')}
                  disabled={generatingAI === 'renewal'}
                >
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                  Renewal
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start text-sm h-10"
                  onClick={async () => {
                    setGeneratingAI('docs-checklist')
                    try {
                      const res = await fetch(`/api/leads/${leadId}/ai/docs-checklist`, {
                        method: 'POST',
                      })
                      if (res.ok) {
                        const data = await res.json()
                        setAiOutput({ type: 'docs-checklist', content: data.checklist })
                      }
                    } catch (err) {
                      showToast('Failed to generate checklist', 'error')
                    } finally {
                      setGeneratingAI(null)
                    }
                  }}
                  disabled={generatingAI === 'docs-checklist'}
                >
                  <FileText className="h-3.5 w-3.5 mr-1.5" />
                  Docs Checklist
                </Button>
                {compliance && (compliance.missingMandatory.length > 0 || compliance.expired.length > 0) && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full justify-start text-sm h-10"
                      onClick={async () => {
                        setGeneratingAI('docs-reminder-wa')
                        try {
                          const res = await fetch(`/api/leads/${leadId}/docs/ai-reminder`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ channel: 'WHATSAPP' }),
                          })
                          if (res.ok) {
                            const data = await res.json()
                            if (data.draft) {
                              // Fill composer with draft
                              setMessageText(data.draft)
                              setActiveChannel('whatsapp')
                              showToast('AI docs reminder generated for WhatsApp', 'success')
                            }
                          }
                        } catch (err) {
                          showToast('Failed to generate docs reminder', 'error')
                        } finally {
                          setGeneratingAI(null)
                        }
                      }}
                      disabled={generatingAI === 'docs-reminder-wa'}
                    >
                      {generatingAI === 'docs-reminder-wa' ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                      ) : (
                        <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                      )}
                      Docs Reminder (WhatsApp)
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full justify-start text-sm h-10"
                      onClick={async () => {
                        setGeneratingAI('docs-reminder-email')
                        try {
                          const res = await fetch(`/api/leads/${leadId}/docs/ai-reminder`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ channel: 'EMAIL' }),
                          })
                          if (res.ok) {
                            const data = await res.json()
                            if (data.draft) {
                              // Fill composer with draft
                              setMessageText(data.draft)
                              setActiveChannel('email')
                              showToast('AI docs reminder generated for Email', 'success')
                            }
                          }
                        } catch (err) {
                          showToast('Failed to generate docs reminder', 'error')
                        } finally {
                          setGeneratingAI(null)
                        }
                      }}
                      disabled={generatingAI === 'docs-reminder-email'}
                    >
                      {generatingAI === 'docs-reminder-email' ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                      ) : (
                        <Mail className="h-3.5 w-3.5 mr-1.5" />
                      )}
                      Docs Reminder (Email)
                    </Button>
                  </>
                )}

                {aiOutput && (
                  <div className="mt-2 p-2 bg-muted rounded-lg">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] font-medium text-muted-foreground uppercase">
                        {aiOutput.type === 'summary' && 'Summary'}
                        {aiOutput.type === 'next-action' && 'Next Actions'}
                        {aiOutput.type === 'docs-checklist' && 'Checklist'}
                      </span>
                      <div className="flex gap-0.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={() => {
                            navigator.clipboard.writeText(
                              typeof aiOutput.content === 'string' ? aiOutput.content : JSON.stringify(aiOutput.content)
                            )
                            showToast('Copied to clipboard', 'success')
                          }}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={() => setAiOutput(null)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                    <div className="text-xs text-foreground max-h-40 overflow-y-auto">
                      {typeof aiOutput.content === 'string' ? (
                        <p className="whitespace-pre-wrap">{aiOutput.content}</p>
                      ) : Array.isArray(aiOutput.content) ? (
                        <ul className="list-disc list-inside space-y-1">
                          {(aiOutput.content as string[]).map((item: string, idx: number) => (
                            <li key={idx}>{item}</li>
                          ))}
                        </ul>
                      ) : (
                        <pre className="text-xs">{JSON.stringify(aiOutput.content, null, 2)}</pre>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Modals */}
      {/* Task Modal */}
      <Dialog open={showTaskModal} onOpenChange={setShowTaskModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Task</DialogTitle>
            <DialogDescription>Add a follow-up task for this lead</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Title</Label>
              <Input
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                placeholder="e.g., Follow up on visa application"
              />
            </div>
            <div>
              <Label>Type</Label>
              <Select value={taskType} onChange={(e) => setTaskType(e.target.value)}>
                {TASK_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Due Date</Label>
              <Input
                type="datetime-local"
                value={taskDueAt}
                onChange={(e) => setTaskDueAt(e.target.value)}
              />
            </div>
            <div>
              <Label>Assign To</Label>
              <Select
                value={taskAssignedUserId?.toString() || ''}
                onChange={(e) => setTaskAssignedUserId(e.target.value ? parseInt(e.target.value) : null)}
              >
                <option value="">Unassigned</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id.toString()}>
                    {user.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowTaskModal(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateTask}>Create Task</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Document Modal */}
      <Dialog open={showDocumentModal} onOpenChange={setShowDocumentModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload Document</DialogTitle>
            <DialogDescription>Upload a document for this lead</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Category</Label>
              <Select
                value={selectedDocCategory}
                onChange={(e) => setSelectedDocCategory(e.target.value)}
              >
                {DOCUMENT_CATEGORIES.map((cat) => (
                  <option key={cat.value} value={cat.value}>
                    {cat.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>File</Label>
              <Input
                ref={fileInputRef}
                type="file"
                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowDocumentModal(false)}>
                Cancel
              </Button>
              <Button onClick={handleUploadDocument} disabled={uploadingDoc || !selectedFile}>
                {uploadingDoc ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Upload
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Expiry Modal */}
      <Dialog open={showExpiryModal} onOpenChange={setShowExpiryModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Expiry Item</DialogTitle>
            <DialogDescription>Track an expiry date for this lead</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Type</Label>
              <Select value={expiryType} onChange={(e) => setExpiryType(e.target.value)}>
                {EXPIRY_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Expiry Date</Label>
              <Input
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
              />
            </div>
            <div>
              <Label>Notes (optional)</Label>
              <Textarea
                value={expiryNotes}
                onChange={(e) => setExpiryNotes(e.target.value)}
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowExpiryModal(false)}>
                Cancel
              </Button>
              <Button onClick={handleAddExpiry}>Add Expiry</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Won/Lost Modal */}
      <Dialog open={showWonLostModal} onOpenChange={setShowWonLostModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {pendingStage === 'COMPLETED_WON' ? 'Mark as Won' : 'Mark as Lost'}
            </DialogTitle>
            <DialogDescription>
              {pendingStage === 'COMPLETED_WON'
                ? 'Congratulations! Add deal value if available.'
                : 'Add a reason for why this lead was lost.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {pendingStage === 'COMPLETED_WON' && (
              <div>
                <Label>Deal Value (optional)</Label>
                <Input type="number" placeholder="e.g., 5000" />
              </div>
            )}
            {pendingStage === 'LOST' && (
              <div>
                <Label>Lost Reason (optional)</Label>
                <Textarea placeholder="e.g., Not interested, Price too high..." rows={3} />
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowWonLostModal(false)}>
                Cancel
              </Button>
              <Button
                onClick={async () => {
                  if (pendingStage) {
                    await handleStageChange(pendingStage)
                    setShowWonLostModal(false)
                    setPendingStage(null)
                  }
                }}
              >
                Confirm
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </MainLayout>
  )
}

