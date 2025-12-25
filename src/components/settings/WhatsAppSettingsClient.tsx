'use client'

import { useState, useEffect, FormEvent } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { CheckCircle2, XCircle, Send, Loader2, AlertCircle, ExternalLink, MessageSquare } from 'lucide-react'
import Link from 'next/link'

interface WhatsAppConfig {
  configured: {
    accessToken: boolean
    phoneNumberId: boolean
    verifyToken: boolean
    appSecret: boolean
  }
  lastInboundMessage: {
    ok: boolean
    kind: string
    info: string
    createdAt: string
  } | null
  recentWebhookLogs: Array<{
    id: number
    kind: string
    ok: boolean
    info: string | null
    createdAt: string
  }>
}

export function WhatsAppSettingsClient() {
  const [config, setConfig] = useState<WhatsAppConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [testPhone, setTestPhone] = useState('')
  const [testContactId, setTestContactId] = useState<string>('')
  const [contacts, setContacts] = useState<Array<{ id: number; fullName: string; phone: string }>>([])
  const [testMessage, setTestMessage] = useState('Hello! This is a test message from Alain CRM.')
  const [sending, setSending] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message?: string } | null>(null)
  const [loadingContacts, setLoadingContacts] = useState(false)
  const [testAutoReplyLeadId, setTestAutoReplyLeadId] = useState('')
  const [testAutoReplyMessage, setTestAutoReplyMessage] = useState('Hi, I need help with visa services')
  const [testingAutoReply, setTestingAutoReply] = useState(false)
  const [autoReplyTestResult, setAutoReplyTestResult] = useState<{ success: boolean; message?: string } | null>(null)

  useEffect(() => {
    loadConfig()
    loadContacts()
  }, [])

  async function loadConfig() {
    try {
      setLoading(true)
      const res = await fetch('/api/whatsapp/config')
      if (res.ok) {
        const data = await res.json()
        setConfig(data)
      }
    } catch (err) {
      console.error('Failed to load config:', err)
    } finally {
      setLoading(false)
    }
  }

  async function loadContacts() {
    try {
      setLoadingContacts(true)
      const res = await fetch('/api/leads')
      if (res.ok) {
        const leads = await res.json()
        // Extract unique contacts
        const uniqueContacts = new Map<number, { id: number; fullName: string; phone: string }>()
        leads.forEach((lead: any) => {
          if (lead.contact && lead.contact.id && !uniqueContacts.has(lead.contact.id)) {
            uniqueContacts.set(lead.contact.id, {
              id: lead.contact.id,
              fullName: lead.contact.fullName || lead.contact.name || 'Unknown',
              phone: lead.contact.phone || '',
            })
          }
        })
        setContacts(Array.from(uniqueContacts.values()).filter(c => c.phone))
      }
    } catch (err) {
      console.error('Failed to load contacts:', err)
    } finally {
      setLoadingContacts(false)
    }
  }

  async function handleTestSend(e: FormEvent) {
    e.preventDefault()
    if (!testPhone.trim() && !testContactId) {
      setTestResult({ success: false, message: 'Please enter a phone number or select a contact' })
      return
    }

    setSending(true)
    setTestResult(null)

    try {
      const payload: any = {
        message: testMessage,
      }

      if (testContactId) {
        payload.contactId = parseInt(testContactId)
      } else {
        payload.phone = testPhone
      }

      const res = await fetch('/api/whatsapp/test-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json()

      if (res.ok) {
        setTestResult({
          success: true,
          message: `✅ Test message sent successfully to ${data.contactName || data.phone}! Message ID: ${data.messageId}`,
        })
        setTestPhone('')
        setTestContactId('')
      } else {
        setTestResult({ success: false, message: data.error || 'Failed to send test message' })
      }
    } catch (err: any) {
      setTestResult({ success: false, message: err.message || 'Error sending test message' })
    } finally {
      setSending(false)
    }
  }

  const isConfigured = config?.configured.accessToken && config?.configured.phoneNumberId
  
  // Get webhook URL - use current origin (works on Vercel automatically)
  const webhookUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/api/webhooks/whatsapp`
    : process.env.NEXT_PUBLIC_APP_URL
    ? `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/whatsapp`
    : 'https://your-domain.com/api/webhooks/whatsapp'

  return (
    <div className="space-y-6">
      {/* Connection Status */}
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>Connection Status</CardTitle>
          <CardDescription>WhatsApp Cloud API configuration</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="text-center py-4">Loading...</div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {isConfigured ? (
                    <CheckCircle2 className="h-6 w-6 text-green-600" />
                  ) : (
                    <XCircle className="h-6 w-6 text-red-600" />
                  )}
                  <div>
                    <p className="font-semibold">
                      {isConfigured ? 'Connected' : 'Not Connected'}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {isConfigured
                        ? 'WhatsApp Cloud API is configured'
                        : 'Please configure environment variables in .env.local'}
                    </p>
                  </div>
                </div>
                <Badge variant={isConfigured ? 'success' : 'destructive'} className={isConfigured ? 'bg-green-500' : ''}>
                  {isConfigured ? 'Active' : 'Inactive'}
                </Badge>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t">
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">
                    Access Token
                  </p>
                  <div className="flex items-center gap-2">
                    {config?.configured.accessToken ? (
                      <>
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                        <span className="text-sm text-green-600">Configured</span>
                      </>
                    ) : (
                      <>
                        <XCircle className="h-4 w-4 text-red-600" />
                        <span className="text-sm text-red-600">Not set</span>
                      </>
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">
                    Phone Number ID
                  </p>
                  <div className="flex items-center gap-2">
                    {config?.configured.phoneNumberId ? (
                      <>
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                        <span className="text-sm text-green-600">Configured</span>
                      </>
                    ) : (
                      <>
                        <XCircle className="h-4 w-4 text-red-600" />
                        <span className="text-sm text-red-600">Not set</span>
                      </>
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">
                    Verify Token
                  </p>
                  <div className="flex items-center gap-2">
                    {config?.configured.verifyToken ? (
                      <>
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                        <span className="text-sm text-green-600">Configured</span>
                      </>
                    ) : (
                      <>
                        <XCircle className="h-4 w-4 text-red-600" />
                        <span className="text-sm text-red-600">Not set</span>
                      </>
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">
                    App Secret
                  </p>
                  <div className="flex items-center gap-2">
                    {config?.configured.appSecret ? (
                      <>
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                        <span className="text-sm text-green-600">Configured</span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="h-4 w-4 text-yellow-600" />
                        <span className="text-sm text-yellow-600">Optional</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Last Inbound Message */}
              {config?.lastInboundMessage && (
                <div className="pt-4 border-t">
                  <p className="text-sm font-medium text-muted-foreground mb-2">
                    Last Inbound Message Received
                  </p>
                  <div className="flex items-center gap-2">
                    {config.lastInboundMessage.ok ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-600" />
                    )}
                    <span className="text-sm font-medium">
                      {new Date(config.lastInboundMessage.createdAt).toLocaleString()}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      - {config.lastInboundMessage.info}
                    </span>
                  </div>
                </div>
              )}

              {/* Recent Webhook Logs */}
              {config?.recentWebhookLogs && config.recentWebhookLogs.length > 0 && (
                <div className="pt-4 border-t">
                  <p className="text-sm font-medium text-muted-foreground mb-2">
                    Recent Webhook Activity (Last 10)
                  </p>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {config.recentWebhookLogs.map((log) => (
                      <div
                        key={log.id}
                        className="flex items-center gap-2 text-xs text-muted-foreground"
                      >
                        {log.ok ? (
                          <CheckCircle2 className="h-3 w-3 text-green-600" />
                        ) : (
                          <XCircle className="h-3 w-3 text-red-600" />
                        )}
                        <span className="font-mono text-xs">
                          {new Date(log.createdAt).toLocaleString()}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {log.kind || 'unknown'}
                        </Badge>
                        <span className="truncate">{log.info || '—'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Webhook URL */}
              <div className="pt-4 border-t">
                <p className="text-sm font-medium text-muted-foreground mb-2">
                  Webhook URL
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 p-2 bg-muted rounded text-sm break-all">
                    {webhookUrl}
                  </code>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigator.clipboard.writeText(webhookUrl)}
                  >
                    Copy
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Use this URL when configuring your webhook in Meta Business Manager
                </p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Test Send */}
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>Test Connection</CardTitle>
          <CardDescription>Send a test message to verify configuration</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleTestSend} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                Select Existing Contact (Optional)
              </label>
              <select
                value={testContactId}
                onChange={(e) => {
                  setTestContactId(e.target.value)
                  if (e.target.value) {
                    setTestPhone('')
                  }
                }}
                className="w-full p-2 border rounded-md text-sm"
                disabled={loadingContacts}
              >
                <option value="">-- Or enter phone manually --</option>
                {contacts.map((contact) => (
                  <option key={contact.id} value={contact.id.toString()}>
                    {contact.fullName} ({contact.phone})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">
                {testContactId ? 'Phone Number (from selected contact)' : 'Phone Number (E.164 format, e.g., +971501234567 or UAE format 0501234567)'}
              </label>
              <Input
                type="tel"
                value={testPhone}
                onChange={(e) => {
                  setTestPhone(e.target.value)
                  if (e.target.value) {
                    setTestContactId('')
                  }
                }}
                placeholder="+971501234567 or 0501234567"
                disabled={!!testContactId}
                required={!testContactId}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Test Message</label>
              <Input
                value={testMessage}
                onChange={(e) => setTestMessage(e.target.value)}
                required
              />
            </div>
            <Button type="submit" disabled={sending || !isConfigured || (!testPhone.trim() && !testContactId)}>
              {sending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Send Test Message
                </>
              )}
            </Button>
            {!isConfigured && (
              <p className="text-sm text-yellow-600">
                ⚠️ Please configure WhatsApp credentials in .env.local first
              </p>
            )}
          </form>

          {testResult && (
            <div
              className={`mt-4 p-4 rounded-lg flex items-center gap-3 ${
                testResult.success
                  ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                  : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
              }`}
            >
              {testResult.success ? (
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              ) : (
                <XCircle className="h-5 w-5 text-red-600" />
              )}
              <p
                className={
                  testResult.success
                    ? 'text-green-700 dark:text-green-300'
                    : 'text-red-700 dark:text-red-300'
                }
              >
                {testResult.message}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Test Auto-Reply */}
      <Card className="shadow-lg border-blue-200 dark:border-blue-800">
        <CardHeader>
          <CardTitle>Test Auto-Reply</CardTitle>
          <CardDescription>Test the AI auto-reply functionality for a lead</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={async (e) => {
            e.preventDefault()
            if (!testAutoReplyLeadId || !testAutoReplyMessage) {
              setAutoReplyTestResult({ success: false, message: 'Please enter lead ID and message' })
              return
            }

            setTestingAutoReply(true)
            setAutoReplyTestResult(null)

            try {
              const response = await fetch('/api/admin/auto-reply/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                  leadId: parseInt(testAutoReplyLeadId),
                  messageText: testAutoReplyMessage,
                  channel: 'WHATSAPP',
                }),
              })

              const data = await response.json()

              if (data.ok && data.result) {
                if (data.result.replied) {
                  setAutoReplyTestResult({ 
                    success: true, 
                    message: `✅ Auto-reply sent successfully! Check the lead's conversation.` 
                  })
                } else {
                  setAutoReplyTestResult({ 
                    success: false, 
                    message: `⏭️ Auto-reply skipped: ${data.result.reason || data.result.error}` 
                  })
                }
              } else {
                setAutoReplyTestResult({ 
                  success: false, 
                  message: data.error || 'Failed to test auto-reply' 
                })
              }
            } catch (err: any) {
              setAutoReplyTestResult({ 
                success: false, 
                message: err.message || 'Error testing auto-reply' 
              })
            } finally {
              setTestingAutoReply(false)
            }
          }} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                Lead ID
              </label>
              <Input
                type="number"
                value={testAutoReplyLeadId}
                onChange={(e) => setTestAutoReplyLeadId(e.target.value)}
                placeholder="Enter lead ID"
                required
              />
              <p className="text-xs text-muted-foreground mt-1">
                Find the lead ID from the Leads page or URL (e.g., /leads/123)
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Test Message (simulated inbound)</label>
              <Input
                value={testAutoReplyMessage}
                onChange={(e) => setTestAutoReplyMessage(e.target.value)}
                placeholder="Hi, I need help"
                required
              />
            </div>
            <Button type="submit" disabled={testingAutoReply || !testAutoReplyLeadId || !testAutoReplyMessage}>
              {testingAutoReply ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Testing...
                </>
              ) : (
                <>
                  <MessageSquare className="h-4 w-4 mr-2" />
                  Test Auto-Reply
                </>
              )}
            </Button>
          </form>

          {autoReplyTestResult && (
            <div
              className={`mt-4 p-4 rounded-lg flex items-center gap-3 ${
                autoReplyTestResult.success
                  ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                  : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
              }`}
            >
              {autoReplyTestResult.success ? (
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              ) : (
                <XCircle className="h-5 w-5 text-red-600" />
              )}
              <p
                className={
                  autoReplyTestResult.success
                    ? 'text-green-700 dark:text-green-300'
                    : 'text-red-700 dark:text-red-300'
                }
              >
                {autoReplyTestResult.message}
              </p>
            </div>
          )}

          <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-xs text-muted-foreground">
            <p className="font-medium mb-1">💡 How it works:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>This simulates an inbound message from the lead</li>
              <li>The AI will check if auto-reply should run</li>
              <li>If approved, it will generate and send a reply via WhatsApp</li>
              <li>Check the "Recent Webhook Activity" above to see the logs</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Environment Variables Help */}
      <Card className="shadow-lg border-yellow-200 dark:border-yellow-800 bg-yellow-50/50 dark:bg-yellow-900/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-yellow-600" />
            Required Environment Variables
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 text-sm">
            <div>
              <code className="font-semibold">WHATSAPP_ACCESS_TOKEN</code>
              <p className="text-muted-foreground ml-4 mt-1">
                Your permanent access token from Meta Business Manager &gt; WhatsApp &gt; API Setup
              </p>
            </div>
            <div>
              <code className="font-semibold">WHATSAPP_PHONE_NUMBER_ID</code>
              <p className="text-muted-foreground ml-4 mt-1">
                Your WhatsApp Business Phone Number ID (found in API Setup page)
              </p>
            </div>
            <div>
              <code className="font-semibold">WHATSAPP_VERIFY_TOKEN</code>
              <p className="text-muted-foreground ml-4 mt-1">
                Custom token for webhook verification (create your own secure random string)
              </p>
            </div>
            <div>
              <code className="font-semibold">WHATSAPP_APP_SECRET</code>
              <p className="text-muted-foreground ml-4 mt-1">
                Optional: App Secret for webhook signature verification (recommended for production)
              </p>
            </div>
            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground">
                📝 Edit these in <code>.env.local</code> file in the project root, then restart the
                dev server.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick Links */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Links</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <Button variant="outline" asChild>
              <Link href="/settings/whatsapp/templates">
                <MessageSquare className="h-4 w-4 mr-2" />
                Manage Templates
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <a
                href="https://business.facebook.com/settings/system-users"
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Meta Business Manager
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
