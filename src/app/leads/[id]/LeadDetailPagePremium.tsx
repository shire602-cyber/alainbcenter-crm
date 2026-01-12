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
import { RevenueWidget } from '@/components/leads/RevenueWidget'
import { InlineEditableField } from '@/components/leads/InlineEditableField'
import { ExpiryCountdown } from '@/components/leads/ExpiryCountdown'
import { RemindersCard } from '@/components/leads/RemindersCard'
import { ExtractedDataPanel } from '@/components/leads/ExtractedDataPanel'
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
  const [error, setError] = useState<string | null>(null)
  const [activeChannel, setActiveChannel] = useState('whatsapp')
  const [messageText, setMessageText] = useState('')
  const [sending, setSending] = useState(false)
  const [messages, setMessages] = useState<any[]>([])
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [conversationId, setConversationId] = useState<number | null>(null)
  const [conversationsByChannel, setConversationsByChannel] = useState<Record<string, number | null>>({})
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

  // Update conversationId when activeChannel changes (if we already have conversationsByChannel)
  useEffect(() => {
    if (Object.keys(conversationsByChannel).length > 0) {
      const activeChannelMap: Record<string, string> = {
        whatsapp: 'whatsapp',
        email: 'email',
        instagram: 'instagram',
        facebook: 'facebook',
      }
      const dbChannel = activeChannelMap[activeChannel] || 'whatsapp'
      setConversationId(conversationsByChannel[dbChannel] || null)
    }
  }, [activeChannel, conversationsByChannel])

  async function loadConversationId() {
    if (!lead?.contactId) return
    try {
      // Fetch ALL conversations for this contact across all channels
      // This ensures Instagram conversations are found even if they don't have a leadId yet
      const convRes = await fetch(`/api/inbox/conversations?channel=all`)
      if (convRes.ok) {
        const convData = await convRes.json()
        // Filter conversations by contactId
        const contactConversations = convData.conversations?.filter((c: any) => c.contact?.id === lead.contactId) || []
        
        // Build a map of channel -> conversationId
        const channelMap: Record<string, number | null> = {
          whatsapp: null,
          email: null,
          instagram: null,
          facebook: null,
        }
        
        // Map each conversation to its channel
        contactConversations.forEach((conv: any) => {
          const channel = conv.channel?.toLowerCase() || 'whatsapp'
          if (channel in channelMap) {
            channelMap[channel] = conv.id
          }
        })
        
        // Store all conversations by channel
        setConversationsByChannel(channelMap)
        
        // Set the conversationId for the currently active channel
        const activeChannelMap: Record<string, string> = {
          whatsapp: 'whatsapp',
          email: 'email',
          instagram: 'instagram',
          facebook: 'facebook',
        }
        const dbChannel = activeChannelMap[activeChannel] || 'whatsapp'
        setConversationId(channelMap[dbChannel] || null)
      } else {
        setConversationsByChannel({})
        setConversationId(null)
      }
    } catch (err) {
      console.error('Failed to load conversation ID:', err)
      setConversationsByChannel({})
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
      setError(null)
      const res = await fetch(`/api/leads/${leadId}`)
      
      // API now always returns 200, so check response data instead of res.ok
      const data = await res.json().catch(() => ({ error: 'Failed to parse response' }))
      
      // Handle redirect responses (404 with _redirect)
      if (data._redirect) {
        window.location.href = data._redirect
        return
      }
      
      const leadData = data.lead || data
      
      if (!leadData || !leadData.id) {
        const errorMessage = data.error || 'Invalid lead data received from server'
        setError(errorMessage)
        console.error('Invalid lead data:', data)
        showToast(errorMessage, 'error')
        return
      }
      
      // Handle skeleton data (ultra-minimal fallback failed)
      if (leadData._skeleton) {
        const skeletonError = leadData._error || 'Lead data unavailable due to memory constraints'
        setError(skeletonError)
        console.warn(`[LEAD-PAGE] Skeleton data for lead ${leadId}:`, skeletonError)
        // Still set lead data so UI can render basic info
        setLead({
          ...leadData,
          contact: leadData.contact || { id: 0, fullName: 'Unknown', phone: '', email: '' },
          tasks: [],
          expiryItems: [],
          documents: [],
          conversations: [],
          messages: [],
          communicationLogs: [],
          notifications: [],
        })
        showToast(skeletonError, 'warning')
        return
      }
      
      // Handle partial data (some relations failed to load)
      if (data._partial || data._errors?.length > 0) {
        const errorMessages = data._errors || []
        if (errorMessages.length > 0) {
          console.warn(`[LEAD-PAGE] Partial data for lead ${leadId}:`, errorMessages)
          showToast(`Some data could not be loaded: ${errorMessages.join(', ')}`, 'warning')
        }
      }
      
      // Normalize data: ensure all nested objects have defaults
      const normalizedLead = {
        ...leadData,
        contact: leadData.contact || null,
        tasks: leadData.tasks || leadData.tasksGrouped?.open?.concat(leadData.tasksGrouped?.done || []).concat(leadData.tasksGrouped?.snoozed || []) || [],
        tasksGrouped: leadData.tasksGrouped || {
          open: [],
          done: [],
          snoozed: [],
        },
        expiryItems: leadData.expiryItems || [],
        documents: leadData.documents || [],
        conversations: leadData.conversations || [],
        messages: leadData.messages || [],
        communicationLogs: leadData.communicationLogs || [],
        notifications: leadData.notifications || [],
      }
      
      setLead(normalizedLead)
      // Only set error if it's a skeleton (complete failure), not partial data
      if (!leadData._skeleton) {
        setError(null)
      }
    } catch (err: any) {
      const errorMessage = err.message || 'Network error'
      setError(errorMessage)
      console.error('Failed to load lead:', err)
      showToast(`Failed to load lead: ${errorMessage}`, 'error')
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
      
      // If we have a conversationId for the active channel, use the conversation API
      // This works even if the conversation doesn't have a leadId yet (e.g., Instagram)
      const activeChannelMap: Record<string, string> = {
        whatsapp: 'whatsapp',
        email: 'email',
        instagram: 'instagram',
        facebook: 'facebook',
      }
      const dbChannel = activeChannelMap[activeChannel] || 'whatsapp'
      const convId = conversationsByChannel[dbChannel] || conversationId
      
      if (convId) {
        // Use conversation API - works for all channels including Instagram without leadId
        const res = await fetch(`/api/inbox/conversations/${convId}`)
        if (res.ok) {
          const data = await res.json()
          // Extract messages from conversation response (response structure: { ok: true, conversation: { messages: [...] } })
          if (data.ok && data.conversation?.messages) {
            setMessages(data.conversation.messages || [])
            return
          }
        }
      }
      
      // Fallback: Use lead messages API (requires leadId)
      // This is the old behavior for backward compatibility
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
      } else {
        // If no conversation found, set empty messages
        setMessages([])
      }
    } catch (err) {
      console.error('Failed to load messages:', err)
      setMessages([])
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
          <div className="grid grid-cols-12 gap-8">
            <div className="col-span-8"><Skeleton className="h-96" /></div>
            <div className="col-span-4"><Skeleton className="h-96" /></div>
          </div>
        </div>
      </MainLayout>
    )
  }

  if (error) {
    return (
      <MainLayout>
        <div className="p-6 text-center">
          <AlertCircle className="h-12 w-12 mx-auto mb-4 text-red-500" />
          <p className="text-lg text-red-600 mb-2">Error loading lead</p>
          <p className="text-sm text-muted-foreground mb-4">{error}</p>
          <div className="flex gap-2 justify-center">
            <Button onClick={loadLead}>Retry</Button>
            <Link href="/leads">
              <Button variant="outline">Back to Leads</Button>
            </Link>
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
          <div className="flex gap-2 justify-center mt-4">
            <Button onClick={loadLead}>Retry</Button>
            <Link href="/leads">
              <Button variant="outline">Back to Leads</Button>
            </Link>
          </div>
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
      <div className="flex flex-col min-h-screen bg-gray-50">
        {/* Sticky Header Bar - Enhanced Professional Design */}
        <div className="sticky top-0 z-30 bg-white border-b border-gray-200 shadow-sm">
          <div className="px-10 py-7">
            <div className="flex items-start justify-between gap-8">
              {/* Left: Breadcrumb + Lead Info */}
              <div className="flex items-start gap-5 flex-1 min-w-0">
                <Link href="/leads">
                  <Button variant="ghost" size="sm" className="gap-2 text-gray-600 hover:text-gray-900 hover:bg-gray-50 -ml-2">
                    <ArrowLeft className="h-4 w-4" />
                    Back
                  </Button>
                </Link>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-4">
                    <h1 className="text-3xl font-bold text-gray-900 truncate tracking-tight">
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
                          'text-xs font-semibold px-3 py-1',
                          compliance.status === 'CRITICAL' && 'bg-red-50 text-red-700 border border-red-200',
                          compliance.status === 'WARNING' && 'bg-amber-50 text-amber-700 border border-amber-200'
                        )}
                        title={compliance.notes}
                      >
                        {compliance.status}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-5 flex-wrap">
                    {lead.contact?.phone && (
                      <div className="flex items-center gap-2.5 text-sm text-gray-700">
                        <Phone className="h-4 w-4 text-gray-500" />
                        <span className="font-semibold">{lead.contact.phone}</span>
                      </div>
                    )}
                    {lead.contact?.email && (
                      <div className="flex items-center gap-2.5 text-sm text-gray-700">
                        <Mail className="h-4 w-4 text-gray-500" />
                        <span className="font-semibold">{lead.contact.email}</span>
                      </div>
                    )}
                    {lead.contact?.source && (
                      <Badge variant="outline" className="text-xs px-3 py-1 text-gray-700 border-gray-300 capitalize font-medium">
                        {lead.contact.source}
                      </Badge>
                    )}
                    <span className="text-sm text-gray-500 font-medium">
                      Created {differenceInDays(new Date(), parseISO(lead.createdAt))} days ago
                    </span>
                  </div>
                </div>
              </div>

              {/* Right: Action Buttons - Better Grouping */}
              <div className="flex items-center gap-3 flex-shrink-0">
                {lead.contact?.phone && (
                  <Button
                    onClick={() => openWhatsApp(lead.contact?.phone || '', messageText || undefined)}
                    className="bg-green-600 hover:bg-green-700 text-white shadow-md font-semibold px-5"
                    size="default"
                  >
                    <MessageSquare className="h-4 w-4 mr-2" />
                    WhatsApp
                  </Button>
                )}
                <div className="flex items-center gap-2 border-l border-gray-200 pl-3">
                  {lead.contact?.phone && (
                    <Button variant="outline" size="sm" onClick={() => lead.contact?.phone && window.open(`tel:${lead.contact.phone}`)} className="border-gray-300 hover:bg-gray-50">
                      <Phone className="h-4 w-4" />
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={() => setShowTaskModal(true)} className="border-gray-300 hover:bg-gray-50">
                    <Plus className="h-4 w-4 mr-1.5" />
                    Task
                  </Button>
                  <Button variant="ghost" size="sm" className="text-gray-600 hover:bg-gray-50">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Main 2-Column Layout - Enhanced Professional Design */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-[1800px] mx-auto px-12 py-10">
            <div className="grid grid-cols-12 gap-8">
              {/* LEFT COLUMN: Main Content (2/3 width) */}
              <div className="col-span-12 lg:col-span-8 flex flex-col gap-8">
                {/* Pipeline Card - Enhanced styling */}
                <Card className="rounded-xl border border-gray-200 bg-white shadow-md">
                  <CardHeader className="pb-4 pt-7 px-7 border-b border-gray-100">
                    <CardTitle className="text-lg font-bold text-gray-900 flex items-center gap-3">
                      <Target className="h-5 w-5 text-gray-600" />
                      Pipeline
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-7 pb-7 pt-7">
                    <div className="pipeline-highlight">
                      <PipelineProgress
                        currentStage={lead.stage || lead.pipelineStage || 'NEW'}
                        onStageClick={handleStageChange}
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Internal Notes Section - Enhanced styling */}
                <Card className="rounded-xl border border-gray-200 bg-white shadow-md">
                  <CardHeader className="pb-4 pt-7 px-7 border-b border-gray-100">
                    <CardTitle className="text-lg font-bold text-gray-900 flex items-center gap-3">
                      <FileText className="h-5 w-5 text-gray-600" />
                      Internal Notes
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-7 pb-7 pt-7">
                    <div className="space-y-3">
                      {lead.communicationLogs
                        ?.filter((log: any) => log.channel === 'internal')
                        .map((log: any) => (
                          <div key={log.id} className="border border-gray-200 rounded-lg p-5 bg-gray-50/50 hover:bg-gray-50 transition-all hover:shadow-sm">
                            <p className="text-sm font-medium text-gray-800 leading-relaxed">{log.message || log.messageSnippet}</p>
                            <p className="text-xs text-gray-500 mt-3 font-medium">
                              {formatMessageTime(log.createdAt)}
                            </p>
                          </div>
                        ))}
                      {(!lead.communicationLogs || lead.communicationLogs.filter((log: any) => log.channel === 'internal').length === 0) && (
                        <div className="text-center py-12">
                          <FileText className="h-10 w-10 mx-auto mb-3 text-gray-400" />
                          <p className="text-sm font-medium text-gray-500">No internal notes yet</p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

            {/* Extracted Data Panel - Keep for auto-detection */}
            <ExtractedDataPanel
              dataJson={lead.dataJson}
              serviceTypeEnum={lead.serviceTypeEnum}
              nationality={lead.contact?.nationality}
              businessActivityRaw={lead.businessActivityRaw || undefined}
              expiryDate={lead.expiryDate || undefined}
            />
              </div>

              {/* RIGHT COLUMN: Sidebar (1/3 width) */}
              <div className="col-span-12 lg:col-span-4 flex flex-col gap-8">
                {/* Contact Card - Enhanced styling */}
                <Card className="rounded-xl border border-gray-200 bg-white shadow-md">
                  <CardHeader className="pb-4 pt-7 px-7 border-b border-gray-100">
                    <CardTitle className="text-lg font-bold text-gray-900 flex items-center gap-3">
                      <User className="h-5 w-5 text-gray-600" />
                      Contact
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6 px-7 pb-7 pt-7">
                <div>
                  <Label className="text-sm font-semibold text-gray-700 mb-3 block">Name</Label>
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
                    className="text-base font-semibold text-gray-900"
                    placeholder="Enter contact name"
                  />
                </div>
                {lead.contact?.phone && (
                  <div className="group">
                    <Label className="text-sm font-semibold text-gray-700 mb-3 block">Phone</Label>
                    <div className="flex items-center gap-2">
                      <span className="text-base font-semibold text-gray-900 flex-1">{lead.contact.phone}</span>
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
                    <Label className="text-sm font-semibold text-gray-700 mb-3 block">Email</Label>
                    <div className="flex items-center gap-2">
                      <a href={`mailto:${lead.contact.email}`} className="text-base font-semibold text-gray-900 flex-1 hover:underline hover:text-blue-600">
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
                    <Label className="text-sm font-semibold text-gray-700 mb-3 block">Nationality</Label>
                    <span className="text-base font-semibold text-gray-900">{lead.contact.nationality}</span>
                  </div>
                )}
                <div>
                  <Label className="text-sm font-semibold text-gray-700 mb-3 block">Service Needed</Label>
                  {lead.requestedServiceRaw && !lead.serviceTypeId && (
                    <div className="mb-2 p-2 bg-blue-50 border border-blue-200 rounded">
                      <p className="text-sm font-bold text-blue-900">
                        {lead.requestedServiceRaw}
                      </p>
                      <p className="text-xs text-blue-700 mt-1">
                        Detected from messages - select service type below to confirm
                      </p>
                    </div>
                  )}
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
                    <p className="text-xs text-slate-600 mt-1">
                      Detected: {lead.serviceTypeEnum.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}
                    </p>
                  )}
                  {lead.requestedServiceRaw && (
                    <p className="text-xs text-blue-700 mt-1 italic">
                      Customer mentioned: "{lead.requestedServiceRaw}"
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

                {/* AI Assistant - Enhanced styling */}
                <Card className="rounded-xl border border-gray-200 bg-white shadow-md">
                  <CardHeader className="pb-4 pt-7 px-7 border-b border-gray-100">
                    <CardTitle className="text-lg font-bold text-gray-900 flex items-center gap-3">
                      <Sparkles className="h-5 w-5 text-gray-600" />
                      AI Assistant
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 px-7 pb-7 pt-7">
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

            {/* Compact 4-Box Grid - 2x2 layout */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Expiry Tracker - Professional styling */}
                <Card className="rounded-xl border border-gray-200 bg-white shadow-sm">
                  <CardHeader className="pb-2 pt-4 px-4 border-b border-gray-100">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-semibold text-gray-900">Expiry Tracker</CardTitle>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowExpiryModal(true)}
                        className="text-gray-600 hover:text-gray-900 h-6 w-6 p-0"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3 px-4 pb-4 pt-4">
                {/* Unverified Expiry Hints */}
                {lead.dataJson && (() => {
                  try {
                    const data = JSON.parse(lead.dataJson)
                    if (data.expiry_hint_text) {
                      return (
                        <div className="p-3 rounded-lg border border-yellow-200/60 bg-yellow-50">
                          <div className="flex items-start gap-2 mb-2">
                            <AlertCircle className="h-4 w-4 text-yellow-700 mt-0.5 flex-shrink-0" />
                            <div className="flex-1">
                              <p className="text-xs font-bold text-yellow-900 mb-1 tracking-tight">
                                Unverified Expiry Hint
                              </p>
                              <p className="text-xs text-yellow-800 italic font-medium">
                                "{data.expiry_hint_text}"
                              </p>
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            className="w-full mt-2 text-xs h-7 border-yellow-300/60 font-semibold"
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
                          'group p-4 rounded-lg border text-sm hover:bg-muted/50 transition-all cursor-pointer',
                          isOverdue && 'border-red-200/60 bg-red-50',
                          isUrgent && 'border-orange-200/60 bg-orange-50',
                          isWarning && 'border-amber-200/60 bg-amber-50',
                          !isOverdue && !isUrgent && !isWarning && 'border-border bg-card hover:bg-muted/50'
                        )}
                      >
                        <div className="flex items-center justify-between mb-3">
                          <Badge variant="outline" className="text-sm px-2.5 py-1 rounded-full">
                            {(expiry.type || 'UNKNOWN').replace(/_/g, ' ')}
                          </Badge>
                          <ExpiryCountdown expiryDate={expiry.expiryDate} type={expiry.type || 'UNKNOWN'} />
                        </div>
                        <div className="space-y-2">
                          <div>
                            <Label className="text-xs font-medium text-muted-foreground mb-1 block">Expiry Date</Label>
                            <InlineEditableField
                              value={format(parseISO(expiry.expiryDate), 'yyyy-MM-dd')}
                              type="date"
                              onSave={async (newDate) => {
                                try {
                                  const res = await fetch(`/api/expiry-items/${expiry.id}`, {
                                    method: 'PATCH',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                      expiryDate: newDate,
                                    }),
                                  })
                                  if (!res.ok) {
                                    const errorData = await res.json().catch(() => ({ error: 'Failed to update expiry date' }))
                                    throw new Error(errorData.error || 'Failed to update expiry date')
                                  }
                                  showToast('Expiry date updated successfully', 'success')
                                  await loadLead()
                                  return Promise.resolve()
                                } catch (err: any) {
                                  showToast(err.message || 'Failed to update expiry date', 'error')
                                  return Promise.reject(err)
                                }
                              }}
                              className="text-sm font-medium"
                              displayValue={format(parseISO(expiry.expiryDate), 'MMM dd, yyyy')}
                            />
                          </div>
                          {expiry.notes && (
                            <p className="text-xs text-muted-foreground">{expiry.notes}</p>
                          )}
                        </div>
                        <div className="mt-3">
                          <QuickActionsMenu 
                            type="expiry" 
                            value={expiry.type}
                            expiryDate={expiry.expiryDate}
                            onAction={(action) => {
                              if (action === 'add-task') {
                                setTaskTitle(`Renewal: ${(expiry.type || 'UNKNOWN').replace(/_/g, ' ')}`)
                                setTaskType('RENEWAL')
                                setShowTaskModal(true)
                              } else if (action === 'renew') {
                                handleGenerateAIDraft('renewal')
                              }
                            }}
                          />
                        </div>
                      </div>
                    )
                  })
                ) : (
                  <div className="text-center py-4 text-muted-foreground text-xs">
                    <Calendar className="h-6 w-6 mx-auto mb-1.5 opacity-50" />
                    <p>No expiry items</p>
                  </div>
                )}
              </CardContent>
            </Card>

                {/* Tasks Card - Professional styling */}
                <Card className="rounded-xl border border-gray-200 bg-white shadow-sm">
                  <CardHeader className="pb-2 pt-4 px-4 border-b border-gray-100">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-semibold text-gray-900">Tasks</CardTitle>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowTaskModal(true)}
                        className="text-gray-600 hover:text-gray-900 h-6 w-6 p-0"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2 px-4 pb-4 pt-4">
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
                  <div className="text-center py-4 text-gray-500 text-xs">
                    <CheckCircle2 className="h-6 w-6 mx-auto mb-1.5 opacity-50" />
                    <p>No tasks</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Reminders Card - Wrapped for grid */}
            <div className="md:col-span-1">
              <RemindersCard leadId={leadId} />
            </div>

                {/* Documents Card - Professional styling */}
                <Card className="rounded-xl border border-gray-200 bg-white shadow-sm">
                  <CardHeader className="pb-2 pt-4 px-4 border-b border-gray-100">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-semibold text-gray-900">Documents</CardTitle>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowDocumentModal(true)}
                        className="text-gray-600 hover:text-gray-900 h-6 w-6 p-0"
                      >
                        <Upload className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2 px-4 pb-4 pt-4">
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
                  <div className="text-center py-4 text-gray-500 text-xs">
                    <FileText className="h-6 w-6 mx-auto mb-1.5 opacity-50" />
                    <p>No documents</p>
                  </div>
                )}
              </CardContent>
            </Card>
            </div>

            {/* Revenue Widget */}
            <RevenueWidget 
              leadId={leadId}
              expiryItems={lead.expiryItems}
              serviceType={lead.serviceType?.name}
            />

                {/* Alerts/Notifications Card - Enhanced styling */}
                {lead.notifications && lead.notifications.length > 0 && (
                  <Card className="rounded-xl border border-gray-200 bg-white shadow-md">
                    <CardHeader className="pb-4 pt-7 px-7 border-b border-gray-100">
                      <CardTitle className="text-lg font-bold text-gray-900 flex items-center gap-3">
                        <AlertCircle className="h-5 w-5 text-gray-600" />
                        Alerts
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 px-7 pb-7 pt-7">
                  {lead.notifications
                    .filter((n: any) => !n.isRead)
                    .slice(0, 5)
                    .map((notification: any) => (
                      <div
                        key={notification.id}
                        className="flex items-start gap-3 p-3 rounded-lg border bg-yellow-50 border-yellow-200/60"
                      >
                        <AlertCircle className="h-4 w-4 text-yellow-700 mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-yellow-900 tracking-tight">
                            {notification.title}
                          </p>
                          <p className="text-xs text-yellow-800 mt-1 font-medium">
                            {notification.message}
                          </p>
                          <p className="text-xs text-yellow-700 mt-1 font-semibold">
                            {format(parseISO(notification.createdAt), 'MMM dd, yyyy HH:mm')}
                          </p>
                        </div>
                      </div>
                    ))}
                  {lead.notifications.filter((n: any) => !n.isRead).length === 0 && (
                    <div className="text-center py-4 text-gray-500 text-sm">
                      <CheckCircle2 className="h-6 w-6 mx-auto mb-2 opacity-50" />
                      <p>No unread alerts</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
              </div>
            </div>
          </div>
        </div>

        {/* Activity Timeline Section - Enhanced styling */}
        <div className="border-t border-gray-200 bg-gray-50" data-activity-timeline>
          <div className="max-w-[1800px] mx-auto px-12 py-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-8">Activity Timeline</h2>
            <div className="border border-gray-200 rounded-xl p-10 bg-white shadow-md">
              <ActivityTimeline activities={activities} />
            </div>
          </div>
        </div>

        {/* Bottom Communication Section - Enhanced styling */}
        <div className="border-t border-gray-200 bg-white">
          <div className="max-w-[1800px] mx-auto px-12 py-10">
            {/* Communication Action Buttons - Better Grouping */}
            <div className="flex items-center gap-4 mb-8">
            <Button
              onClick={() => {
                setActiveChannel('whatsapp')
                const composer = document.querySelector('textarea[placeholder*="message"]') as HTMLTextAreaElement
                if (composer) {
                  setTimeout(() => composer.focus(), 100)
                }
              }}
              className="bg-green-600 hover:bg-green-700 text-white shadow-md font-semibold px-6"
            >
              <MessageSquare className="h-4 w-4 mr-2" />
              Send message
            </Button>
            <div className="flex items-center gap-2 border-l border-gray-200 pl-4">
              <Button
                variant="outline"
                onClick={() => {
                  // Add internal note functionality
                  const note = prompt('Enter internal note:')
                  if (note) {
                    // Would need API endpoint for internal notes
                    showToast('Internal note feature coming soon', 'info')
                  }
                }}
                className="border-gray-300 hover:bg-gray-50 font-medium"
              >
                <FileText className="h-4 w-4 mr-2" />
                Log note
              </Button>
              {lead.contact?.phone && (
                <Button
                  variant="outline"
                  onClick={() => openWhatsApp(lead.contact?.phone || '', messageText || undefined)}
                  className="border-gray-300 hover:bg-gray-50 font-medium"
                >
                  <MessageSquare className="h-4 w-4 mr-2" />
                  WhatsApp
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() => {
                  // Scroll to activity timeline
                  const timeline = document.querySelector('[data-activity-timeline]')
                  if (timeline) {
                    timeline.scrollIntoView({ behavior: 'smooth', block: 'start' })
                  }
                }}
                className="border-gray-300 hover:bg-gray-50 font-medium"
              >
                <Clock className="h-4 w-4 mr-2" />
                Activities
              </Button>
            </div>
          </div>

            {/* Channel Selector - Enhanced */}
            <div className="mb-8 flex items-center gap-3 border-b border-gray-200 pb-6">
            <span className="text-sm font-semibold text-gray-700 mr-2">Channel:</span>
            <Button
              variant={activeChannel === 'whatsapp' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveChannel('whatsapp')}
              className={cn(
                'font-medium',
                activeChannel === 'whatsapp' ? 'bg-green-600 hover:bg-green-700 text-white' : 'border-gray-300 hover:bg-gray-50'
              )}
            >
              <MessageSquare className="h-4 w-4 mr-2" />
              WhatsApp
            </Button>
            <Button
              variant={activeChannel === 'email' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveChannel('email')}
              className={cn(
                'font-medium',
                activeChannel === 'email' ? '' : 'border-gray-300 hover:bg-gray-50'
              )}
            >
              <Mail className="h-4 w-4 mr-2" />
              Email
            </Button>
            <Button
              variant={activeChannel === 'instagram' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveChannel('instagram')}
              className={cn(
                'font-medium',
                activeChannel === 'instagram' ? '' : 'border-gray-300 hover:bg-gray-50'
              )}
            >
              <Instagram className="h-4 w-4 mr-2" />
              Instagram
            </Button>
            <Button
              variant={activeChannel === 'facebook' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveChannel('facebook')}
              className={cn(
                'font-medium',
                activeChannel === 'facebook' ? '' : 'border-gray-300 hover:bg-gray-50'
              )}
            >
              <Facebook className="h-4 w-4 mr-2" />
              Facebook
            </Button>
          </div>

            {/* Message History - Enhanced styling */}
            <div className="border border-gray-200 rounded-xl p-8 bg-gray-50/50 min-h-[350px] max-h-[550px] overflow-y-auto mb-8">
            {loadingMessages ? (
              <div className="text-center py-12 text-gray-500">
                <Loader2 className="h-8 w-8 mx-auto mb-3 animate-spin text-gray-400" />
                <p className="text-sm font-medium">Loading messages...</p>
              </div>
            ) : messages.length === 0 ? (
              <div className="text-center py-16 text-gray-500">
                <MessageSquare className="h-16 w-16 mx-auto mb-4 opacity-50" />
                <p className="text-sm font-medium">No messages yet. Start a conversation below.</p>
              </div>
            ) : (
              <div className="space-y-5">
                {messages
                  .slice()
                  .reverse()
                  .map((msg: any, idx: number) => {
                    const isInbound = msg.direction === 'INBOUND' || msg.direction === 'IN' || msg.direction === 'inbound'
                    const channelMap: Record<string, string> = {
                      whatsapp: 'WHATSAPP',
                      email: 'EMAIL',
                      instagram: 'INSTAGRAM',
                      facebook: 'FACEBOOK',
                    }
                    const msgChannel = msg.channel?.toUpperCase() || 'WHATSAPP'
                    const activeChannelUpper = channelMap[activeChannel] || 'WHATSAPP'
                    const matchesChannel = msgChannel === activeChannelUpper || (activeChannel === 'whatsapp' && !msg.channel)
                    if (!matchesChannel) return null
                    
                    return (
                      <div
                        key={msg.id}
                        className={cn(
                          'flex gap-4',
                          isInbound ? 'justify-start' : 'justify-end'
                        )}
                      >
                        {isInbound && (
                          <div className="w-10 h-10 rounded-full bg-gray-300 flex items-center justify-center flex-shrink-0 shadow-sm">
                            <User className="h-5 w-5 text-gray-600" />
                          </div>
                        )}
                        <div
                          className={cn(
                            'max-w-[75%] rounded-xl p-5 shadow-md',
                            isInbound
                              ? 'bg-white border border-gray-200 text-gray-900'
                              : 'bg-blue-600 text-white'
                          )}
                        >
                          <p className="text-sm font-medium whitespace-pre-wrap break-words leading-relaxed">{msg.body || msg.messageSnippet || '[Media message]'}</p>
                          <p className={cn('text-xs mt-3 font-semibold', isInbound ? 'text-gray-500' : 'text-blue-100')}>
                            {formatMessageTime(msg.createdAt)}
                          </p>
                        </div>
                        {!isInbound && (
                          <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0 shadow-sm">
                            <User className="h-5 w-5 text-white" />
                          </div>
                        )}
                      </div>
                    )
                  })}
              </div>
            )}
          </div>

            {/* Message Composer - Enhanced styling */}
            <div className="border border-gray-200 rounded-xl p-8 bg-white shadow-md">
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

