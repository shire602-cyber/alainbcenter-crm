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
import { MessageSquare, Send, Sparkles, CheckCircle2, Clock, AlertCircle, ChevronDown } from 'lucide-react'
import { format, isToday, isYesterday, parseISO } from 'date-fns'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { ReplySuccessBanner } from './ReplySuccessBanner'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/components/ui/toast'
import { useSmartPolling } from '@/hooks/useSmartPolling'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface Message {
  id: number
  direction: 'INBOUND' | 'OUTBOUND'
  body: string | null
  createdAt: string
  status?: string
  channel: string
}

interface ConversationWorkspaceProps {
  leadId: number
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

function MessageBubble({ message, isOutbound, showAvatar, isLastInGroup }: { 
  message: Message
  isOutbound: boolean
  showAvatar: boolean
  isLastInGroup: boolean
}) {
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
        "max-w-[75%] rounded-[18px] px-4 py-2.5 shadow-sm",
        "transition-all duration-200",
        isOutbound
          ? "bg-primary text-primary-foreground"
          : "bg-card border border-slate-200/60 dark:border-slate-800/60"
      )}>
        <p className={cn(
          "text-body leading-relaxed whitespace-pre-wrap break-words",
          isOutbound ? "text-white" : "text-slate-900 dark:text-slate-100"
        )}>
          {message.body}
        </p>
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
      <div className="px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-800/60">
        <span className="text-meta muted-text">{label}</span>
      </div>
    </div>
  )
}

export const ConversationWorkspace = memo(function ConversationWorkspace({ 
  leadId, 
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
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [smartReplies, setSmartReplies] = useState<string[]>([])
  const [showSmartReplies, setShowSmartReplies] = useState(false)
  const { showToast } = useToast()

  // Memoize grouped messages to avoid recalculation
  const messageGroups = useMemo(() => groupMessages(messages), [messages])

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

  return (
    <div className="flex-1 flex flex-col h-full bg-app">
      {/* Messages Area - Airy spacing */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-2">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <MessageSquare className="h-12 w-12 text-slate-300 dark:text-slate-700 mb-4" />
            <p className="text-body muted-text">No messages yet</p>
            <p className="text-meta muted-text mt-1">Start the conversation</p>
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
