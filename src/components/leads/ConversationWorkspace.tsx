'use client'

/**
 * CONVERSATION WORKSPACE - WHATSAPP-QUALITY OVERHAUL
 * 
 * UX RATIONALE:
 * - Message grouping reduces visual noise (consecutive messages from same sender share avatar)
 * - Airy spacing (py-6, gap-2) makes reading comfortable for 15+ minutes
 * - Skeleton shows within 100ms (not blank space) = perceived speed
 * - Micro-feedback on send (toast + inline "Sent") = confidence
 * - Smart replies as dropdown (not chips) = cleaner, less clutter
 * - Smooth transitions only on state change (150-200ms) = premium feel
 * 
 * This makes replying feel faster than WhatsApp Web through perceived speed improvements.
 */

import { useState, useEffect, useRef, memo, useCallback, useMemo } from 'react'
import { MessageSquare, Send, Sparkles, CheckCircle2, Clock, AlertCircle, ChevronDown, ArrowDown, Image, FileText, Music, Video, Download, X } from 'lucide-react'
import { format, isToday, isYesterday, parseISO } from 'date-fns'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { ReplySuccessBanner } from './ReplySuccessBanner'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/components/ui/toast'
import { useSmartPolling } from '@/hooks/useSmartPolling'
import { LeadHealthStrip } from './LeadHealthStrip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

// PHASE 5A: Extended Message interface with media support
interface MessageAttachment {
  id: number
  type: string // image | document | audio | video
  url: string
  mimeType?: string | null
  filename?: string | null
  sizeBytes?: number | null
  thumbnailUrl?: string | null
  durationSec?: number | null
  createdAt: string
}

interface Message {
  id: number
  direction: 'INBOUND' | 'OUTBOUND'
  body: string | null
  type?: string // text | image | document | audio | video
  createdAt: string
  status?: string
  channel: string
  // PHASE 5A: Media fields from Message model
  mediaUrl?: string | null
  mediaMimeType?: string | null
  providerMessageId?: string | null
  // PHASE 5B: Attachments
  attachments?: MessageAttachment[]
}

interface ConversationWorkspaceProps {
  leadId: number
  lead?: {
    id: number
    stage?: string | null
    serviceType?: {
      name?: string
    } | null
    lastInboundAt?: Date | string | null
    lastOutboundAt?: Date | string | null
    assignedUser?: {
      id: number
      name: string | null
    } | null
  } | null
  channel?: string
  onSend?: (message: string) => Promise<void>
  composerOpen?: boolean
  onComposerChange?: (open: boolean) => void
}

interface MessageGroup {
  direction: 'INBOUND' | 'OUTBOUND'
  messages: Message[]
  date: string
}

// Group consecutive messages from same sender
function groupMessages(messages: Message[]): MessageGroup[] {
  if (messages.length === 0) return []
  
  const groups: MessageGroup[] = []
  let currentGroup: MessageGroup | null = null

  for (const message of messages) {
    const messageDate = format(parseISO(message.createdAt), 'yyyy-MM-dd')
    
    // Start new group if direction changes or date changes
    if (!currentGroup || 
        currentGroup.direction !== message.direction ||
        currentGroup.date !== messageDate) {
      currentGroup = {
        direction: message.direction,
        messages: [message],
        date: messageDate,
      }
      groups.push(currentGroup)
    } else {
      // Add to current group (same sender, same day)
      currentGroup.messages.push(message)
    }
  }

  return groups
}

// PHASE 5C: Media rendering components
function MediaAttachment({ attachment, isOutbound }: { attachment: MessageAttachment; isOutbound: boolean }) {
  const [imageError, setImageError] = useState(false)
  const [showLightbox, setShowLightbox] = useState(false)

  if (attachment.type === 'image') {
    return (
      <>
        <div className="relative group">
          <img
            src={attachment.url}
            alt={attachment.filename || 'Image'}
            className={cn(
              "rounded-lg max-w-[300px] max-h-[300px] object-cover cursor-pointer",
              "hover:opacity-90 transition-opacity"
            )}
            onError={() => setImageError(true)}
            onClick={() => setShowLightbox(true)}
          />
          {imageError && (
            <div className={cn(
              "flex items-center gap-2 p-2 rounded text-xs",
              isOutbound ? "text-primary-foreground/70" : "text-muted-foreground"
            )}>
              <Image className="h-4 w-4" />
              <span>Image unavailable</span>
            </div>
          )}
        </div>
        {showLightbox && (
          <div
            className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
            onClick={() => setShowLightbox(false)}
          >
            <div className="relative max-w-4xl max-h-[90vh]">
              <img
                src={attachment.url}
                alt={attachment.filename || 'Image'}
                className="max-w-full max-h-[90vh] object-contain rounded-lg"
              />
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-4 right-4 bg-black/50 hover:bg-black/70 text-white"
                onClick={() => setShowLightbox(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </>
    )
  }

  if (attachment.type === 'audio') {
    // CRITICAL FIX: Handle WhatsApp media URLs - use proxy endpoint if needed
    let audioUrl = attachment.url
    if (attachment.url && !attachment.url.startsWith('http') && !attachment.url.startsWith('/')) {
      // WhatsApp media ID - use proxy
      audioUrl = `/api/whatsapp/media/${encodeURIComponent(attachment.url)}`
    } else if (attachment.url && (attachment.url.includes('wamid') || attachment.url.includes('media_id'))) {
      // WhatsApp media ID in URL - use proxy
      audioUrl = `/api/whatsapp/media/${encodeURIComponent(attachment.url)}`
    }
    
    return (
      <div className={cn(
        "flex items-center gap-3 p-3 rounded-lg",
        isOutbound ? "bg-primary/20" : "bg-slate-100 dark:bg-slate-800"
      )}>
        <Music className={cn(
          "h-5 w-5 flex-shrink-0",
          isOutbound ? "text-primary-foreground" : "text-slate-600 dark:text-slate-400"
        )} />
        <audio controls className="flex-1 max-w-[250px]" preload="metadata">
          <source src={audioUrl} type={attachment.mimeType || 'audio/mpeg'} />
          <source src={audioUrl} type="audio/ogg" />
          <source src={audioUrl} type="audio/wav" />
          Your browser does not support audio playback.
        </audio>
        {attachment.durationSec && (
          <span className={cn(
            "text-xs",
            isOutbound ? "text-primary-foreground/70" : "text-muted-foreground"
          )}>
            {Math.floor(attachment.durationSec / 60)}:{(attachment.durationSec % 60).toString().padStart(2, '0')}
          </span>
        )}
      </div>
    )
  }

  if (attachment.type === 'document') {
    const isPdf = attachment.mimeType === 'application/pdf'
    const sizeBytes = attachment.sizeBytes
    const fileSize = sizeBytes
      ? sizeBytes < 1024
        ? `${sizeBytes} B`
        : sizeBytes < 1024 * 1024
        ? `${(sizeBytes / 1024).toFixed(1)} KB`
        : `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`
      : null

    return (
      <a
        href={attachment.url}
        download={attachment.filename}
        className={cn(
          "flex items-center gap-3 p-3 rounded-lg border transition-colors",
          isOutbound
            ? "bg-primary/10 border-primary/20 hover:bg-primary/20"
            : "bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700"
        )}
      >
        {isPdf ? (
          <FileText className={cn(
            "h-5 w-5 flex-shrink-0",
            isOutbound ? "text-primary-foreground" : "text-red-600"
          )} />
        ) : (
          <FileText className={cn(
            "h-5 w-5 flex-shrink-0",
            isOutbound ? "text-primary-foreground" : "text-slate-600 dark:text-slate-400"
          )} />
        )}
        <div className="flex-1 min-w-0">
          <div className={cn(
            "text-sm font-medium truncate",
            isOutbound ? "text-primary-foreground" : "text-slate-900 dark:text-slate-100"
          )}>
            {attachment.filename || 'Document'}
          </div>
          {fileSize && (
            <div className={cn(
              "text-xs mt-0.5",
              isOutbound ? "text-primary-foreground/70" : "text-muted-foreground"
            )}>
              {fileSize}
            </div>
          )}
        </div>
        <Download className={cn(
          "h-4 w-4 flex-shrink-0",
          isOutbound ? "text-primary-foreground/70" : "text-muted-foreground"
        )} />
      </a>
    )
  }

  if (attachment.type === 'video') {
    return (
      <div className="relative">
        <video
          src={attachment.url}
          controls
          className="rounded-lg max-w-[300px] max-h-[300px]"
        >
          Your browser does not support video playback.
        </video>
        {attachment.durationSec && (
          <div className={cn(
            "absolute bottom-2 right-2 px-2 py-1 rounded text-xs bg-black/70 text-white",
          )}>
            {Math.floor(attachment.durationSec / 60)}:{(attachment.durationSec % 60).toString().padStart(2, '0')}
          </div>
        )}
      </div>
    )
  }

  return null
}

function MessageBubble({ message, isOutbound, showAvatar, isLastInGroup }: { 
  message: Message
  isOutbound: boolean
  showAvatar: boolean
  isLastInGroup: boolean
}) {
  const isAudio = message.type === 'audio' || message.mediaMimeType?.startsWith('audio/')
  const hasMedia = message.mediaUrl || (message.attachments && message.attachments.length > 0)
  const attachments = message.attachments || []
  
  // If message has mediaUrl but no attachments, create a virtual attachment
  // CRITICAL: Ensure audio messages are properly detected
  const mediaAttachments = message.mediaUrl && attachments.length === 0
    ? [{
        id: message.id,
        type: isAudio ? 'audio' : (message.type || (message.mediaMimeType?.startsWith('image/') ? 'image' : message.mediaMimeType?.startsWith('video/') ? 'video' : 'document')),
        url: message.mediaUrl,
        mimeType: message.mediaMimeType,
        filename: null,
        sizeBytes: null,
        thumbnailUrl: null,
        durationSec: null,
        createdAt: message.createdAt,
      }]
    : attachments
  
  return (
    <div className={cn(
      "flex gap-2",
      isOutbound ? "justify-end" : "justify-start"
    )}>
      {/* Avatar - only show for first message in group or if last in group */}
      {!isOutbound && (
        <div className={cn(
          "flex-shrink-0 w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center transition-opacity duration-200",
          showAvatar ? "opacity-100" : "opacity-0"
        )}>
          <MessageSquare className="h-4 w-4 text-slate-500" />
        </div>
      )}
      
      <div className={cn(
        "max-w-[75%] rounded-2xl px-4 py-3 shadow-soft",
        "transition-all duration-200",
        "leading-relaxed",
        isOutbound
          ? "bg-primary text-primary-foreground"
          : "bg-card border border-subtle"
      )}>
        {/* PHASE 5C: Render media attachments - CRITICAL: Always render if hasMedia */}
        {hasMedia && mediaAttachments.length > 0 && (
          <div className="space-y-2 mb-2">
            {mediaAttachments.map((att) => (
              <MediaAttachment key={att.id} attachment={att} isOutbound={isOutbound} />
            ))}
          </div>
        )}
        
        {/* PHASE 5C: Fallback audio label if mediaUrl exists but attachment rendering failed */}
        {isAudio && hasMedia && mediaAttachments.length === 0 && (
          <div className={cn(
            "mb-2 text-xs font-medium",
            isOutbound ? "text-primary-foreground/80" : "text-muted-foreground"
          )}>
            🎤 Audio Message
          </div>
        )}
        
        {/* Text body - only show if not media-only message */}
        {message.body && message.body !== '[Audio received]' && message.body !== '[audio]' && (
          <p className={cn(
            "text-body leading-relaxed whitespace-pre-wrap break-words",
            isOutbound ? "text-white" : "text-slate-900 dark:text-slate-100"
          )}>
            {message.body}
          </p>
        )}
        
        <div className={cn(
          "flex items-center gap-1.5 mt-1.5 text-meta",
          isOutbound ? "text-primary-foreground/70" : "muted-text"
        )}>
          <span>{format(parseISO(message.createdAt), 'h:mm a')}</span>
          {isOutbound && message.status && (
            <div className="flex items-center">
              {message.status === 'READ' && <CheckCircle2 className="h-3.5 w-3.5 text-blue-400" />}
              {message.status === 'DELIVERED' && <CheckCircle2 className="h-3.5 w-3.5 text-slate-400" />}
              {message.status === 'SENT' && <Clock className="h-3.5 w-3.5 text-slate-400" />}
              {message.status === 'FAILED' && <AlertCircle className="h-3.5 w-3.5 text-red-500" />}
            </div>
          )}
        </div>
      </div>

      {isOutbound && (
        <div className={cn(
          "flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center transition-opacity duration-200",
          showAvatar ? "opacity-100" : "opacity-0"
        )}>
          <MessageSquare className="h-4 w-4 text-primary" />
        </div>
      )}
    </div>
  )
}

function DateSeparator({ date }: { date: string }) {
  const messageDate = parseISO(date)
  let label = ''
  if (isToday(messageDate)) {
    label = 'Today'
  } else if (isYesterday(messageDate)) {
    label = 'Yesterday'
  } else {
    label = format(messageDate, 'EEE MMM d')
  }

  return (
    <div className="flex items-center justify-center my-6">
      <Badge className="pill bg-slate-100 dark:bg-slate-800 border border-subtle px-3 py-1">
        <span className="text-meta muted-text font-medium">{label}</span>
      </Badge>
    </div>
  )
}

export const ConversationWorkspace = memo(function ConversationWorkspace({ 
  leadId,
  lead,
  channel = 'whatsapp', 
  onSend, 
  composerOpen, 
  onComposerChange 
}: ConversationWorkspaceProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [messageText, setMessageText] = useState('')
  const [sending, setSending] = useState(false)
  const [showSuccessBanner, setShowSuccessBanner] = useState(false)
  const [sentSuccess, setSentSuccess] = useState(false)
  const [showScrollButton, setShowScrollButton] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const [smartReplies, setSmartReplies] = useState<string[]>([])
  const [showSmartReplies, setShowSmartReplies] = useState(false)
  const { showToast } = useToast()
  
  // PHASE 5C: Media filter state
  const [mediaFilter, setMediaFilter] = useState<'all' | 'media' | 'docs' | 'audio'>('all')
  
  // PHASE 5C: Filter messages by media type
  const filteredMessages = useMemo(() => {
    if (mediaFilter === 'all') return messages
    return messages.filter((msg) => {
      const hasMedia = msg.mediaUrl || (msg.attachments && msg.attachments.length > 0)
      if (!hasMedia) return false
      
      if (mediaFilter === 'media') {
        return msg.attachments?.some(a => a.type === 'image' || a.type === 'video') || msg.type === 'image' || msg.type === 'video'
      }
      if (mediaFilter === 'docs') {
        return msg.attachments?.some(a => a.type === 'document') || msg.type === 'document'
      }
      if (mediaFilter === 'audio') {
        return msg.attachments?.some(a => a.type === 'audio') || msg.type === 'audio' || msg.mediaMimeType?.startsWith('audio/')
      }
      return true
    })
  }, [messages, mediaFilter])
  
  // Memoize grouped messages to avoid recalculation
  const messageGroups = useMemo(() => groupMessages(filteredMessages), [filteredMessages])

  // A) Define loadMessages FIRST (before useSmartPolling)
  const loadMessages = useCallback(async () => {
    try {
      const res = await fetch(`/api/leads/${leadId}/messages?channel=${channel}`)
      if (res.ok) {
        const data = await res.json()
        setMessages(data.messages || [])
      }
    } catch (error) {
      console.error('Failed to load messages:', error)
    } finally {
      setLoading(false)
    }
  }, [leadId, channel])

  // B) Call useSmartPolling AFTER loadMessages exists
  useSmartPolling({
    fetcher: loadMessages,
    intervalMs: 5000, // 5s polling for messages
    enabled: true,
    pauseWhenHidden: true,
    onErrorBackoff: false, // Don't backoff on message polling errors
  })

  // C) useEffect to call loadMessages on mount
  useEffect(() => {
    loadMessages()
  }, [loadMessages])

  const loadSmartReplies = useCallback(async () => {
    try {
      const res = await fetch(`/api/leads/${leadId}/ai/next-action`, {
        method: 'POST',
      })
      if (res.ok) {
        const data = await res.json()
        if (data.suggestions && Array.isArray(data.suggestions)) {
          setSmartReplies(data.suggestions.slice(0, 3))
          setShowSmartReplies(true)
        }
      }
    } catch (error) {
      // Silent fail
    }
  }, [leadId])

  const handleSend = useCallback(async () => {
    if (!messageText.trim() || sending) return

    const text = messageText.trim()
    setMessageText('')
    setSending(true)
    setSentSuccess(false)

    try {
      if (onSend) {
        await onSend(text)
      } else {
        await fetch(`/api/leads/${leadId}/messages/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            channel: channel.toUpperCase(),
            body: text,
          }),
        })
      }
      
      // Micro-feedback: show "Sent" immediately
      setSentSuccess(true)
      showToast('Message sent', 'success')
      
      // Reload messages after short delay
      setTimeout(() => {
        loadMessages()
        setSentSuccess(false)
      }, 300)
      
      setSmartReplies([])
      setShowSmartReplies(false)
      
      if (onComposerChange) {
        onComposerChange(false)
      }
    } catch (error) {
      console.error('Failed to send message:', error)
      showToast('Failed to send message', 'error')
    } finally {
      setSending(false)
    }
  }, [messageText, sending, onSend, leadId, channel, onComposerChange, loadMessages, showToast])

  const handleMarkComplete = useCallback(async () => {
    if (typeof window === 'undefined') return
    const focusItemId = sessionStorage.getItem('focusItemId')
    if (focusItemId) {
      const parts = focusItemId.split('_')
      if (parts[0] === 'task' && parts[1]) {
        try {
          await fetch(`/api/tasks/${parts[1]}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'COMPLETED' }),
          })
        } catch (error) {
          console.error('Failed to mark task complete:', error)
        }
      }
    }
    sessionStorage.removeItem('focusMode')
    sessionStorage.removeItem('focusItemId')
    window.location.href = '/'
  }, [])

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  const handleSmartReplySelect = useCallback((reply: string) => {
    setMessageText(reply)
    setShowSmartReplies(false)
    if (onComposerChange) {
      onComposerChange(true)
    }
  }, [onComposerChange])

  useEffect(() => {
    if (messages.length > 0 && messages[messages.length - 1].direction === 'INBOUND') {
      loadSmartReplies()
    }
  }, [messages.length, loadSmartReplies])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  // Check if user scrolled up (show scroll button)
  useEffect(() => {
    const container = messagesContainerRef.current
    if (!container) return

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 100
      setShowScrollButton(!isNearBottom)
    }

    container.addEventListener('scroll', handleScroll)
    return () => container.removeEventListener('scroll', handleScroll)
  }, [])

  // Skeleton loader (shows within 100ms)
  if (loading) {
    return (
      <div className="flex-1 flex flex-col bg-app p-6">
        <div className="space-y-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className={cn(
              "flex gap-2",
              i % 2 === 0 ? "justify-end" : "justify-start"
            )}>
              {i % 2 !== 0 && (
                <Skeleton className="h-8 w-8 rounded-full flex-shrink-0" />
              )}
              <Skeleton className={cn(
                "h-16 rounded-[18px]",
                i % 2 === 0 ? "w-48" : "w-56"
              )} />
              {i % 2 === 0 && (
                <Skeleton className="h-8 w-8 rounded-full flex-shrink-0" />
              )}
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Fetch lead data if not provided
  const [leadData, setLeadData] = useState<ConversationWorkspaceProps['lead']>(lead)
  
  useEffect(() => {
    if (!lead && leadId) {
      fetch(`/api/leads/${leadId}`)
        .then(res => res.json())
        .then(data => {
          setLeadData({
            id: data.id,
            stage: data.stage,
            serviceType: data.serviceType,
            lastInboundAt: data.lastInboundAt,
            lastOutboundAt: data.lastOutboundAt,
            assignedUser: data.assignedUser,
          })
        })
        .catch(() => {})
    }
  }, [lead, leadId])

  return (
    <div className="flex-1 flex flex-col h-full bg-app relative">
      {/* Health Strip - PHASE A */}
      {leadData && (
        <LeadHealthStrip 
          lead={leadData}
          onStageClick={() => {
            // Scroll to stage selector or open stage modal
            if (typeof window !== 'undefined') {
              const stageSelector = document.querySelector('[data-stage-selector]')
              if (stageSelector) {
                stageSelector.scrollIntoView({ behavior: 'smooth', block: 'center' })
              }
            }
          }}
          onOwnerClick={() => {
            // Open assign dialog
            if (typeof window !== 'undefined') {
              window.location.href = `${window.location.pathname}?action=assign`
            }
          }}
          onServiceClick={() => {
            // Scroll to service section
            if (typeof window !== 'undefined') {
              const serviceSection = document.querySelector('[data-service-section]')
              if (serviceSection) {
                serviceSection.scrollIntoView({ behavior: 'smooth' })
              }
            }
          }}
          onSLAClick={() => {
            // Focus composer to reply
            if (typeof window !== 'undefined') {
              const composer = document.querySelector('textarea[placeholder*="message"]') as HTMLTextAreaElement
              if (composer) {
                composer.focus()
                composer.scrollIntoView({ behavior: 'smooth', block: 'center' })
              }
            }
          }}
        />
      )}
      
      {/* Messages Area - Airy spacing */}
      <div 
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto px-6 py-6 space-y-2"
      >
        {messageGroups.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <MessageSquare className="h-12 w-12 text-slate-300 dark:text-slate-700 mb-4" />
            <p className="text-body muted-text">
              {messages.length === 0 ? 'No messages yet' : `No ${mediaFilter === 'all' ? '' : mediaFilter} messages`}
            </p>
            <p className="text-meta muted-text mt-1">
              {messages.length === 0 ? 'Start the conversation' : 'Try a different filter'}
            </p>
          </div>
        ) : (
          messageGroups.map((group, groupIdx) => {
            const prevGroup = groupIdx > 0 ? messageGroups[groupIdx - 1] : null
            const showDateSeparator = !prevGroup || prevGroup.date !== group.date
            const isOutbound = group.direction === 'OUTBOUND'

            return (
              <div key={`group-${groupIdx}-${group.messages[0].id}`}>
                {showDateSeparator && <DateSeparator date={group.date} />}
                
                <div className="space-y-1">
                  {group.messages.map((message, msgIdx) => {
                    const isFirst = msgIdx === 0
                    const isLast = msgIdx === group.messages.length - 1
                    const showAvatar = isLast // Show avatar on last message in group

                    return (
                      <MessageBubble
                        key={message.id}
                        message={message}
                        isOutbound={isOutbound}
                        showAvatar={showAvatar}
                        isLastInGroup={isLast}
                      />
                    )
                  })}
                </div>

                {/* System Chip for AI Detection - only on last inbound message */}
                {!isOutbound && groupIdx === messageGroups.length - 1 && (
                  <div className="flex items-center gap-2 mt-2 mb-2 ml-10">
                    <Badge className="chip bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
                      <Sparkles className="h-3 w-3 mr-1" />
                      Understanding your message...
                    </Badge>
                  </div>
                )}
              </div>
            )
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Scroll to Bottom Button */}
      {showScrollButton && (
        <div className="absolute bottom-24 right-6 z-10">
          <Button
            onClick={scrollToBottom}
            size="icon"
            className={cn(
              "h-10 w-10 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground",
              "shadow-premium-lg hover:shadow-premium-lg hover:-translate-y-0.5",
              "transition-all duration-200 btn-pressable"
            )}
          >
            <ArrowDown className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Success Banner */}
      {showSuccessBanner && (
        <div className="px-6 pb-2 animate-in slide-in-from-bottom-4 fade-in duration-200">
          <ReplySuccessBanner
            onMarkComplete={handleMarkComplete}
            onKeepOpen={() => setShowSuccessBanner(false)}
          />
        </div>
      )}

      {/* Smart Reply Dropdown - Cleaner UI */}
      {smartReplies.length > 0 && showSmartReplies && (
        <div className="px-6 pb-2">
          <DropdownMenu open={showSmartReplies} onOpenChange={setShowSmartReplies}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="rounded-[12px] border-slate-200/60 dark:border-slate-800/60"
              >
                <Sparkles className="h-3.5 w-3.5 mr-2" />
                Smart replies
                <ChevronDown className="h-3.5 w-3.5 ml-2" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="rounded-[12px] w-64">
              {smartReplies.map((reply, idx) => (
                <DropdownMenuItem
                  key={idx}
                  onClick={() => handleSmartReplySelect(reply)}
                  className="text-body cursor-pointer"
                >
                  {reply}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {/* Message Composer - Premium with micro-feedback */}
      {(composerOpen === undefined || composerOpen) && (
        <div className="divider-soft bg-card p-4">
          <div className="flex items-end gap-3">
            <Textarea
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
              placeholder="Type your message..."
              disabled={sending}
              className={cn(
                "flex-1 min-h-[60px] max-h-[120px] resize-none rounded-[14px]",
                "border-slate-200/60 dark:border-slate-800/60",
                "focus-ring text-body",
                "transition-all duration-200",
                sending && "opacity-60 cursor-not-allowed"
              )}
              rows={2}
            />
            <Button
              onClick={handleSend}
              disabled={!messageText.trim() || sending}
              size="lg"
              className={cn(
                "rounded-[14px] h-[60px] px-6 bg-primary hover:bg-primary/90",
                "transition-all duration-200 hover:shadow-md active:scale-95",
                "disabled:opacity-50 disabled:cursor-not-allowed",
                sentSuccess && "bg-green-600 hover:bg-green-700"
              )}
            >
              {sending ? (
                <Clock className="h-5 w-5 animate-spin" />
              ) : sentSuccess ? (
                <CheckCircle2 className="h-5 w-5" />
              ) : (
                <Send className="h-5 w-5" />
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
})
