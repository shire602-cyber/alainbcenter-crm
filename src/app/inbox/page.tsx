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
} from 'lucide-react'
import { format, isToday, isYesterday, differenceInDays, parseISO } from 'date-fns'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { AudioMessagePlayer } from '@/components/inbox/AudioMessagePlayer'

type Contact = {
  id: number
  fullName: string
  phone: string
  email?: string | null
}

type Conversation = {
  id: number
  contact: Contact
  channel: string
  status: string
  lastMessageAt: string
  unreadCount: number
  lastMessage: {
    id: number
    direction: string
    body: string
    createdAt: string
  } | null
  createdAt: string
}

type Message = {
  id: number
  direction: string
  channel: string
  type: string
  body: string | null
  mediaUrl: string | null
  mediaMimeType: string | null
  status: string
  providerMessageId: string | null
  sentAt: string | null
  createdBy: {
    id: number
    name: string
    email: string
  } | null
  createdAt: string
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

function InboxPageContent() {
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
  const fileInputRef = useRef<HTMLInputElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  async function loadConversations() {
    try {
      setLoading(true)
      const channelParam = activeChannel === 'all' ? 'channel=all' : `channel=${activeChannel}`
      const res = await fetch(`/api/inbox/conversations?${channelParam}`)
      const data = await res.json()

      if (data.ok) {
        setConversations(data.conversations || [])
      } else {
        setError(data.error || 'Failed to load conversations')
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
  }, [activeChannel])

  // Auto-refresh: Poll for new messages every 3 seconds (silent background refresh)
  useEffect(() => {
    const interval = setInterval(() => {
      // Silent background refresh - don't show loading states
      const channelParam = activeChannel === 'all' ? 'channel=all' : `channel=${activeChannel}`
      fetch(`/api/inbox/conversations?${channelParam}`)
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
  }, [selectedConversation, activeChannel])

  async function loadMessages(conversationId: number, silent: boolean = false) {
    try {
      if (!silent) setLoadingMessages(true)
      setError(null)

      await fetch(`/api/inbox/conversations/${conversationId}/read`, {
        method: 'POST',
      })

      const res = await fetch(`/api/inbox/conversations/${conversationId}`)
      const data = await res.json()

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

  async function handleSendMessage(e: FormEvent) {
    e.preventDefault()
    if (!selectedConversation) return

    // If file is selected, upload it instead
    if (selectedFile) {
      await handleUploadFile()
      return
    }

    if (!newMessage.trim()) return

    setSending(true)
    setError(null)
    setSuccess(null)

    try {
      const res = await fetch(`/api/inbox/conversations/${selectedConversation.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: newMessage.trim() }),
      })

      const data = await res.json()

      if (data.ok) {
        setSuccess('Message sent successfully!')
        setNewMessage('')
        await loadMessages(selectedConversation.id)
        await loadConversations()
      } else {
        setError(data.error || 'Failed to send message')
        if (data.hint) {
          setError(`${data.error}\n💡 ${data.hint}`)
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
        return Facebook
      case 'email':
        return Mail
      case 'webchat':
        return Globe
      default:
        return MessageCircle
    }
  }

  const filteredConversations = conversations.filter((conv) => {
    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    return (
      conv.contact.fullName.toLowerCase().includes(query) ||
      conv.contact.phone.includes(query) ||
      conv.lastMessage?.body.toLowerCase().includes(query)
    )
  })

  return (
    <MainLayout>
      <div className="flex h-[calc(100vh-4rem)] gap-2">
        {/* Left Panel: Conversation List - Compact */}
        <BentoCard className="w-80 flex-shrink-0 rounded-none border-r flex flex-col p-0 overflow-hidden">
          {/* Header */}
          <div className="p-3 border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2 mb-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                <InboxIcon className="h-4 w-4 text-primary" />
              </div>
              <h1 className="text-lg font-semibold tracking-tight">Inbox</h1>
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
                      className="flex flex-col h-auto py-1.5 text-xs"
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
          <div className="p-3 border-b border-slate-200 dark:border-slate-800">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <Input
                placeholder="Search conversations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-8 text-xs"
              />
            </div>
          </div>

          {/* Conversation List */}
          <div className="flex-1 overflow-y-auto p-2">
            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-16 w-full rounded-lg" />
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
                        'flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-all hover:bg-slate-100 dark:hover:bg-slate-800/50',
                        selectedConversation?.id === conv.id && 'bg-primary/5 border border-primary/20'
                      )}
                      onClick={() => handleSelectConversation(conv)}
                    >
                      <Avatar fallback={conv.contact.fullName && !conv.contact.fullName.includes('Unknown') ? conv.contact.fullName : conv.contact.phone} size="sm" />
                        <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <p className="font-medium text-xs truncate text-slate-900 dark:text-slate-100">
                              {conv.contact.fullName && !conv.contact.fullName.includes('Unknown') 
                                ? conv.contact.fullName 
                                : conv.contact.phone}
                            </p>
                          <div className="flex items-center gap-1 shrink-0">
                            <ChannelIcon className="h-3 w-3 text-slate-400" />
                              {conv.unreadCount > 0 && (
                              <Badge className="text-xs h-4 px-1.5">
                                  {conv.unreadCount}
                                </Badge>
                              )}
                            </div>
                          </div>
                        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mt-0.5">
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
        <BentoCard className="flex-1 flex flex-col rounded-none p-0 overflow-hidden">
          {selectedConversation ? (
            <>
              <div className="p-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Avatar fallback={selectedConversation.contact.fullName || selectedConversation.contact.phone} size="md" />
                    <div>
                    <h3 className="text-sm font-semibold tracking-tight">
                      {selectedConversation.contact.fullName && 
                       !selectedConversation.contact.fullName.includes('Unknown') 
                        ? selectedConversation.contact.fullName 
                        : selectedConversation.contact.phone}
                    </h3>
                    {selectedConversation.contact.fullName && 
                     !selectedConversation.contact.fullName.includes('Unknown') && (
                      <p className="text-xs text-slate-500 dark:text-400">
                        {selectedConversation.contact.phone}
                      </p>
                    )}
                    </div>
                  </div>
                  {selectedLead && (
                  <Link href={`/leads/${selectedLead.id}`} target="_blank">
                    <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                      <Eye className="h-3.5 w-3.5" />
                        View Lead
                      </Button>
                    </Link>
                  )}
              </div>

              {/* Error/Success Messages */}
              {error && (
                <div className="mx-4 mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <div className="flex items-start gap-2">
                    <XCircle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-red-700 dark:text-red-300 whitespace-pre-line">
                      {error}
                    </p>
                  </div>
                </div>
              )}

              {success && (
                <div className="mx-4 mt-4 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-green-700 dark:text-green-300">{success}</p>
                  </div>
                </div>
              )}

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
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
                    const isInbound = msg.direction === 'inbound'
                    return (
                      <div
                        key={msg.id}
                        className={cn(
                          'flex animate-in fade-in slide-in-from-bottom-2 duration-300',
                          isInbound ? 'justify-start' : 'justify-end'
                        )}
                        style={{ animationDelay: `${index * 50}ms` }}
                      >
                        <div
                          className={cn(
                            'max-w-[75%] p-4 rounded-2xl text-sm shadow-md transition-all hover:shadow-lg',
                            isInbound
                              ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700'
                              : 'bg-primary text-primary-foreground ml-auto shadow-primary/20'
                          )}
                        >
                          {msg.type === 'text' ? (
                            <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">
                              {msg.body || '[No content]'}
                            </p>
                          ) : msg.type === 'audio' && msg.mediaUrl ? (
                            <div className="space-y-2">
                              <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl p-3 border border-slate-200 dark:border-slate-700">
                                <AudioMessagePlayer
                                  mediaId={msg.mediaUrl}
                                  mimeType={msg.mediaMimeType}
                                  messageId={msg.id}
                                  className="w-full"
                                />
                              </div>
                              {msg.body && msg.body !== '[audio]' && (
                                <p className="text-sm whitespace-pre-wrap break-words mt-2">{msg.body}</p>
                              )}
                            </div>
                          ) : msg.type === 'image' && msg.mediaUrl ? (
                            <div className="space-y-2">
                              <div className="relative group rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
                                <img
                                  src={`/api/whatsapp/media/${encodeURIComponent(msg.mediaUrl)}?messageId=${msg.id}`}
                                  alt={msg.body || 'Image message'}
                                  className="max-w-full h-auto max-h-96 object-contain w-full cursor-pointer hover:opacity-90 transition-opacity"
                                  loading="lazy"
                                  onError={(e) => {
                                    const target = e.currentTarget
                                    target.onerror = null
                                    target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200"%3E%3Crect fill="%23ddd" width="200" height="200"/%3E%3Ctext fill="%23999" x="50%25" y="50%25" text-anchor="middle" dy=".3em"%3EImage not available%3C/text%3E%3C/svg%3E'
                                  }}
                                />
                                <a
                                  href={`/api/whatsapp/media/${encodeURIComponent(msg.mediaUrl)}?messageId=${msg.id}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity"
                                  title="Open image in new tab"
                                >
                                  <ImageIcon className="h-8 w-8 text-white" />
                                </a>
                              </div>
                              {msg.body && msg.body !== '[image]' && (
                                <p className="text-sm whitespace-pre-wrap break-words">{msg.body}</p>
                              )}
                            </div>
                          ) : msg.type === 'video' && msg.mediaUrl ? (
                            <div className="space-y-2">
                              <div className="relative group">
                                <video
                                  src={`/api/whatsapp/media/${msg.mediaUrl}?messageId=${msg.id}`}
                                  controls
                                  className="max-w-full h-auto rounded-lg"
                                  preload="metadata"
                                />
                              </div>
                              {msg.body && msg.body !== '[video]' && (
                                <p className="text-sm whitespace-pre-wrap break-words">{msg.body}</p>
                              )}
                            </div>
                          ) : msg.type === 'document' && msg.mediaUrl ? (
                            <div className="space-y-2">
                              <a
                                href={`/api/whatsapp/media/${msg.mediaUrl}?messageId=${msg.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-2 p-2 bg-slate-100 dark:bg-slate-800 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                              >
                                <FileText className="h-5 w-5" />
                                <span className="text-sm font-medium">{msg.body || 'Document'}</span>
                              </a>
                            </div>
                          ) : msg.mediaUrl ? (
                            <div className="space-y-1">
                              <p className="text-xs opacity-75 flex items-center gap-1">
                                {msg.type === 'location' && <MapPin className="h-3 w-3" />}
                                {msg.body || `[${msg.type}]`}
                              </p>
                            </div>
                          ) : (
                            <p className="text-sm opacity-75">[Media message]</p>
                          )}
                          <div className="flex items-center gap-1 mt-1">
                            <p
                              className={cn(
                                'text-xs',
                                isInbound
                                  ? 'text-slate-500 dark:text-slate-400'
                                  : 'text-primary-foreground/70'
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
              <div className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
                {/* File Preview */}
                {selectedFile && (
                  <div className="mb-3 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg flex items-center justify-between">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <Paperclip className="h-4 w-4 text-slate-500 flex-shrink-0" />
                      <span className="text-sm text-slate-700 dark:text-slate-300 truncate">
                        {selectedFile.name}
                      </span>
                      <span className="text-xs text-slate-500">
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
                    <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all duration-300"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
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
                    disabled={sending || uploading}
                  />
                  
                  <Button
                    type="button"
                    variant="outline"
                    size="default"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={sending || uploading}
                    className="h-[44px] px-3"
                    title="Attach file"
                  >
                    <Paperclip className="h-4 w-4" />
                  </Button>

                  <Textarea
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder={selectedFile ? "Add a caption (optional)..." : "Type your message..."}
                    className="flex-1 min-h-[44px] max-h-32 text-sm resize-none"
                    disabled={sending || uploading}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        if ((newMessage.trim() || selectedFile) && !sending && !uploading) {
                          handleSendMessage(e as any)
                        }
                      }
                    }}
                    rows={1}
                  />
                  <Button 
                    type="submit" 
                    disabled={(!newMessage.trim() && !selectedFile) || sending || uploading} 
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
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
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
