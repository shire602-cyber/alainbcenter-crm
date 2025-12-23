'use client'

import { useEffect, useState, useRef, FormEvent } from 'react'
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
} from 'lucide-react'
import { format, isToday, isYesterday, differenceInDays, parseISO } from 'date-fns'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { AudioMessagePlayer } from '@/components/inbox/AudioMessagePlayer'
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

export default function InboxPage() {
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

  // Auto-refresh: Poll for new messages every 3 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      // Refresh conversations list
      loadConversations()
      
      // Refresh messages if a conversation is selected
      if (selectedConversation) {
        loadMessages(selectedConversation.id)
      }
    }, 3000) // Poll every 3 seconds

    return () => clearInterval(interval)
  }, [selectedConversation, activeChannel])

  async function loadMessages(conversationId: number) {
    try {
      setLoadingMessages(true)
      setError(null)

      await fetch(`/api/inbox/conversations/${conversationId}/read`, {
        method: 'POST',
      })

      const res = await fetch(`/api/inbox/conversations/${conversationId}`)
      const data = await res.json()

      if (data.ok && data.conversation) {
        setMessages(data.conversation.messages || [])
        setSelectedLead(data.conversation.lead)
        setConversations((prev) =>
          prev.map((c) =>
            c.id === conversationId
              ? { ...c, unreadCount: 0, lastMessage: data.conversation.lastMessage }
              : c
          )
        )
      } else {
        setError(data.error || 'Failed to load messages')
      }
    } catch (err: any) {
      setError('Failed to load messages')
      console.error(err)
    } finally {
      setLoadingMessages(false)
    }
  }

  async function handleSelectConversation(conversation: Conversation) {
    setSelectedConversation(conversation)
    await loadMessages(conversation.id)
  }

  async function handleSendMessage(e: FormEvent) {
    e.preventDefault()
    if (!selectedConversation || !newMessage.trim()) return

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
                      <Avatar fallback={conv.contact.fullName || conv.contact.phone} size="sm" />
                        <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <p className="font-medium text-xs truncate text-slate-900 dark:text-slate-100">
                              {conv.contact.fullName || conv.contact.phone}
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
                      {selectedConversation.contact.fullName || selectedConversation.contact.phone}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                            {selectedConversation.contact.phone}
                    </p>
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
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {loadingMessages ? (
                  <div className="space-y-2">
                    <div className="flex justify-start">
                      <Skeleton className="h-10 w-2/3 rounded-lg" />
                    </div>
                    <div className="flex justify-end">
                      <Skeleton className="h-10 w-2/3 rounded-lg" />
                  </div>
                  </div>
                ) : (
                  messages.map((msg) => {
                    const isInbound = msg.direction === 'inbound'
                    return (
                      <div
                        key={msg.id}
                        className={cn(
                          'flex',
                          isInbound ? 'justify-start' : 'justify-end'
                        )}
                      >
                        <div
                          className={cn(
                            'max-w-[75%] p-3 rounded-2xl text-sm shadow-sm transition-all hover:shadow-md',
                            isInbound
                              ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700'
                              : 'bg-primary text-primary-foreground ml-auto'
                          )}
                        >
                          {msg.type === 'text' ? (
                            <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">
                              {msg.body || '[No content]'}
                            </p>
                          ) : msg.type === 'audio' && msg.mediaUrl ? (
                            <div className="space-y-2">
                              <AudioMessagePlayer
                                mediaId={msg.mediaUrl}
                                mimeType={msg.mediaMimeType}
                                messageId={msg.id}
                                className="w-full"
                              />
                              {msg.body && msg.body !== '[audio]' && (
                                <p className="text-sm whitespace-pre-wrap break-words mt-2">{msg.body}</p>
                              )}
                            </div>
                          ) : msg.type === 'image' && msg.mediaUrl ? (
                            <div className="space-y-2">
                              <div className="relative group">
                                <img
                                  src={`/api/whatsapp/media/${msg.mediaUrl}?messageId=${msg.id}`}
                                  alt={msg.body || 'Image'}
                                  className="max-w-full h-auto rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                                  onError={(e) => {
                                    e.currentTarget.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200"%3E%3Crect fill="%23ddd" width="200" height="200"/%3E%3Ctext fill="%23999" x="50%25" y="50%25" text-anchor="middle" dy=".3em"%3EImage not available%3C/text%3E%3C/svg%3E'
                                  }}
                                />
                                <a
                                  href={`/api/whatsapp/media/${msg.mediaUrl}?messageId=${msg.id}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg"
                                >
                                  <ImageIcon className="h-6 w-6 text-white" />
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
              <div className="border-t border-slate-200 dark:border-slate-800 p-3">
                <form onSubmit={handleSendMessage} className="flex gap-2">
                  <Input
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Type your message..."
                    className="flex-1 h-9 text-sm"
                    disabled={sending}
                  />
                  <Button type="submit" disabled={!newMessage.trim() || sending} size="sm" className="gap-1.5">
                    {sending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Send className="h-3.5 w-3.5" />
                    )}
                    Send
                  </Button>
                </form>
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
