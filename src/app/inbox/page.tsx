'use client'

import { useEffect, useState, useRef, FormEvent, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { MainLayout } from '@/components/layout/MainLayout'
import { BentoCard } from '@/components/dashboard/BentoCard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Avatar } from '@/components/ui/avatar'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Inbox as InboxIcon,
  Search,
  Send,
  MessageSquare,
  CheckCircle2,
  CheckCheck,
  Clock,
  Loader2,
  XCircle,
  Sparkles,
  Phone,
  Mail,
  MessageCircle,
  Instagram,
  Facebook,
  Globe,
  Eye,
  Users,
  Image as ImageIcon,
  FileText,
  Video,
  MapPin,
  Paperclip,
  X,
  Sparkles as SparklesIcon,
  UserPlus,
  Trash2,
  AlertTriangle,
  Music,
} from 'lucide-react'
import { format, isToday, isYesterday, differenceInDays, parseISO } from 'date-fns'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { AudioMessagePlayer } from '@/components/inbox/AudioMessagePlayer'
import { MediaMessage } from '@/components/inbox/MediaMessage'
import { hasMedia, detectMediaType } from '@/lib/media/mediaTypeDetection'
import { MEDIA_TYPES } from '@/lib/media/extractMediaId'
import { Select } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Languages, Flame, TrendingUp, Snowflake } from 'lucide-react'
import { getAiScoreCategory } from '@/lib/constants'
import { isWithinInstagramWindow } from '@/lib/integrations/instagramWindow'

type Contact = {
  id: number
  fullName: string
  phone: string
  email?: string | null
  profilePhoto?: string | null // Instagram profile photo URL
  igUsername?: string | null // Instagram username (e.g., "john_doe")
  igUserId?: string | null   // Instagram numeric ID (e.g., "6221774837922501")
  providedPhone?: string | null
  providedPhoneE164?: string | null
  providedEmail?: string | null
}

type Conversation = {
  id: number
  contact: Contact
  channel: string
  status: string
  lastMessageAt: string
  lastInboundAt?: string | null
  unreadCount: number
  lastMessage: {
    id: number
    direction: string
    body: string
    createdAt: string
  } | null
  createdAt: string
  assignedUser: {
    id: number
    name: string
    email: string
  } | null
}

type Message = {
  id: number
  direction: string
  channel: string
  type: string
  body: string | null
  providerMediaId?: string | null // Canonical media ID
  mediaUrl: string | null // Stores providerMediaId for WhatsApp (legacy)
  mediaMimeType: string | null
  mediaProxyUrl?: string | null // Canonical proxy URL
  hasMedia?: boolean // Canonical media flag
  mediaFilename?: string | null // Media filename
  status: string
  providerMessageId: string | null
  sentAt: string | null
  createdBy: {
    id: number
    name: string
    email: string
  } | null
  createdAt: string
  // PHASE 5A: Include attachments
  attachments?: Array<{
    id: number
    type: string
    url: string
    mimeType: string | null
    filename: string | null
    sizeBytes: number | null
    durationSec: number | null
    thumbnailUrl: string | null
  }>
}

type Lead = {
  id: number
  contact: {
    id: number
    fullName: string
    phone: string
    email?: string | null
  }
  stage: string
  pipelineStage?: string
  leadType?: string | null
  serviceType: {
    id: number
    name: string
  } | null
  priority: string | null
  aiScore: number | null
  notes: string | null
  nextFollowUpAt: string | null
  expiryDate: string | null
  assignedUser: {
    id: number
    name: string
    email: string
  } | null
  expiryItems?: Array<{
    id: number
    type: string
    expiryDate: string
  }>
}

const CHANNELS = [
  { value: 'all', label: 'All Channels', icon: InboxIcon },
  { value: 'whatsapp', label: 'WhatsApp', icon: MessageSquare },
  { value: 'instagram', label: 'Instagram', icon: Instagram },
  { value: 'facebook', label: 'Facebook', icon: Facebook },
  { value: 'email', label: 'Email', icon: Mail },
  { value: 'webchat', label: 'Web Chat', icon: Globe },
] as const

// PART 2: Helper to extract message text from various fields
function getMessageDisplayText(msg: any): string | null {
  // Check all possible text fields
  if (msg.text) return msg.text
  if (msg.body) return msg.body
  if (msg.content) return msg.content
  if (msg.caption) return msg.caption
  if (msg.payload?.text?.body) return msg.payload.text.body
  if (msg.payload?.button?.text) return msg.payload.button.text
  if (msg.payload?.interactive?.body?.text) return msg.payload.interactive.body.text
  return null
}

// Helper to extract Instagram username from phone
function getInstagramUsername(phone: string): string | null {
  if (phone && phone.startsWith('ig:')) {
    return phone.substring(3)
  }
  return null
}

// Helper to get display name for contact in inbox
function getContactDisplayName(contact: Contact, channel: string): string {
  // For Instagram: Check igUsername first (dedicated field)
  if (channel === 'instagram' && contact.igUsername) {
    return `@${contact.igUsername}`
  }
  
  // If we have a good fullName (not generic/placeholder), use it
  const isGenericName = !contact.fullName || 
    contact.fullName === 'Instagram User' ||
    contact.fullName.includes('Unknown') ||
    contact.fullName.startsWith('Contact +') ||
    contact.fullName.startsWith('@') ||
    contact.fullName.trim() === ''
  
  if (!isGenericName) {
    return contact.fullName
  }
  
  // For Instagram, try to show username from phone if fullName is generic
  if (channel === 'instagram' && contact.phone) {
    const username = getInstagramUsername(contact.phone)
    if (username) {
      // Show @username if fullName is generic or missing
      return `@${username}`
    }
    
    // Fallback: extract from phone if it's in ig: format
    if (contact.phone.startsWith('ig:')) {
      const extractedUsername = contact.phone.substring(3)
      return `@${extractedUsername}`
    }
    
    // Last resort: use igUserId if available (but format nicely)
    if (contact.igUserId) {
      return `@${contact.igUserId}`
    }
  }
  
  // Final fallback
  return contact.phone || 'Unknown'
}

// STEP 3: Removed renderPlaceholderMedia - always try proxy first
// The proxy will return 404 if media is truly unavailable
// This ensures we don't show "unavailable" for messages that might have media in metadata/rawPayload

function InboxPageContent() {
  // STEP 0: Build stamp for deployment verification
  const [buildInfo, setBuildInfo] = useState<{ buildId?: string; buildTime?: string } | null>(null)
  
  useEffect(() => {
    fetch('/api/health')
      .then(res => res.json())
      .then(data => setBuildInfo({ buildId: data.buildId, buildTime: data.buildTime }))
      .catch(() => {})
  }, [])
  
  // Helper to get media URL - PRIORITY: Use mediaProxyUrl if available, otherwise construct from mediaUrl
  // CRITICAL: Defined outside map to prevent Webpack bundling issues
  const getMediaUrl = (msg: Message): string => {
    // #region agent log
    try {
      fetch('http://127.0.0.1:7242/ingest/a9581599-2981-434f-a784-3293e02077df',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'inbox/page.tsx:getMediaUrl',message:'getMediaUrl called',data:{messageId:msg.id,hasMediaProxyUrl:!!msg.mediaProxyUrl,hasMedia:msg.hasMedia,mediaUrl:msg.mediaUrl,mediaUrlType:typeof msg.mediaUrl},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'M1'})}).catch(()=>{});
    } catch (e) {}
    // #endregion
    
    // CRITICAL FIX: ALWAYS use proxy URL for media messages, even if mediaUrl is null
    // The proxy will try to recover from payload/rawPayload/ExternalEventLog
    // Use canonical hasMedia flag
    if (msg.hasMedia) {
      // ALWAYS use proxy - it will try recovery
      const proxyUrl = msg.mediaProxyUrl || `/api/media/messages/${msg.id}`
      return proxyUrl
    }
    
    // PRIORITY 1: Use mediaProxyUrl if available
    if (msg.mediaProxyUrl) {
      return msg.mediaProxyUrl
    }
    
    // PRIORITY 2: Fallback to constructing URL from mediaUrl (WhatsApp media ID)
    const mediaUrl = typeof msg.mediaUrl === 'string' ? msg.mediaUrl : null
    if (!mediaUrl || mediaUrl.trim() === '') {
      return ''
    }
    const result = mediaUrl.startsWith('http') || mediaUrl.startsWith('/')
      ? mediaUrl
      : `/api/media/messages/${msg.id}` // Use main media proxy endpoint
    // #region agent log
    try {
      fetch('http://127.0.0.1:7242/ingest/a9581599-2981-434f-a784-3293e02077df',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'inbox/page.tsx:getMediaUrl',message:'getMediaUrl returning constructed URL',data:{messageId:msg.id,result,isProxy:!mediaUrl.startsWith('http')&&!mediaUrl.startsWith('/')},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'M1'})}).catch(()=>{});
    } catch (e) {}
    // #endregion
    return result
  }
  
  const searchParams = useSearchParams()
  const phoneParam = searchParams?.get('phone')
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null)
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [newMessage, setNewMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [generatingDraft, setGeneratingDraft] = useState(false)
  const [activeChannel, setActiveChannel] = useState<string>('all')
  const [uploading, setUploading] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [showAudioRecorder, setShowAudioRecorder] = useState(false)
  const [users, setUsers] = useState<Array<{ id: number; name: string; email: string; role: string }>>([])
  const [user, setUser] = useState<{ id: number; name: string; email: string; role: string } | null>(null)
  const [assigning, setAssigning] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showTemplateModal, setShowTemplateModal] = useState(false)
  const [templates, setTemplates] = useState<Array<{ name: string; language: string; category: string; components?: any[] }>>([])
  const [loadingTemplates, setLoadingTemplates] = useState(false)
  const [templateError, setTemplateError] = useState<string | null>(null)
  const [selectedTemplate, setSelectedTemplate] = useState<{ name: string; language: string; components?: any[] } | null>(null)
  const [templateVariables, setTemplateVariables] = useState<string[]>([])
  const [sendingTemplate, setSendingTemplate] = useState(false)
  const [requiresTemplate, setRequiresTemplate] = useState(false)
  const [translations, setTranslations] = useState<Record<number, { text: string; showing: boolean }>>({})
  const [translating, setTranslating] = useState<Record<number, boolean>>({})
  const selectedContactPhone = selectedConversation?.contact?.phone || ''
  const isInstagramThread = selectedConversation?.channel?.toLowerCase() === 'instagram'
  const isInstagramSenderId = selectedContactPhone.startsWith('ig:')
  const providedPhoneRaw = selectedConversation?.contact?.providedPhone || null
  const providedPhoneE164 = selectedConversation?.contact?.providedPhoneE164 || null
  const providedEmail = selectedConversation?.contact?.providedEmail || null
  const preferredPhone = providedPhoneE164 || providedPhoneRaw || (isInstagramSenderId ? null : selectedContactPhone)
  const withinInstagramWindow = !isInstagramThread
    ? true
    : isWithinInstagramWindow(selectedConversation?.lastInboundAt || null)
  const instagramSendDisabled = isInstagramThread && !withinInstagramWindow
  const fileInputRef = useRef<HTMLInputElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  function buildConversationsUrl() {
    const params = new URLSearchParams()
    params.set('channel', activeChannel === 'all' ? 'all' : activeChannel)
    const trimmed = searchQuery.trim()
    if (trimmed.length >= 2) {
      params.set('search', trimmed)
    }
    return `/api/inbox/conversations?${params.toString()}`
  }

  async function loadConversations() {
    try {
      setLoading(true)
      const res = await fetch(buildConversationsUrl())
      const data = await res.json()

      if (data.ok) {
        setConversations(data.conversations || [])
        setError(null) // Clear any previous errors
      } else {
        // Don't show DB migration errors prominently - they're handled gracefully
        if (data.code === 'DB_MISMATCH') {
          // Silently handle - the API will work without deletedAt column
          setConversations([])
          setError(null)
        } else {
          setError(data.error || 'Failed to load conversations')
        }
      }
    } catch (err: any) {
      setError('Failed to load conversations')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadConversations()
    // Load current user
    fetch('/api/auth/me')
      .then(res => res.json())
      .then(data => setUser(data.user))
      .catch(() => {})
    // Load users for assignment (if admin)
    fetch('/api/admin/users')
      .then(res => res.json())
      .then(data => {
        if (data.ok && data.users) {
          setUsers(data.users)
        }
      })
      .catch(() => {})
  }, [activeChannel])

  useEffect(() => {
    const trimmed = searchQuery.trim()
    if (trimmed.length === 1) return
    const timer = setTimeout(() => {
      loadConversations()
    }, 250)
    return () => clearTimeout(timer)
  }, [searchQuery])

  // Auto-refresh: Poll for new messages every 3 seconds (silent background refresh)
  useEffect(() => {
    const interval = setInterval(() => {
      // Silent background refresh - don't show loading states
      fetch(buildConversationsUrl())
        .then(res => res.json())
        .then(data => {
          if (data.ok) {
            // Smoothly update conversations without jarring transitions
            setConversations(prev => {
              // Merge new conversations with existing ones to maintain scroll position
              const existingMap = new Map(prev.map(c => [c.id, c]))
              const newConversations = (data.conversations || []).map((newConv: Conversation) => {
                const existing = existingMap.get(newConv.id)
                // Preserve selection state
                return existing && existing.id === selectedConversation?.id 
                  ? { ...newConv, ...existing }
                  : newConv
              })
              return newConversations
            })
          }
        })
        .catch(() => {}) // Silent fail for background refresh
      
      // Refresh messages if a conversation is selected (silent)
      if (selectedConversation) {
        fetch(`/api/inbox/conversations/${selectedConversation.id}`)
          .then(res => res.json())
          .then(data => {
            if (data.ok && data.conversation) {
              // Smoothly update messages without clearing the list
              setMessages(prev => {
                const existingMap = new Map(prev.map(m => [m.id, m]))
                const newMessages = (data.conversation.messages || []).map((newMsg: Message) => {
                  const existing = existingMap.get(newMsg.id)
                  return existing || newMsg
                })
                // Only update if there are actually new messages
                if (newMessages.length !== prev.length || 
                    newMessages.some((m: Message, i: number) => m.id !== prev[i]?.id)) {
                  return newMessages
                }
                return prev
              })
              setSelectedLead(data.conversation.lead)
            }
          })
          .catch(() => {}) // Silent fail
      }
    }, 3000) // Poll every 3 seconds

    return () => clearInterval(interval)
  }, [selectedConversation, activeChannel, searchQuery])

  async function loadMessages(conversationId: number, silent: boolean = false) {
    try {
      if (!silent) setLoadingMessages(true)
      setError(null)

      await fetch(`/api/inbox/conversations/${conversationId}/read`, {
        method: 'POST',
      })

      const res = await fetch(`/api/inbox/conversations/${conversationId}`)
      const data = await res.json()
      
      // #region agent log
      try {
        const messagesWithMedia = (data.conversation?.messages || []).filter((m: any) => m.mediaUrl || (m.attachments && m.attachments.length > 0))
        fetch('http://127.0.0.1:7242/ingest/a9581599-2981-434f-a784-3293e02077df',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'inbox/page.tsx:loadMessages',message:'API response received',data:{conversationId,ok:data.ok,hasConversation:!!data.conversation,messagesCount:data.conversation?.messages?.length||0,messagesWithMediaCount:messagesWithMedia.length,messagesWithMedia:messagesWithMedia.map((m:any)=>({id:m.id,type:m.type,mediaUrl:m.mediaUrl,attachmentsCount:m.attachments?.length||0}))},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'M4'})}).catch(()=>{});
      } catch (e) {}
      // #endregion

      if (data.ok && data.conversation) {
        // Smooth transition - preserve existing messages and fade in new ones
        setMessages(prev => {
          const newMessages = data.conversation.messages || []
          // If messages are the same, don't update to prevent flicker
          if (prev.length === newMessages.length && 
              prev.every((m, i) => m.id === newMessages[i]?.id)) {
            return prev
          }
          return newMessages
        })
        setSelectedLead(data.conversation.lead)
        setConversations((prev) =>
          prev.map((c) =>
            c.id === conversationId
              ? { ...c, unreadCount: 0, lastMessage: data.conversation.lastMessage }
              : c
          )
        )
      } else {
        if (!silent) setError(data.error || 'Failed to load messages')
      }
    } catch (err: any) {
      if (!silent) setError('Failed to load messages')
      console.error(err)
    } finally {
      if (!silent) setLoadingMessages(false)
    }
  }

  async function handleSelectConversation(conversation: Conversation) {
    setSelectedConversation(conversation)
    await loadMessages(conversation.id)
    // Clear phone param from URL after selecting
    if (phoneParam) {
      const url = new URL(window.location.href)
      url.searchParams.delete('phone')
      window.history.replaceState({}, '', url.toString())
    }
  }

  // Handle phone number query parameter to auto-select conversation
  useEffect(() => {
    if (phoneParam && conversations.length > 0) {
      const matchingConv = conversations.find(c => 
        c.contact.phone?.replace(/[^0-9]/g, '') === phoneParam.replace(/[^0-9]/g, '')
      )
      if (matchingConv && matchingConv.id !== selectedConversation?.id) {
        handleSelectConversation(matchingConv)
      }
    }
  }, [conversations, phoneParam])

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file size (16MB max for WhatsApp)
    const maxSize = 16 * 1024 * 1024
    if (file.size > maxSize) {
      setError(`File size exceeds 16MB limit. Selected file: ${(file.size / 1024 / 1024).toFixed(2)}MB`)
      return
    }

    setSelectedFile(file)
    setError(null)
    setShowAudioRecorder(false) // Hide recorder if file selected
  }

  async function handleAudioRecordingComplete(audioBlob: Blob) {
    // Create a File object from the blob
    const audioFile = new File([audioBlob], `recording-${Date.now()}.webm`, {
      type: 'audio/webm',
    })
    
    setSelectedFile(audioFile)
    setShowAudioRecorder(false)
    setError(null)
    
    // Auto-upload and send the recording
    setTimeout(() => {
      handleUploadFile()
    }, 100)
  }

  async function handleUploadFile() {
    if (!selectedFile || !selectedConversation) return

    setUploading(true)
    setError(null)
    setSuccess(null)
    setUploadProgress(0)

    try {
      // Step 1: Upload file to get public URL
      const formData = new FormData()
      formData.append('file', selectedFile)

      const uploadRes = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      })

      if (!uploadRes.ok) {
        const error = await uploadRes.json()
        throw new Error(error.error || 'Failed to upload file')
      }

      setUploadProgress(50)

      const uploadData = await uploadRes.json()
      const mediaId = uploadData.mediaId // Meta media ID (not URL)

      if (!mediaId) {
        throw new Error('Upload succeeded but no media ID returned')
      }

      // Step 2: Determine media type
      let mediaType: 'image' | 'document' | 'video' | 'audio' = 'document'
      if (selectedFile.type.startsWith('image/')) {
        mediaType = 'image'
      } else if (selectedFile.type.startsWith('video/')) {
        mediaType = 'video'
      } else if (selectedFile.type.startsWith('audio/')) {
        mediaType = 'audio'
      }

      setUploadProgress(75)

      // Step 3: Send media message using media ID
      const res = await fetch(`/api/inbox/conversations/${selectedConversation.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mediaId, // Use media ID instead of URL
          mediaType,
          mediaCaption: newMessage.trim() || undefined,
          mediaFilename: selectedFile.name,
        }),
      })

      const data = await res.json()

      if (data.ok) {
        setSuccess('Media sent successfully!')
        setNewMessage('')
        setSelectedFile(null)
        if (fileInputRef.current) {
          fileInputRef.current.value = ''
        }
        await loadMessages(selectedConversation.id)
        await loadConversations()
      } else {
        setError(data.error || 'Failed to send media')
        if (data.hint) {
          setError(`${data.error}\n💡 ${data.hint}`)
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to upload and send file')
      console.error(err)
    } finally {
      setUploading(false)
      setUploadProgress(0)
    }
  }

  async function loadTemplates() {
    setLoadingTemplates(true)
    setTemplateError(null)
    try {
      const res = await fetch('/api/whatsapp/templates?onlyApproved=1')
      const data = await res.json()
      
      if (data.ok && data.templates) {
        setTemplates(data.templates)
        if (data.templates.length === 0) {
          setTemplateError('No approved templates returned from this WABA.')
        }
      } else {
        // API returned an error
        const errorMsg = data.message || data.error || 'Failed to load templates'
        const errorDetails = data.details?.error?.message || data.details?.error?.error_user_msg || ''
        const fullError = errorDetails ? `${errorMsg}: ${errorDetails}` : errorMsg
        
        setTemplateError(fullError)
        console.error('Failed to load templates:', {
          status: res.status,
          error: data.error,
          message: data.message,
          details: data.details,
        })
      }
    } catch (err: any) {
      const errorMsg = err.message || 'Failed to load templates'
      setTemplateError(errorMsg)
      console.error('Failed to load templates:', err)
    } finally {
      setLoadingTemplates(false)
    }
  }

  async function handleSendTemplate() {
    if (!selectedConversation || !selectedTemplate) return

    setSendingTemplate(true)
    setError(null)
    setSuccess(null)

    try {
      const res = await fetch('/api/whatsapp/send-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: selectedConversation.contact.phone,
          templateName: selectedTemplate.name,
          language: selectedTemplate.language,
          variables: templateVariables,
        }),
      })

      const data = await res.json()

      if (data.ok) {
        setSuccess('Template message sent successfully!')
        setShowTemplateModal(false)
        setSelectedTemplate(null)
        setTemplateVariables([])
        setRequiresTemplate(false)
        await loadMessages(selectedConversation.id)
        await loadConversations()
      } else {
        setError(data.error || 'Failed to send template message')
      }
    } catch (err: any) {
      setError('Failed to send template message')
      console.error(err)
    } finally {
      setSendingTemplate(false)
    }
  }

  async function handleSendMessage(e: FormEvent) {
    e.preventDefault()
    if (!selectedConversation) return

    // If file is selected, upload it instead
    if (selectedFile) {
      await handleUploadFile()
      return
    }

    if (!newMessage.trim()) return
    if (instagramSendDisabled) {
      setError('Instagram messaging window closed. You can reply within 24 hours of the last inbound message.')
      return
    }

    setSending(true)
    setError(null)
    setSuccess(null)

    try {
      const clientMessageId = crypto.randomUUID()
      const res = await fetch(`/api/inbox/conversations/${selectedConversation.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: newMessage.trim(), clientMessageId }),
      })

      const data = await res.json()

      if (data.ok) {
        if (data.wasDuplicate) {
          setSuccess('Message already sent')
        } else {
          setSuccess('Message sent successfully!')
        }
        setNewMessage('')
        await loadMessages(selectedConversation.id)
        await loadConversations()
      } else {
        if (data.code === 'OUTSIDE_ALLOWED_WINDOW') {
          setError('Instagram messaging window closed. You can reply within 24 hours of the last inbound message.')
          return
        }
        // Check if this is a 24-hour window error
        if (data.requiresTemplate) {
          setRequiresTemplate(true)
          await loadTemplates() // Load templates before opening modal
          setShowTemplateModal(true)
          setError('WhatsApp requires a template outside the 24-hour window.')
        } else {
          setError(data.error || 'Failed to send message')
          if (data.hint) {
            setError(`${data.error}\n💡 ${data.hint}`)
          }
        }
      }
    } catch (err: any) {
      setError('Failed to send message')
      console.error(err)
    } finally {
      setSending(false)
    }
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

  function getInitials(name: string) {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  function needsReply(conv: Conversation): boolean {
    if (!conv.lastMessage || conv.lastMessage.direction !== 'inbound') return false
    const lastMessageTime = new Date(conv.lastMessageAt)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
    return lastMessageTime < oneHourAgo
  }

  function getChannelIcon(channel: string) {
    switch (channel.toLowerCase()) {
      case 'whatsapp':
        return MessageSquare
      case 'instagram':
        return Instagram
      case 'facebook':
      case 'meta_lead_ads':
        return Facebook
      case 'email':
        return Mail
      case 'webchat':
        return Globe
      default:
        return MessageCircle
    }
  }

  // Language detection helper
  function detectLanguage(text: string): 'en' | 'non-en' {
    if (!text || typeof text !== 'string') return 'en'
    
    // Check for Arabic (common in UAE)
    const arabicRegex = /[\u0600-\u06FF]/
    if (arabicRegex.test(text)) {
      return 'non-en'
    }
    
    // Check for mostly ASCII (likely English)
    const asciiRatio = (text.match(/[\x00-\x7F]/g) || []).length / text.length
    if (asciiRatio > 0.9) {
      return 'en'
    }
    
    // Default to non-English if uncertain
    return 'non-en'
  }

  // Translate message
  async function handleTranslate(messageId: number, text: string) {
    // Check if already translated
    if (translations[messageId]) {
      setTranslations(prev => ({
        ...prev,
        [messageId]: { ...prev[messageId], showing: !prev[messageId].showing }
      }))
      return
    }

    setTranslating(prev => ({ ...prev, [messageId]: true }))

    try {
      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, targetLang: 'en' }),
      })

      const data = await res.json()

      if (data.translatedText) {
        setTranslations(prev => ({
          ...prev,
          [messageId]: { text: data.translatedText, showing: true }
        }))
      } else {
        setError(data.error || 'Translation failed')
      }
    } catch (err: any) {
      setError('Failed to translate message')
      console.error(err)
    } finally {
      setTranslating(prev => ({ ...prev, [messageId]: false }))
    }
  }

  const useServerSearch = searchQuery.trim().length >= 2
  const filteredConversations = useServerSearch
    ? conversations
    : conversations.filter((conv) => {
        if (!searchQuery) return true
        const query = searchQuery.toLowerCase()
        return (
          conv.contact.fullName.toLowerCase().includes(query) ||
          conv.contact.phone.includes(query) ||
          (conv.lastMessage?.body || '').toLowerCase().includes(query)
        )
      })

  return (
    <MainLayout>
      <div className="flex h-[calc(100vh-4rem)] gap-2">
        {/* Left Panel: Conversation List - Compact */}
        <BentoCard className="w-80 flex-shrink-0 rounded-none border-r flex flex-col p-0 overflow-hidden glass-soft">
          {/* Header */}
          <div className="p-3 border-b border-slate-200/60 glass-medium">
            <div className="flex items-center gap-2 mb-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100">
                <InboxIcon className="h-4 w-4 text-slate-700" />
              </div>
              <h1 className="text-subhead">Inbox</h1>
            </div>

            {/* Channel Tabs */}
            <Tabs value={activeChannel} onValueChange={setActiveChannel}>
              <TabsList className="grid w-full grid-cols-3 h-auto gap-1">
                {CHANNELS.map((channel) => {
                  const Icon = channel.icon
                  return (
                    <TabsTrigger
                      key={channel.value}
                      value={channel.value}
                      className="flex flex-col h-auto py-1.5 text-caption"
                    >
                      <Icon className="h-3.5 w-3.5 mb-0.5" />
                      <span>{channel.label}</span>
                    </TabsTrigger>
                  )
                })}
              </TabsList>
            </Tabs>
            </div>

          {/* Search */}
          <div className="p-3 border-b border-slate-200/60">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <Input
                placeholder="Search conversations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-8 text-caption"
              />
            </div>
          </div>

          {/* Conversation List */}
          <div className="flex-1 overflow-y-auto p-2">
            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-16 w-full rounded-xl" />
                ))}
              </div>
            ) : filteredConversations.length === 0 ? (
              <EmptyState
                icon={MessageSquare}
                title="No conversations"
                description="Start a conversation to see it here."
              />
            ) : (
              <div className="space-y-1">
                {filteredConversations.map((conv) => {
                  const ChannelIcon = getChannelIcon(conv.channel)
                  return (
                    <div
                      key={conv.id}
                      className={cn(
                        'flex items-center gap-2 p-2 rounded-xl cursor-pointer transition-all duration-300 hover-lift',
                        selectedConversation?.id === conv.id 
                          ? 'bg-slate-100 border border-slate-300 shadow-sm' 
                          : 'hover:bg-slate-50/80'
                      )}
                      onClick={() => handleSelectConversation(conv)}
                    >
                      <Avatar 
                        src={conv.contact.profilePhoto || undefined}
                        alt={conv.contact.fullName || conv.contact.phone}
                        fallback={conv.contact.fullName && !conv.contact.fullName.includes('Unknown') ? conv.contact.fullName : conv.contact.phone} 
                        size="sm" 
                      />
                        <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <div className="flex items-center gap-1.5 flex-1 min-w-0">
                            <p className={cn(
                              "text-caption truncate text-slate-900 font-semibold",
                              conv.unreadCount > 0 && "font-semibold"
                            )}>
                              {getContactDisplayName(conv.contact, conv.channel)}
                            </p>
                            {conv.unreadCount > 0 && (
                              <div className="h-2 w-2 rounded-full bg-indigo-500 flex-shrink-0"></div>
                            )}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <ChannelIcon className="h-3 w-3 text-slate-400" />
                              {conv.unreadCount > 0 && (
                              <Badge className="text-caption h-4 px-1.5">
                                  {conv.unreadCount}
                                </Badge>
                              )}
                            </div>
                          </div>
                        <div className="flex items-center justify-between text-caption text-slate-600 mt-0.5">
                          <p className="truncate flex-1">
                            {conv.lastMessage?.direction === 'outbound' ? 'You: ' : ''}
                            {conv.lastMessage?.body || 'No messages'}
                            </p>
                          <span className="ml-1 shrink-0">{formatMessageTime(conv.lastMessageAt)}</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </BentoCard>

        {/* Right Panel: Messages - Compact */}
        <BentoCard className="flex-1 flex flex-col rounded-none p-0 overflow-hidden glass-soft">
          {selectedConversation ? (
            <>
              <div className="p-3 border-b border-slate-200/60 flex items-center justify-between gap-2 glass-medium">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <Avatar 
                    src={selectedConversation.contact.profilePhoto || undefined}
                    alt={selectedConversation.contact.fullName || selectedContactPhone}
                    fallback={selectedConversation.contact.fullName || selectedContactPhone} 
                    size="md" 
                  />
                    <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-body font-semibold truncate">
                        {getContactDisplayName(selectedConversation.contact, selectedConversation.channel)}
                      </h3>
                      {selectedLead?.aiScore !== null && selectedLead?.aiScore !== undefined && (
                        <Badge
                          variant={getAiScoreCategory(selectedLead.aiScore)}
                          className="flex items-center gap-1 text-caption shrink-0"
                        >
                          {getAiScoreCategory(selectedLead.aiScore) === 'hot' && <Flame className="h-3 w-3" />}
                          {getAiScoreCategory(selectedLead.aiScore) === 'warm' && <TrendingUp className="h-3 w-3" />}
                          {getAiScoreCategory(selectedLead.aiScore) === 'cold' && <Snowflake className="h-3 w-3" />}
                          <span className="capitalize">{getAiScoreCategory(selectedLead.aiScore)}</span>
                          <span className="text-caption opacity-75">({selectedLead.aiScore})</span>
                        </Badge>
                      )}
                    </div>
                    {selectedConversation.contact.fullName && 
                     !selectedConversation.contact.fullName.includes('Unknown') && selectedContactPhone && (
                      <p className="text-caption text-slate-600 truncate">
                        {isInstagramSenderId ? 'Instagram Sender ID' : 'Phone'}: {selectedContactPhone}
                      </p>
                    )}
                    {providedPhoneRaw && (
                      <p className="text-caption text-slate-600 truncate">
                        Provided Phone: {providedPhoneRaw}
                        {providedPhoneE164 ? ` (Normalized: ${providedPhoneE164})` : ''}
                      </p>
                    )}
                    {providedEmail && (
                      <p className="text-caption text-slate-600 truncate">
                        Provided Email: {providedEmail}
                      </p>
                    )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {/* AI/User Toggle - Always visible for all users */}
                    <Select
                      value={selectedConversation.assignedUser?.id?.toString() || 'ai'}
                      onChange={async (e) => {
                        const value = e.target.value
                        if (!selectedConversation) return
                        
                        setAssigning(true)
                        try {
                          const res = await fetch(`/api/inbox/conversations/${selectedConversation.id}/assign`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              assignedToAI: value === 'ai',
                              assignedUserId: value === 'ai' ? null : parseInt(value),
                            }),
                          })
                          
                          const data = await res.json()
                          if (res.ok) {
                            setSuccess(data.message || value === 'ai' ? 'Switched to AI mode' : 'Switched to User mode')
                            setError(null)
                            // Reload conversations to get updated assignment
                            await loadConversations()
                            // Reload selected conversation to get updated assignment
                            const convRes = await fetch(`/api/inbox/conversations/${selectedConversation.id}`)
                            if (convRes.ok) {
                              const convData = await convRes.json()
                              if (convData.ok && convData.conversation) {
                                // Map the conversation response to match the Conversation type
                                const updatedConv: Conversation = {
                                  id: convData.conversation.id,
                                  contact: convData.conversation.contact,
                                  channel: convData.conversation.channel,
                                  status: convData.conversation.status,
                                  lastMessageAt: convData.conversation.lastMessageAt,
                                  lastInboundAt: convData.conversation.lastInboundAt || null,
                                  unreadCount: convData.conversation.unreadCount || 0,
                                  lastMessage: convData.conversation.lastMessage,
                                  createdAt: convData.conversation.createdAt,
                                  assignedUser: convData.conversation.assignedUser || null,
                                }
                                setSelectedConversation(updatedConv)
                                // Also update in conversations list
                                setConversations(prev => prev.map(c => 
                                  c.id === selectedConversation.id ? updatedConv : c
                                ))
                              }
                            }
                          } else {
                            setError(data.error || 'Failed to switch mode')
                            setSuccess(null)
                          }
                        } catch (err: any) {
                          setError('Failed to switch mode')
                        } finally {
                          setAssigning(false)
                        }
                      }}
                      disabled={assigning}
                      className="h-8 text-caption min-w-[120px]"
                    >
                      <option value="ai">🤖 AI</option>
                      {user && (
                        <option value={user.id.toString()}>
                          👤 {user.name} (Me)
                        </option>
                      )}
                      {user?.role === 'ADMIN' && users.filter(u => u.id !== user?.id).map((u) => (
                        <option key={u.id} value={u.id.toString()}>
                          👤 {u.name}
                        </option>
                      ))}
                    </Select>
                    {selectedLead && (
                    <Link href={`/leads/${selectedLead.id}`} target="_blank">
                      <Button variant="outline" size="sm" className="gap-1.5 text-caption">
                        <Eye className="h-3.5 w-3.5" />
                        View Lead
                      </Button>
                    </Link>
                    )}
                    {user?.role === 'ADMIN' && selectedConversation && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 text-caption text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={async () => {
                          if (!confirm('⚠️ Delete this conversation and all messages? This action cannot be undone. This is for testing purposes only.')) {
                            return
                          }
                          try {
                            setDeleting(true)
                            setError(null)
                            const res = await fetch(`/api/admin/conversations/${selectedConversation.id}/delete`, {
                              method: 'DELETE',
                              credentials: 'include',
                            })
                            const data = await res.json()
                            if (data.ok) {
                              setSuccess(`Deleted conversation and ${data.deletedMessages} messages`)
                              setSelectedConversation(null)
                              setMessages([])
                              await loadConversations()
                            } else {
                              setError(data.error || 'Failed to delete conversation')
                            }
                          } catch (err: any) {
                            setError('Failed to delete conversation')
                          } finally {
                            setDeleting(false)
                          }
                        }}
                        disabled={deleting}
                      >
                        {deleting ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                        Delete Chat
                      </Button>
                    )}
                  </div>
              </div>

              {/* Error/Success Messages */}
              {error && (
                <div className="mx-4 mt-4 p-3 bg-red-50 border border-red-200/60 rounded-xl">
                  <div className="flex items-start gap-2">
                    <XCircle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
                    <p className="text-body text-red-700 whitespace-pre-line">
                      {error}
                    </p>
                  </div>
                </div>
              )}

              {success && (
                <div className="mx-4 mt-4 p-3 bg-green-50 border border-green-200/60 rounded-xl">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                    <p className="text-body text-green-700">{success}</p>
                  </div>
                </div>
              )}

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {loadingMessages && messages.length === 0 ? (
                  <div className="space-y-3">
                    <div className="flex justify-start">
                      <Skeleton className="h-12 w-2/3 rounded-2xl" />
                    </div>
                    <div className="flex justify-end">
                      <Skeleton className="h-12 w-2/3 rounded-2xl" />
                    </div>
                    <div className="flex justify-start">
                      <Skeleton className="h-12 w-1/2 rounded-2xl" />
                    </div>
                  </div>
                ) : (
                  messages.map((msg, index) => {
                    // #region agent log
                    fetch('http://127.0.0.1:7242/ingest/a9581599-2981-434f-a784-3293e02077df',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'inbox/page.tsx:867',message:'Message rendering entry',data:{messageId:msg.id,type:msg.type,mediaUrl:msg.mediaUrl,mediaMimeType:msg.mediaMimeType,hasAttachments:!!(msg.attachments&&msg.attachments.length>0),attachmentsCount:msg.attachments?.length||0,body:msg.body?.substring(0,50)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
                    // #endregion
                    const isInbound = msg.direction === 'inbound' || msg.direction === 'INBOUND' || msg.direction === 'IN'
                    return (
                      <div
                        key={msg.id}
                        className={cn(
                          'flex animate-in fade-in slide-in-from-bottom-2 duration-300 mb-4',
                          isInbound ? 'justify-start' : 'justify-end'
                        )}
                        style={{ animationDelay: `${index * 50}ms` }}
                      >
                        <div
                          className={cn(
                            'max-w-[75%] text-body',
                            isInbound
                              ? 'message-bubble-inbound rounded-tl-none'
                              : 'message-bubble-outbound rounded-tr-none',
                            'animate-fade-in-up'
                          )}
                          style={{ animationDelay: `${index * 30}ms` }}
                        >
                          {/* CANONICAL: Use hasMedia flag or mediaProxyUrl/providerMediaId from API */}
                          {(() => {
                            // PRIORITY 0: Use canonical hasMedia flag OR mediaProxyUrl OR providerMediaId
                            const shouldRenderMedia = msg.hasMedia || !!msg.mediaProxyUrl || !!msg.providerMediaId
                            
                            if (shouldRenderMedia) {
                              const proxyUrl = msg.mediaProxyUrl || `/api/media/messages/${msg.id}`
                              return (
                                <MediaMessage message={{
                                  id: msg.id,
                                  type: msg.type || 'text',
                                  mediaProxyUrl: proxyUrl,
                                  mediaMimeType: msg.mediaMimeType,
                                  mediaFilename: msg.mediaFilename,
                                  body: msg.body,
                                }} />
                              )
                            }
                            
                            // PRIORITY 1: Check attachments
                            if (msg.attachments && msg.attachments.length > 0) {
                            // PHASE 5A: Render attachments (highest priority)
                              return (
                            <div className="space-y-2">
                              {msg.attachments.map((att: any) => {
                                // PHASE 1 DEBUG: Log each attachment
                                console.log('[INBOX-DEBUG] Rendering attachment', {
                                  attachmentId: att.id,
                                  type: att.type,
                                  url: att.url,
                                  mimeType: att.mimeType,
                                  filename: att.filename,
                                })
                                
                                if (att.type === 'image') {
                                  const imageUrl = att.url.startsWith('http') || att.url.startsWith('/') 
                                    ? att.url 
                                    : `/api/media/messages/${msg.id}` // Use main media proxy endpoint
                                  return (
                                    <div key={att.id} className="relative group rounded-xl overflow-hidden border border-slate-200/60 bg-white">
                                      <img
                                        src={imageUrl}
                                        alt={att.filename || 'Image'}
                                        className="max-w-full h-auto max-h-96 object-contain w-full cursor-pointer hover:opacity-90 transition-opacity"
                                        loading="lazy"
                                        crossOrigin="anonymous"
                                        onError={(e) => {
                                          const target = e.currentTarget
                                          target.onerror = null
                                          target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200"%3E%3Crect fill="%23ddd" width="200" height="200"/%3E%3Ctext fill="%23999" x="50%25" y="50%25" text-anchor="middle" dy=".3em"%3EImage not available%3C/text%3E%3C/svg%3E'
                                        }}
                                      />
                                      <a
                                        href={imageUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity"
                                        title="Open image in new tab"
                                      >
                                        <ImageIcon className="h-8 w-8 text-white" />
                                      </a>
                                    </div>
                                  )
                                } else if (att.type === 'document' || att.type === 'pdf') {
                                  // Use mediaProxyUrl if available, otherwise construct from attachment URL
                                  const docUrl = msg.mediaProxyUrl && msg.hasMedia
                                    ? msg.mediaProxyUrl
                                    : (att.url.startsWith('http') || att.url.startsWith('/')
                                        ? att.url
                                        : `/api/media/messages/${msg.id}`) // Use main media proxy endpoint
                                  return (
                                    <a
                                      key={att.id}
                                      href={docUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="flex items-center gap-2 p-2 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors"
                                      download={att.filename || undefined}
                                    >
                                      <FileText className="h-5 w-5" />
                                      <span className="text-body">{att.filename || 'Document'}</span>
                                    </a>
                                  )
                                } else if (att.type === 'audio') {
                                  // Use mediaProxyUrl if available, otherwise construct from attachment URL
                                  const audioUrl = msg.mediaProxyUrl && msg.hasMedia
                                    ? msg.mediaProxyUrl
                                    : (att.url.startsWith('http') || att.url.startsWith('/')
                                        ? att.url
                                        : `/api/media/messages/${msg.id}`) // Use main media proxy endpoint
                                  return (
                                    <div key={att.id} className="bg-white rounded-xl p-3 border border-slate-200/60">
                                      <AudioMessagePlayer
                                        mediaId={audioUrl}
                                        mimeType={att.mimeType}
                                        messageId={msg.id}
                                        className="w-full"
                                      />
                                    </div>
                                  )
                                } else {
                                  const fileUrl = att.url.startsWith('http') || att.url.startsWith('/')
                                    ? att.url
                                    : `/api/media/messages/${msg.id}` // Use main media proxy endpoint
                                  return (
                                    <a
                                      key={att.id}
                                      href={fileUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="flex items-center gap-2 p-2 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors"
                                      download={att.filename || undefined}
                                    >
                                      <FileText className="h-5 w-5" />
                                      <span className="text-body">{att.filename || 'File'}</span>
                                    </a>
                                  )
                                }
                              })}
                              {/* Show body text if present */}
                              {msg.body && msg.body !== '[audio]' && msg.body !== '[Audio received]' && msg.body !== '[image]' && msg.body !== '[document]' && (() => {
                                const isNonEnglish = isInbound && detectLanguage(msg.body) === 'non-en'
                                const hasTranslation = translations[msg.id]
                                const isTranslating = translating[msg.id]
                                
                                return (
                                  <div className="space-y-2 mt-2">
                                    <p className="text-body whitespace-pre-wrap break-words">{msg.body}</p>
                                    {/* Translation button for inbound non-English messages */}
                                    {isInbound && (isNonEnglish || true) && (
                                      <div className="flex items-center gap-2">
                                        <button
                                          type="button"
                                          onClick={() => handleTranslate(msg.id, msg.body || '')}
                                          disabled={isTranslating}
                                          className="text-caption text-slate-600 hover:text-slate-900 hover:underline transition-colors flex items-center gap-1"
                                        >
                                          {isTranslating ? (
                                            <>
                                              <Loader2 className="h-3 w-3 animate-spin" />
                                              Translating...
                                            </>
                                          ) : hasTranslation ? (
                                            hasTranslation.showing ? 'Hide translation' : 'Show translation'
                                          ) : (
                                            <>
                                              <Languages className="h-3 w-3" />
                                              Translate
                                            </>
                                          )}
                                        </button>
                                      </div>
                                    )}
                                    {/* Translation display */}
                                    {hasTranslation && hasTranslation.showing && (
                                      <div className="p-2 bg-slate-100 rounded-lg border border-slate-200/60">
                                        <p className="text-caption text-slate-600 mb-1 font-semibold">Translation:</p>
                                        <p className="text-body whitespace-pre-wrap break-words text-slate-900">
                                          {hasTranslation.text}
                                        </p>
                                      </div>
                                    )}
                                  </div>
                                )
                              })()}
                            </div>
                              )
                            }
                            
                            // SIMPLIFIED: Use MediaMessage component for all media types
                            // This provides consistent error handling, loading states, and retry functionality
                            
                            // Use centralized media detection logic
                            const hasMediaResult = hasMedia(msg.type, msg.mediaMimeType)
                            
                            // Check if message has media URL or proxy URL (indicates media message)
                            const hasMediaUrl = !!(msg.mediaUrl || msg.mediaProxyUrl)
                            
                            // Check body for media placeholders
                            const hasMediaPlaceholder = msg.body && /\[(audio|image|video|document|Audio received)\]/i.test(msg.body)
                            
                            // CRITICAL FIX: ALWAYS try to render MediaMessage for media types
                            // The proxy will attempt recovery from rawPayload/payload/ExternalEventLog
                            // Only show error if proxy returns 424 after all recovery attempts
                            // FIX: Also check if type is a media type directly (in case hasMedia fails)
                            const isMediaTypeDirect = msg.type && MEDIA_TYPES.has(msg.type.toLowerCase())
                            
                            // CRITICAL: If there's a media placeholder in body, ALWAYS try to render MediaMessage
                            // This ensures we attempt recovery even if type/mediaUrl are missing
                            if (hasMediaResult || isMediaTypeDirect || msg.mediaProxyUrl || hasMediaPlaceholder) {
                              // Determine message type from MIME type if type field is missing/incorrect
                              const inferredType = detectMediaType(msg.type, msg.mediaMimeType)
                              
                              return (
                                <div className="space-y-2">
                                  <MediaMessage
                                    message={{
                                      id: msg.id,
                                      type: msg.type || inferredType,
                                      mediaProxyUrl: msg.mediaProxyUrl || `/api/media/messages/${msg.id}`,
                                      mediaMimeType: msg.mediaMimeType,
                                      mediaFilename: (msg as any).mediaFilename,
                                      body: msg.body,
                                    }}
                                  />
                                  {msg.body && !['[audio]', '[Audio received]', '[image]', '[video]', '[document:', '[document: file]'].some(placeholder => msg.body?.includes(placeholder)) && (() => {
                                    const isNonEnglish = isInbound && detectLanguage(msg.body) === 'non-en'
                                    const hasTranslation = translations[msg.id]
                                    const isTranslating = translating[msg.id]
                                    
                                    return (
                                      <div className="space-y-2">
                                        <p className="text-body whitespace-pre-wrap break-words">{msg.body}</p>
                                        {/* Translation button for inbound non-English messages */}
                                        {isInbound && (isNonEnglish || true) && (
                                          <div className="flex items-center gap-2 mt-1">
                                            <button
                                              type="button"
                                              onClick={() => handleTranslate(msg.id, msg.body || '')}
                                              disabled={isTranslating}
                                              className="text-caption text-slate-600 hover:text-slate-900 hover:underline transition-colors flex items-center gap-1"
                                            >
                                              {isTranslating ? (
                                                <>
                                                  <Loader2 className="h-3 w-3 animate-spin" />
                                                  Translating...
                                                </>
                                              ) : hasTranslation ? (
                                                hasTranslation.showing ? 'Hide translation' : 'Show translation'
                                              ) : (
                                                <>
                                                  <Languages className="h-3 w-3" />
                                                  Translate
                                                </>
                                              )}
                                            </button>
                                          </div>
                                        )}
                                        {/* Translation display */}
                                        {hasTranslation && hasTranslation.showing && (
                                          <div className="mt-2 p-2 bg-slate-100 rounded-lg border border-slate-200/60">
                                            <p className="text-xs text-slate-600 mb-1 font-semibold">Translation:</p>
                                            <p className="text-sm whitespace-pre-wrap break-words text-slate-900 font-medium">
                                              {hasTranslation.text}
                                            </p>
                                          </div>
                                        )}
                                      </div>
                                    )
                                  })()}
                                  </div>
                                )
                            }
                            
                            // PART 2: Extract message text from various fields
                            const displayText = getMessageDisplayText(msg)
                            const bodyLower = displayText?.toLowerCase() || ''
                            
                            // #region agent log
                            fetch('http://127.0.0.1:7242/ingest/a9581599-2981-434f-a784-3293e02077df',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'inbox/page.tsx:1300',message:'Fallback text rendering',data:{messageId:msg.id,type:msg.type,mediaUrl:msg.mediaUrl,mediaMimeType:msg.mediaMimeType,hasAttachments:!!(msg.attachments&&msg.attachments.length>0),body:msg.body,bodyLower:bodyLower.substring(0,50)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H'})}).catch(()=>{});
                            // #endregion
                            
                            if (displayText && typeof displayText === 'string' && displayText.trim() !== '') {
                              // Skip if body looks like a media placeholder (already handled by placeholder check above)
                              if (bodyLower.match(/^\[(audio|document|image|video|media)/i)) {
                                return <p className="text-body opacity-75">[Media message]</p>
                              }
                              
                              // For inbound messages, add translation support
                              const isNonEnglish = isInbound && detectLanguage(displayText) === 'non-en'
                              const hasTranslation = translations[msg.id]
                              const isTranslating = translating[msg.id]
                              
                              return (
                                <div className="space-y-2">
                                  <p className="text-body whitespace-pre-wrap break-words">{displayText}</p>
                                  {/* Translation button for inbound non-English messages */}
                                  {isInbound && (isNonEnglish || true) && (
                                    <div className="flex items-center gap-2 mt-1">
                                      <button
                                        type="button"
                                        onClick={() => handleTranslate(msg.id, displayText)}
                                        disabled={isTranslating}
                                        className="text-xs text-slate-600 hover:text-slate-900 hover:underline transition-colors flex items-center gap-1 font-medium"
                                      >
                                        {isTranslating ? (
                                          <>
                                            <Loader2 className="h-3 w-3 animate-spin" />
                                            Translating...
                                          </>
                                        ) : hasTranslation ? (
                                          hasTranslation.showing ? 'Hide translation' : 'Show translation'
                                        ) : (
                                          <>
                                            <Languages className="h-3 w-3" />
                                            Translate
                                          </>
                                        )}
                                      </button>
                                    </div>
                                  )}
                                  {/* Translation display */}
                                  {hasTranslation && hasTranslation.showing && (
                                    <div className="mt-2 p-2 bg-slate-100 rounded-lg border border-slate-200/60">
                                      <p className="text-xs text-slate-600 mb-1 font-semibold">Translation:</p>
                                      <p className="text-sm whitespace-pre-wrap break-words text-slate-900 font-medium">
                                        {hasTranslation.text}
                                      </p>
                                    </div>
                                  )}
                                </div>
                              )
                            }
                            return <p className="text-sm opacity-75">[Media message]</p>
                          })()}
                          {/* #region agent log */}
                          {(() => {
                            const iifeResult = (() => {
                              const bodyHasDocumentPattern = msg.body?.match(/\[document:\s*(.+?)\]/i)
                              const bodyHasImagePattern = msg.body?.match(/\[image\]/i)
                              const bodyHasAudioPattern = msg.body?.match(/\[(audio|Audio received)\]/i)
                              const bodyHasVideoPattern = msg.body?.match(/\[video\]/i)
                              const hasMediaPlaceholder = !!(bodyHasDocumentPattern || bodyHasImagePattern || bodyHasAudioPattern || bodyHasVideoPattern)
                              if (hasMediaPlaceholder && !msg.mediaUrl && (!msg.attachments || msg.attachments.length === 0)) {
                                return 'HAS_PLACEHOLDER_JSX'
                              }
                              return 'NO_PLACEHOLDER'
                            })()
                            if (iifeResult === 'HAS_PLACEHOLDER_JSX') {
                              fetch('http://127.0.0.1:7242/ingest/a9581599-2981-434f-a784-3293e02077df',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'inbox/page.tsx:1336',message:'IIFE should have returned placeholder JSX',data:{messageId:msg.id,body:msg.body?.substring(0,50)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'AY'})}).catch(()=>{});
                            }
                            return null
                          })()}
                          {/* #endregion */}
                          <div className="flex items-center gap-1 mt-1">
                            <p
                              className={cn(
                                'text-caption',
                                isInbound
                                  ? 'text-slate-600'
                                  : 'text-white/80'
                              )}
                            >
                              {formatMessageTime(msg.createdAt)}
                            </p>
                            {!isInbound && (
                              <div 
                                className="flex items-center" 
                                title={
                                  msg.status === 'READ' ? 'Read' :
                                  msg.status === 'DELIVERED' ? 'Delivered' :
                                  msg.status === 'SENT' ? 'Sent' :
                                  msg.status === 'FAILED' ? 'Failed' : 'Pending'
                                }
                              >
                                {msg.status === 'READ' ? (
                                  <CheckCheck className="h-3 w-3 text-blue-500" />
                                ) : msg.status === 'DELIVERED' ? (
                                  <CheckCheck className="h-3 w-3 text-gray-400" />
                                ) : msg.status === 'SENT' ? (
                                  <CheckCircle2 className="h-3 w-3 text-gray-400" />
                                ) : msg.status === 'FAILED' ? (
                                  <XCircle className="h-3 w-3 text-red-500" />
                                ) : (
                                  <Clock className="h-3 w-3 text-gray-400" />
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Message Input */}
              <div className="border-t border-slate-200/60 bg-white p-4">
                {instagramSendDisabled && (
                  <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    Instagram messaging window closed. You can reply within 24 hours of the last inbound message.
                    {preferredPhone && (
                      <span className="ml-1">
                        Use WhatsApp instead: {preferredPhone}
                      </span>
                    )}
                  </div>
                )}
                {/* File Preview */}
                {selectedFile && (
                  <div className="mb-3 p-3 bg-slate-50 rounded-xl flex items-center justify-between">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <Paperclip className="h-4 w-4 text-slate-600 flex-shrink-0" />
                      <span className="text-body text-slate-900 truncate">
                        {selectedFile.name}
                      </span>
                      <span className="text-caption text-slate-600">
                        ({(selectedFile.size / 1024).toFixed(1)} KB)
                      </span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelectedFile(null)
                        if (fileInputRef.current) {
                          fileInputRef.current.value = ''
                        }
                      }}
                      className="h-6 w-6 p-0"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}

                {/* Upload Progress */}
                {uploading && uploadProgress > 0 && (
                  <div className="mb-3">
                    <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-slate-900 transition-all duration-300"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                    <p className="text-caption text-slate-600 mt-1">
                      Uploading... {uploadProgress}%
                    </p>
                  </div>
                )}

                <form onSubmit={handleSendMessage} className="flex gap-2 items-end">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"
                    onChange={handleFileSelect}
                    className="hidden"
                    disabled={sending || uploading || instagramSendDisabled}
                  />
                  
                  <Button
                    type="button"
                    variant="outline"
                    size="default"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={sending || uploading || instagramSendDisabled}
                    className="h-[44px] px-3"
                    title="Attach file"
                  >
                    <Paperclip className="h-4 w-4" />
                  </Button>

                  <Textarea
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder={selectedFile ? "Add a caption (optional)..." : "Type your message..."}
                    className="flex-1 min-h-[44px] max-h-32 text-body resize-none"
                    disabled={sending || uploading || instagramSendDisabled}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        if ((newMessage.trim() || selectedFile) && !sending && !uploading && !instagramSendDisabled) {
                          handleSendMessage(e as any)
                        }
                      }
                    }}
                    rows={1}
                  />
                  {/* Templates button - only show for WhatsApp channel */}
                  {selectedConversation?.channel?.toLowerCase() === 'whatsapp' && (
                    <Button
                      type="button"
                      variant="outline"
                      size="default"
                      onClick={async () => {
                        await loadTemplates()
                        setShowTemplateModal(true)
                      }}
                      disabled={sending || uploading || instagramSendDisabled}
                      className="h-[44px] px-3"
                      title="Send template message"
                    >
                      <Sparkles className="h-4 w-4" />
                    </Button>
                  )}
                  <Button 
                    type="submit" 
                    disabled={(!newMessage.trim() && !selectedFile) || sending || uploading || instagramSendDisabled} 
                    size="default"
                    className="gap-2 h-[44px] px-4"
                  >
                    {(sending || uploading) ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    <span className="hidden sm:inline">Send</span>
                  </Button>
                </form>
                <p className="text-caption text-slate-600 mt-2">
                  {selectedFile 
                    ? 'File ready to send. Add a caption or click Send.'
                    : 'Press Enter to send, Shift+Enter for new line, or attach a file'}
                </p>
              </div>
            </>
          ) : (
            <EmptyState
              icon={MessageCircle}
              title="Select a conversation"
              description="Choose a conversation from the sidebar to view messages."
              className="flex-1"
            />
          )}
        </BentoCard>
      </div>
      
      {/* Template Modal */}
      <Dialog open={showTemplateModal} onOpenChange={setShowTemplateModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Send WhatsApp Template</DialogTitle>
            <DialogDescription>
              {requiresTemplate 
                ? 'WhatsApp requires a template message outside the 24-hour window.'
                : 'Select a template to send. Templates can be sent at any time.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            {/* Error Message */}
            {templateError && (
              <div className="p-3 border border-red-300/60 bg-red-50 rounded-lg text-body text-red-700">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="font-semibold">Error loading templates</p>
                    <p className="mt-1">{templateError}</p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadTemplates}
                  className="mt-2"
                  disabled={loadingTemplates}
                >
                  {loadingTemplates ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin mr-1" />
                      Refreshing...
                    </>
                  ) : (
                    'Refresh'
                  )}
                </Button>
              </div>
            )}

            {/* Template Selection */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label htmlFor="template-select">Template</Label>
                {!loadingTemplates && !templateError && (
                  <button
                    type="button"
                    onClick={loadTemplates}
                    className="text-xs text-blue-600 hover:text-blue-700 hover:underline font-medium"
                  >
                    Refresh
                  </button>
                )}
              </div>
              {loadingTemplates ? (
                <div className="mt-2 p-4 border rounded-lg">
                  <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                  Loading templates...
                </div>
              ) : templateError && templates.length === 0 ? (
                <div className="mt-2 p-4 border rounded-lg text-sm text-muted-foreground">
                  Unable to load templates. Check the error message above.
                </div>
              ) : templates.length === 0 ? (
                <div className="mt-2 p-4 border rounded-lg text-sm text-muted-foreground">
                  No approved templates returned from this WABA.
                </div>
              ) : (
                <Select
                  id="template-select"
                  value={selectedTemplate ? `${selectedTemplate.name}|${selectedTemplate.language}` : ''}
                  onChange={(e) => {
                    const [name, language] = e.target.value.split('|')
                    const template = templates.find(t => t.name === name && t.language === language)
                    if (template) {
                      setSelectedTemplate(template)
                      // Extract body component to count variables
                      const bodyComponent = template.components?.find((c: any) => c.type === 'body')
                      let variableCount = 0
                      if (bodyComponent) {
                        // Check text field for {{1}}, {{2}}, etc.
                        const text = bodyComponent.text || ''
                        const matches = text.match(/\{\{(\d+)\}\}/g) || []
                        // Get unique variable numbers and find max
                        const variableNumbers = matches.map((m: string) => parseInt(m.replace(/[{}]/g, '')))
                        variableCount = variableNumbers.length > 0 ? Math.max(...variableNumbers) : 0
                      }
                      setTemplateVariables(new Array(variableCount).fill(''))
                    }
                  }}
                  className="mt-2"
                >
                  <option value="">Select a template...</option>
                  {templates.map((template, idx) => (
                    <option key={idx} value={`${template.name}|${template.language}`}>
                      {template.name} ({template.language}) - {template.category}
                    </option>
                  ))}
                </Select>
              )}
            </div>

            {/* Template Variables */}
            {selectedTemplate && templateVariables.length > 0 && (
              <div className="space-y-2">
                <Label>Template Variables</Label>
                {templateVariables.map((value, idx) => (
                  <div key={idx}>
                    <Label htmlFor={`var-${idx}`} className="text-xs text-muted-foreground">
                      Variable {idx + 1}
                    </Label>
                    <Input
                      id={`var-${idx}`}
                      value={value}
                      onChange={(e) => {
                        const newVars = [...templateVariables]
                        newVars[idx] = e.target.value
                        setTemplateVariables(newVars)
                      }}
                      placeholder={`Enter value for variable ${idx + 1}`}
                      className="mt-1"
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 justify-end pt-4 border-t">
              <Button
                variant="outline"
                onClick={() => {
                  setShowTemplateModal(false)
                  setSelectedTemplate(null)
                  setTemplateVariables([])
                  setRequiresTemplate(false)
                }}
                disabled={sendingTemplate}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSendTemplate}
                disabled={!selectedTemplate || sendingTemplate}
              >
                {sendingTemplate ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Sending...
                  </>
                ) : (
                  'Send Template'
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* STEP 0: Build stamp for deployment verification */}
      {buildInfo && (
        <div className="fixed bottom-2 right-2 text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded z-50 font-medium border border-slate-200/60 shadow-sm">
          Build: {buildInfo.buildId || 'unknown'}
        </div>
      )}
    </MainLayout>
  )
}

export default function InboxPage() {
  return (
    <Suspense fallback={
      <MainLayout>
        <div className="flex items-center justify-center h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading inbox...</p>
          </div>
        </div>
      </MainLayout>
    }>
      <InboxPageContent />
    </Suspense>
  )
}
