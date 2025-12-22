'use client'

import { useEffect, useState, FormEvent } from 'react'
import { MainLayout } from '@/components/layout/MainLayout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { MessageSquare, Send, Search, Phone, Mail } from 'lucide-react'
import Link from 'next/link'
import { format } from 'date-fns'

type Contact = {
  id: number
  fullName: string
  phone: string
  email?: string | null
}

type ChatMessage = {
  id: number
  message: string
  direction: string
  channel: string
  senderName?: string | null
  senderPhone?: string | null
  senderEmail?: string | null
  createdAt: string
  readAt?: string | null
  leadId?: number | null
  contactId?: number | null
}

type Conversation = {
  contact: Contact
  lastMessage?: ChatMessage
  unreadCount: number
}

export default function ChatPage() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [messageText, setMessageText] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    loadConversations()
  }, [])

  useEffect(() => {
    if (selectedContact) {
      loadMessages(selectedContact.id)
      // Poll for new messages every 5 seconds
      const interval = setInterval(() => {
        loadMessages(selectedContact.id, false)
      }, 5000)
      return () => clearInterval(interval)
    }
  }, [selectedContact])

  async function loadConversations() {
    try {
      setLoading(true)
      const res = await fetch('/api/chat/conversations')
      if (res.ok) {
        const data = await res.json()
        setConversations(data)
      }
    } catch (error) {
      console.error('Failed to load conversations:', error)
    } finally {
      setLoading(false)
    }
  }

  async function loadMessages(contactId: number, markRead = true) {
    try {
      const res = await fetch(`/api/chat/messages/${contactId}${markRead ? '?markRead=true' : ''}`)
      if (res.ok) {
        const data = await res.json()
        setMessages(data)
        if (markRead) {
          loadConversations() // Refresh to update unread counts
        }
      }
    } catch (error) {
      console.error('Failed to load messages:', error)
    }
  }

  async function sendMessage(e: FormEvent) {
    e.preventDefault()
    if (!selectedContact || !messageText.trim()) return

    setSending(true)
    try {
      const res = await fetch('/api/chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactId: selectedContact.id,
          message: messageText,
          channel: 'whatsapp', // Default to WhatsApp, can be changed
        }),
      })

      if (res.ok) {
        setMessageText('')
        loadMessages(selectedContact.id, false)
        loadConversations()
      } else {
        alert('Failed to send message')
      }
    } catch (error) {
      console.error('Failed to send message:', error)
      alert('Failed to send message')
    } finally {
      setSending(false)
    }
  }

  const filteredConversations = conversations.filter((conv) => {
    if (!searchQuery.trim()) return true
    const query = searchQuery.toLowerCase()
    return (
      conv.contact.fullName.toLowerCase().includes(query) ||
      conv.contact.phone.toLowerCase().includes(query) ||
      conv.contact.email?.toLowerCase().includes(query)
    )
  })

  return (
    <MainLayout>
      <div className="flex flex-col md:flex-row h-[calc(100vh-200px)] gap-4 animate-fade-in">
        {/* Conversations Sidebar */}
        <Card className="w-full md:w-80 flex flex-col flex-shrink-0">
          <CardHeader className="border-b">
            <div className="flex items-center gap-2 mb-4">
              <MessageSquare className="h-5 w-5 text-primary" />
              <CardTitle>Conversations</CardTitle>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search contacts..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto p-0">
            {loading ? (
              <div className="p-4 text-center text-muted-foreground">Loading...</div>
            ) : filteredConversations.length === 0 ? (
              <div className="p-4 text-center text-muted-foreground">
                No conversations found
              </div>
            ) : (
              <div className="divide-y">
                {filteredConversations.map((conv) => (
                  <button
                    key={conv.contact.id}
                    onClick={() => setSelectedContact(conv.contact)}
                    className={`w-full p-4 text-left hover:bg-secondary transition-colors ${
                      selectedContact?.id === conv.contact.id ? 'bg-secondary' : ''
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <Avatar fallback={conv.contact.fullName} size="md" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-medium text-foreground truncate">
                            {conv.contact.fullName}
                          </p>
                          {conv.unreadCount > 0 && (
                            <Badge variant="default" className="text-xs">
                              {conv.unreadCount}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground truncate">
                          {conv.lastMessage?.message || 'No messages'}
                        </p>
                        {conv.lastMessage && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {format(new Date(conv.lastMessage.createdAt), 'HH:mm')}
                          </p>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Chat Area */}
        <Card className="flex-1 flex flex-col">
          {selectedContact ? (
            <>
              <CardHeader className="border-b">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Avatar fallback={selectedContact.fullName} size="lg" />
                    <div>
                      <CardTitle>{selectedContact.fullName}</CardTitle>
                      <div className="flex items-center gap-3 mt-1">
                        <a
                          href={`tel:${selectedContact.phone}`}
                          className="text-sm text-muted-foreground hover:text-primary flex items-center gap-1"
                        >
                          <Phone className="h-3 w-3" />
                          {selectedContact.phone}
                        </a>
                        {selectedContact.email && (
                          <a
                            href={`mailto:${selectedContact.email}`}
                            className="text-sm text-muted-foreground hover:text-primary flex items-center gap-1"
                          >
                            <Mail className="h-3 w-3" />
                            {selectedContact.email}
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                  {selectedContact && (
                    <Link href={`/leads?contactId=${selectedContact.id}`}>
                      <Button variant="outline" size="sm">
                        View Lead
                      </Button>
                    </Link>
                  )}
                </div>
              </CardHeader>

              <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[70%] rounded-lg p-3 ${
                        msg.direction === 'outbound'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-secondary text-foreground'
                      }`}
                    >
                      <p className="text-sm whitespace-pre-wrap">{msg.message}</p>
                      <p
                        className={`text-xs mt-1 ${
                          msg.direction === 'outbound'
                            ? 'text-primary-foreground/70'
                            : 'text-muted-foreground'
                        }`}
                      >
                        {format(new Date(msg.createdAt), 'HH:mm')}
                      </p>
                    </div>
                  </div>
                ))}
              </CardContent>

              <div className="border-t p-4">
                <form onSubmit={sendMessage} className="flex gap-2">
                  <Input
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    placeholder="Type a message..."
                    className="flex-1"
                    disabled={sending}
                  />
                  <Button type="submit" disabled={sending || !messageText.trim()}>
                    <Send className="h-4 w-4" />
                  </Button>
                </form>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <MessageSquare className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">Select a conversation to start chatting</p>
              </div>
            </div>
          )}
        </Card>
      </div>
    </MainLayout>
  )
}

