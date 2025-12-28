'use client'

/**
 * CONVERSATION WORKSPACE
 * Modern conversation view with larger bubbles, date separators, inline system chips
 * Primary focus area for lead communication
 */

import { useState, useEffect, useRef } from 'react'
import { MessageSquare, Send, Sparkles, CheckCircle2, Clock, AlertCircle } from 'lucide-react'
import { format, isToday, isYesterday, parseISO } from 'date-fns'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { ReplySuccessBanner } from './ReplySuccessBanner'

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

export function ConversationWorkspace({ leadId, channel = 'whatsapp', onSend, composerOpen, onComposerChange }: ConversationWorkspaceProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [messageText, setMessageText] = useState('')
  const [sending, setSending] = useState(false)
  const [showSuccessBanner, setShowSuccessBanner] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [smartReplies, setSmartReplies] = useState<string[]>([])

  useEffect(() => {
    loadMessages()
    // Poll for new messages every 5 seconds
    const interval = setInterval(loadMessages, 5000)
    return () => clearInterval(interval)
  }, [leadId, channel])

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  async function loadMessages() {
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
  }

  async function loadSmartReplies() {
    try {
      const res = await fetch(`/api/leads/${leadId}/ai/next-action`, {
        method: 'POST',
      })
      if (res.ok) {
        const data = await res.json()
        // Extract suggested replies from AI response
        if (data.suggestions) {
          setSmartReplies(data.suggestions.slice(0, 3))
        }
      }
    } catch (error) {
      // Silent fail
    }
  }

  async function handleSend() {
    if (!messageText.trim() || sending) return

    const text = messageText.trim()
    setMessageText('')
    setSending(true)

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
      await loadMessages()
      setSmartReplies([])
      setShowSuccessBanner(true) // Show success banner after sending
      if (onComposerChange) {
        onComposerChange(false)
      }
    } catch (error) {
      console.error('Failed to send message:', error)
    } finally {
      setSending(false)
    }
  }

  async function handleMarkComplete() {
    // Check if we have a focus item ID
    const focusItemId = sessionStorage.getItem('focusItemId')
    if (focusItemId) {
      // Extract task or conversation ID
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
    // Exit focus mode and return to dashboard
    sessionStorage.removeItem('focusMode')
    sessionStorage.removeItem('focusItemId')
    window.location.href = '/'
  }

  function scrollToBottom() {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  function formatMessageDate(date: string): string {
    const messageDate = parseISO(date)
    if (isToday(messageDate)) return 'Today'
    if (isYesterday(messageDate)) return 'Yesterday'
    return format(messageDate, 'MMMM d, yyyy')
  }

  function getDateSeparator(date: string, prevDate?: string): string | null {
    if (!prevDate) return formatMessageDate(date)
    const current = parseISO(date)
    const previous = parseISO(prevDate)
    if (format(current, 'yyyy-MM-dd') !== format(previous, 'yyyy-MM-dd')) {
      return formatMessageDate(date)
    }
    return null
  }

  function getStatusIcon(status?: string) {
    switch (status) {
      case 'READ':
        return <CheckCircle2 className="h-3.5 w-3.5 text-blue-500" />
      case 'DELIVERED':
        return <CheckCircle2 className="h-3.5 w-3.5 text-slate-400" />
      case 'SENT':
        return <Clock className="h-3.5 w-3.5 text-slate-400" />
      case 'FAILED':
        return <AlertCircle className="h-3.5 w-3.5 text-red-500" />
      default:
        return null
    }
  }

  // Load smart replies when component mounts or message changes
  useEffect(() => {
    if (messages.length > 0 && messages[messages.length - 1].direction === 'INBOUND') {
      loadSmartReplies()
    }
  }, [messages.length])

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-sm text-slate-500">Loading conversation...</div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50 dark:bg-slate-950">
      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <MessageSquare className="h-12 w-12 text-slate-300 dark:text-slate-700 mb-4" />
            <p className="text-sm text-slate-500 dark:text-slate-400">No messages yet</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Start the conversation</p>
          </div>
        ) : (
          messages.map((message, idx) => {
            const dateSeparator = getDateSeparator(message.createdAt, messages[idx - 1]?.createdAt)
            const isOutbound = message.direction === 'OUTBOUND'

            return (
              <div key={message.id}>
                {dateSeparator && (
                  <div className="flex items-center justify-center my-6">
                    <div className="px-3 py-1 rounded-full bg-slate-200 dark:bg-slate-800 text-xs text-slate-600 dark:text-slate-400">
                      {dateSeparator}
                    </div>
                  </div>
                )}
                
                <div className={cn(
                  "flex gap-3",
                  isOutbound ? "justify-end" : "justify-start"
                )}>
                  {!isOutbound && (
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center">
                      <MessageSquare className="h-4 w-4 text-slate-500" />
                    </div>
                  )}
                  
                  <div className={cn(
                    "max-w-[75%] rounded-2xl px-4 py-3 shadow-sm",
                    isOutbound
                      ? "bg-primary text-primary-foreground"
                      : "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
                  )}>
                    <p className={cn(
                      "text-sm leading-relaxed",
                      isOutbound ? "text-white" : "text-slate-900 dark:text-slate-100"
                    )}>
                      {message.body}
                    </p>
                    
                    <div className={cn(
                      "flex items-center gap-2 mt-2 text-xs",
                      isOutbound ? "text-primary-foreground/70" : "text-slate-500 dark:text-slate-400"
                    )}>
                      <span>{format(parseISO(message.createdAt), 'h:mm a')}</span>
                      {isOutbound && message.status && (
                        <div className="flex items-center gap-1">
                          {getStatusIcon(message.status)}
                        </div>
                      )}
                    </div>
                  </div>

                  {isOutbound && (
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <MessageSquare className="h-4 w-4 text-primary" />
                    </div>
                  )}
                </div>

                {/* Inline System Chip for AI Detection */}
                {!isOutbound && idx === messages.length - 1 && (
                  <div className="flex items-center gap-2 mt-2 ml-11">
                    <Badge variant="outline" className="text-xs bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
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

      {/* Success Banner after sending reply */}
      {showSuccessBanner && (
        <div className="px-6 pb-2">
          <ReplySuccessBanner
            onMarkComplete={handleMarkComplete}
            onKeepOpen={() => setShowSuccessBanner(false)}
          />
        </div>
      )}

      {/* Smart Reply Suggestions */}
      {smartReplies.length > 0 && (
        <div className="px-6 pb-2">
          <div className="flex items-center gap-2 overflow-x-auto">
            <span className="text-xs text-slate-500 dark:text-slate-400 flex-shrink-0">Smart replies:</span>
            {smartReplies.map((reply, idx) => (
              <button
                key={idx}
                onClick={() => {
                  setMessageText(reply)
                  if (onComposerChange) {
                    onComposerChange(true)
                  }
                }}
                className="flex-shrink-0 px-3 py-1.5 text-xs rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors"
              >
                {reply}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Message Composer */}
      {(composerOpen === undefined || composerOpen) && (
      <div className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
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
            className="min-h-[60px] max-h-[120px] resize-none rounded-xl border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-primary/20"
            rows={2}
          />
          <Button
            onClick={handleSend}
            disabled={!messageText.trim() || sending}
            size="lg"
            className="rounded-xl h-[60px] px-6"
          >
            {sending ? (
              <Clock className="h-5 w-5 animate-spin" />
            ) : (
              <Send className="h-5 w-5" />
            )}
          </Button>
        </div>
      </div>
      )}
    </div>
  )
}

