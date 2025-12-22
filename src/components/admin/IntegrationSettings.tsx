'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Settings, TestTube, Save, Key, CheckCircle2, XCircle, AlertCircle, ExternalLink } from 'lucide-react'

type Integration = {
  id: number
  name: string
  provider: string
  isEnabled: boolean
  apiKey: string | null
  apiSecret: string | null
  webhookUrl: string | null
  accessToken: string | null
  config: string | null | object
  lastTestedAt: string | null
  lastTestStatus: string | null
  lastTestMessage: string | null
}

type IntegrationType = {
  name: string
  label: string
  providers: string[]
}

export function IntegrationSettings({ 
  integration, 
  type 
}: { 
  integration: Integration | null
  type: IntegrationType
}) {
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    provider: integration?.provider || type.providers[0] || '',
    apiKey: integration?.apiKey || '',
    apiSecret: integration?.apiSecret || '',
    webhookUrl: integration?.webhookUrl || '',
    accessToken: integration?.accessToken || '',
  })

  // WhatsApp-specific fields
  const [whatsappConfig, setWhatsappConfig] = useState({
    phoneNumberId: '',
    businessAccountId: '',
    accessToken: '',
    webhookVerifyToken: '',
  })

  // Parse config JSON
  useEffect(() => {
    if (integration?.config) {
      try {
        const config = typeof integration.config === 'string' 
          ? JSON.parse(integration.config) 
          : integration.config

        if (type.name === 'whatsapp') {
          setWhatsappConfig({
            phoneNumberId: config.phoneNumberId || '',
            businessAccountId: config.businessAccountId || '',
            accessToken: config.accessToken || integration.accessToken || integration.apiKey || '',
            webhookVerifyToken: config.webhookVerifyToken || '',
          })
          
          // Populate formData.accessToken if not set
          if (!formData.accessToken && config.accessToken) {
            setFormData(prev => ({ ...prev, accessToken: config.accessToken }))
          }
          if (!formData.apiKey && integration.apiKey) {
            setFormData(prev => ({ ...prev, apiKey: integration.apiKey || '' }))
          }
        }
      } catch (e) {
        console.error('Failed to parse config:', e)
      }
    }
  }, [integration])

  // Reset error/success after 5 seconds
  useEffect(() => {
    if (error || success) {
      const timer = setTimeout(() => {
        setError(null)
        setSuccess(null)
      }, 5000)
      return () => clearTimeout(timer)
    }
  }, [error, success])

  async function handleSave(enable: boolean = true) {
    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      // Validate WhatsApp-specific fields if enabling
      if (type.name === 'whatsapp' && enable) {
        const provider = formData.provider || (whatsappConfig.accessToken ? 'Meta Cloud API' : '360dialog')
        
        if (provider === 'Meta Cloud API' || provider === 'meta') {
          if (!whatsappConfig.businessAccountId) {
            setError('App ID is required for Meta Cloud API')
            setSaving(false)
            return
          }
          if (!formData.apiSecret) {
            setError('App Secret is required for Meta Cloud API')
            setSaving(false)
            return
          }
          if (!whatsappConfig.phoneNumberId && !formData.apiKey) {
            setError('Phone Number ID is required for Meta Cloud API')
            setSaving(false)
            return
          }
          if (!whatsappConfig.accessToken && !formData.accessToken && !formData.apiKey) {
            setError('Access Token is required for Meta Cloud API')
            setSaving(false)
            return
          }
          if (!whatsappConfig.webhookVerifyToken) {
            setError('Webhook Verify Token is required for Meta webhook verification')
            setSaving(false)
            return
          }
        } else if (provider === '360dialog' && !formData.apiKey) {
          setError('API Key is required for 360dialog')
          setSaving(false)
          return
        }
      }

      // Prepare payload
      const payload: any = {
        name: type.name,
        provider: formData.provider,
        enabled: enable,
        apiKey: formData.apiKey || null,
        apiSecret: formData.apiSecret || null,
        webhookUrl: formData.webhookUrl || null,
        accessToken: formData.accessToken || null,
      }

      // Add WhatsApp-specific config
      if (type.name === 'whatsapp') {
        payload.config = {
          phoneNumberId: whatsappConfig.phoneNumberId || null,
          businessAccountId: whatsappConfig.businessAccountId || null, // App ID
          appId: whatsappConfig.businessAccountId || null, // Also as appId for clarity
          appSecret: formData.apiSecret || null, // App Secret stored in config
          accessToken: whatsappConfig.accessToken || formData.accessToken || formData.apiKey || null,
          webhookVerifyToken: whatsappConfig.webhookVerifyToken || null,
        }
        // Store App Secret in apiSecret field for easy access (used by webhook verification)
        payload.apiSecret = formData.apiSecret || null
        // Also set accessToken at root level for backward compatibility
        if (whatsappConfig.accessToken || formData.accessToken) {
          payload.accessToken = whatsappConfig.accessToken || formData.accessToken
        }
      } else {
        // For other integrations, store config as JSON if needed
        if (integration?.config) {
          try {
            const existingConfig = typeof integration.config === 'string' 
              ? JSON.parse(integration.config) 
              : integration.config
            payload.config = existingConfig
          } catch {
            payload.config = {}
          }
        } else {
          payload.config = {}
        }
      }

      const res = await fetch('/api/settings/integrations/' + type.name, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to save integration settings')
      }

      setSuccess(enable ? 'Integration enabled and saved successfully!' : 'Integration settings saved successfully!')
      
      // Reload page after a short delay to show success message
      setTimeout(() => {
        window.location.reload()
      }, 1000)
    } catch (err: any) {
      setError(err.message || 'Failed to save integration settings')
    } finally {
      setSaving(false)
    }
  }

  async function handleDisable() {
    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      const res = await fetch('/api/settings/integrations/' + type.name, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: false,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to disable integration')
      }

      setSuccess('Integration disabled successfully!')
      
      setTimeout(() => {
        window.location.reload()
      }, 1000)
    } catch (err: any) {
      setError(err.message || 'Failed to disable integration')
    } finally {
      setSaving(false)
    }
  }

  async function handleTest() {
    if (type.name === 'whatsapp') {
      // Use WhatsApp-specific test endpoint
      await handleWhatsAppTest()
    } else {
      // Use generic test endpoint for other integrations
      setTesting(true)
      setError(null)
      setSuccess(null)

      try {
        const res = await fetch(`/api/admin/integrations/${type.name}/test`, {
          method: 'POST',
        })

        const data = await res.json()
        if (res.ok) {
          setSuccess(`Test successful: ${data.message || 'Connection verified'}`)
        } else {
          setError(`Test failed: ${data.error || 'Unknown error'}`)
        }
      } catch (err: any) {
        setError('Failed to test integration')
      } finally {
        setTesting(false)
      }
    }
  }

  async function handleWhatsAppTest() {
    setTesting(true)
    setError(null)
    setSuccess(null)

    try {
      const res = await fetch('/api/settings/whatsapp/test', {
        method: 'POST',
      })

      const data = await res.json()

      if (res.ok && data.ok) {
        // Success
        const verifiedName = data.api?.verified_name || 'Unknown'
        const phoneNumber = data.api?.display_phone_number || data.phoneNumberId
        let message = `WhatsApp connected successfully! Verified: ${verifiedName}`
        if (phoneNumber) {
          message += ` (${phoneNumber})`
        }

        // Check webhook status
        if (data.webhook) {
          if (data.webhook.ok) {
            message += ' | Webhook: OK'
          } else {
            message += ` | Webhook: ${data.webhook.reason || 'Not reachable'}`
          }
        }

        setSuccess(message)
      } else {
        // Failure
        const errorMessage = data.api?.error || data.error || 'Connection test failed'
        const hint = data.api?.hint || data.hint || ''
        
        let fullError = `Test failed: ${errorMessage}`
        if (hint) {
          fullError += `\n💡 ${hint}`
        }

        // Include webhook warning if present
        if (data.webhook && !data.webhook.ok) {
          fullError += `\n\nWebhook: ${data.webhook.reason || 'Not reachable'}`
          if (data.webhook.hint) {
            fullError += `\n💡 ${data.webhook.hint}`
          }
        }

        setError(fullError)
      }
    } catch (err: any) {
      setError(`Failed to test WhatsApp connection: ${err.message || 'Unknown error'}`)
    } finally {
      setTesting(false)
    }
  }

  // Show status view when enabled and not editing
  const isEnabled = integration?.isEnabled || false
  const canEdit = !isEnabled || true // Always allow editing

  // Compute webhook URL for WhatsApp
  const webhookUrl = process.env.NEXT_PUBLIC_APP_URL
    ? `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/whatsapp`
    : typeof window !== 'undefined'
    ? `${window.location.origin}/api/webhooks/whatsapp`
    : 'https://your-domain.com/api/webhooks/whatsapp'

  return (
    <div className="space-y-4">
      {/* Error/Success Messages */}
      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <div className="flex items-start gap-2">
            <XCircle className="h-5 w-5 text-red-600 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-red-800 dark:text-red-200">Error</p>
              <p className="text-sm text-red-700 dark:text-red-300 whitespace-pre-line mt-1">{error}</p>
            </div>
          </div>
        </div>
      )}

      {success && (
        <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-green-800 dark:text-green-200 mb-1">Success!</p>
              <p className="text-sm text-green-700 dark:text-green-300 whitespace-pre-line break-words">{success}</p>
            </div>
          </div>
        </div>
      )}

      {/* Provider Selection */}
      <div className="space-y-1.5">
        <label className="block text-sm font-medium">Provider</label>
        <Select
          value={formData.provider}
          onChange={(e) => setFormData({ ...formData, provider: e.target.value })}
        >
          {type.providers.map((provider) => (
            <option key={provider} value={provider}>
              {provider}
            </option>
          ))}
        </Select>
      </div>

      {/* WhatsApp-specific fields */}
      {type.name === 'whatsapp' && (
        <div className="space-y-4">
          {(formData.provider === 'Meta Cloud API' || formData.provider === 'meta' || !formData.provider) && (
            <>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium">
                  App ID <span className="text-red-500">*</span>
                </label>
                <Input
                  type="text"
                  value={whatsappConfig.businessAccountId || ''}
                  onChange={(e) => setWhatsappConfig({ ...whatsappConfig, businessAccountId: e.target.value })}
                  placeholder="123456789012345"
                />
                <p className="text-xs text-muted-foreground">
                  Your Meta App ID (found in Meta for Developers → App Dashboard → Settings → Basic)
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-medium">
                  App Secret <span className="text-red-500">*</span>
                </label>
                <Input
                  type="password"
                  value={formData.apiSecret || ''}
                  onChange={(e) => setFormData({ ...formData, apiSecret: e.target.value })}
                  placeholder="your-app-secret"
                />
                <p className="text-xs text-muted-foreground">
                  Your Meta App Secret (found in Meta for Developers → App Dashboard → Settings → Basic → App Secret)
                </p>
                <p className="text-xs text-yellow-600 dark:text-yellow-400 font-medium">
                  ⚠️ Keep this secret secure. Used for webhook signature verification.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-medium">
                  Phone Number ID <span className="text-red-500">*</span>
                </label>
                <Input
                  type="text"
                  value={whatsappConfig.phoneNumberId}
                  onChange={(e) => setWhatsappConfig({ ...whatsappConfig, phoneNumberId: e.target.value })}
                  placeholder="123456789012345"
                />
                <p className="text-xs text-muted-foreground">
                  Found in Meta Business Manager → WhatsApp → API Setup
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-medium">
                  Access Token <span className="text-red-500">*</span>
                </label>
                <Input
                  type="password"
                  value={whatsappConfig.accessToken || formData.accessToken}
                  onChange={(e) => {
                    setWhatsappConfig({ ...whatsappConfig, accessToken: e.target.value })
                    setFormData({ ...formData, accessToken: e.target.value })
                  }}
                  placeholder="EAAxxxxxxxx..."
                />
                <p className="text-xs text-muted-foreground">
                  Permanent access token from Meta Business Manager → WhatsApp → API Setup
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-medium">
                  Webhook Verify Token <span className="text-red-500">*</span>
                </label>
                <div className="flex gap-2">
                  <Input
                    type="text"
                    value={whatsappConfig.webhookVerifyToken}
                    onChange={(e) => setWhatsappConfig({ ...whatsappConfig, webhookVerifyToken: e.target.value })}
                    placeholder="Will be auto-generated if empty"
                    readOnly={!!whatsappConfig.webhookVerifyToken}
                    className={whatsappConfig.webhookVerifyToken ? 'bg-muted font-mono' : ''}
                  />
                  {!whatsappConfig.webhookVerifyToken && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        // Generate a secure random token
                        const token = `wa-verify-${crypto.randomUUID().replace(/-/g, '')}-${Date.now().toString(36)}`
                        setWhatsappConfig({ ...whatsappConfig, webhookVerifyToken: token })
                      }}
                    >
                      Generate Token
                    </Button>
                  )}
                  {whatsappConfig.webhookVerifyToken && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        navigator.clipboard.writeText(whatsappConfig.webhookVerifyToken)
                        setSuccess('Token copied to clipboard!')
                      }}
                    >
                      Copy
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  <strong>Required for Meta webhook setup.</strong> Click "Generate Token" to create a secure token, 
                  then use this exact value when configuring the webhook in Meta Business Manager → WhatsApp → Configuration → Webhooks.
                </p>
                <p className="text-xs text-yellow-600 dark:text-yellow-400 font-medium">
                  ⚠️ Copy this token and paste it in Meta's webhook configuration page (Verify Token field).
                </p>
              </div>

              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg space-y-3">
                <p className="text-sm font-semibold text-blue-900 dark:text-blue-100">
                  📋 Meta Webhook Configuration
                </p>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-blue-800 dark:text-blue-200 mb-1">
                      Webhook URL (Copy this)
                    </label>
                    <div className="flex items-center gap-2">
                      <Input
                        value={webhookUrl}
                        readOnly
                        className="bg-white dark:bg-gray-800 font-mono text-xs"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          navigator.clipboard.writeText(webhookUrl)
                          setSuccess('Webhook URL copied to clipboard!')
                        }}
                      >
                        Copy
                      </Button>
                    </div>
                  </div>
                  {whatsappConfig.webhookVerifyToken && (
                    <div>
                      <label className="block text-xs font-medium text-blue-800 dark:text-blue-200 mb-1">
                        Verify Token (Copy this)
                      </label>
                      <div className="flex items-center gap-2">
                        <Input
                          value={whatsappConfig.webhookVerifyToken}
                          readOnly
                          className="bg-white dark:bg-gray-800 font-mono text-xs"
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            navigator.clipboard.writeText(whatsappConfig.webhookVerifyToken)
                            setSuccess('Verify Token copied to clipboard!')
                          }}
                        >
                          Copy
                        </Button>
                      </div>
                    </div>
                  )}
                  <div className="mt-2 pt-2 border-t border-blue-200 dark:border-blue-700">
                    <div className="mb-2 p-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded">
                      <p className="text-xs font-semibold text-yellow-800 dark:text-yellow-200 mb-1">
                        ⚠️ Important for Local Development:
                      </p>
                      <p className="text-xs text-yellow-700 dark:text-yellow-300">
                        If you see "localhost:3000" above, Meta cannot access it! You need to use <strong>ngrok</strong> to create a public URL.
                      </p>
                    </div>
                    <p className="text-xs text-blue-700 dark:text-blue-300 mb-1">
                      <strong>For Local Development (ngrok required):</strong>
                    </p>
                    <ol className="text-xs text-blue-600 dark:text-blue-400 mt-1 ml-4 list-decimal space-y-1 mb-3">
                      <li>Install ngrok: <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">npm install -g ngrok</code></li>
                      <li>Start your dev server: <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">npm run dev</code></li>
                      <li>In another terminal, run: <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">ngrok http 3000</code></li>
                      <li>Copy the <strong>HTTPS</strong> URL from ngrok (e.g., https://abc123.ngrok-free.app)</li>
                      <li>Use that URL + <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">/api/webhooks/whatsapp</code> in Meta</li>
                    </ol>
                    <p className="text-xs text-blue-700 dark:text-blue-300 mb-1">
                      <strong>Steps to Configure in Meta:</strong>
                    </p>
                    <ol className="text-xs text-blue-600 dark:text-blue-400 mt-1 ml-4 list-decimal space-y-1">
                      <li>Go to Meta Business Manager → WhatsApp → Configuration → Webhooks</li>
                      <li>Click "Edit" on your webhook</li>
                      <li>Paste the Webhook URL (use ngrok URL if localhost)</li>
                      <li>Paste the Verify Token above</li>
                      <li>Subscribe to: <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">messages</code> and <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">message_status</code></li>
                      <li>Click "Verify and Save"</li>
                    </ol>
                  </div>
                </div>
              </div>
            </>
          )}

          {formData.provider === '360dialog' && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-sm font-medium">
                  API Key <span className="text-red-500">*</span>
                </label>
                <Input
                  type="password"
                  value={formData.apiKey}
                  onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                  placeholder="Your 360dialog API key"
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Email fields */}
      {type.name === 'email' && (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-sm font-medium">SMTP Host</label>
            <Input
              value={formData.apiKey || ''}
              onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
              placeholder="smtp.gmail.com"
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium">SMTP Port</label>
            <Input
              value={formData.apiSecret || ''}
              onChange={(e) => setFormData({ ...formData, apiSecret: e.target.value })}
              placeholder="587"
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium">Email</label>
            <Input
              value={formData.webhookUrl || ''}
              onChange={(e) => setFormData({ ...formData, webhookUrl: e.target.value })}
              placeholder="noreply@alainbcenter.com"
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium">Password</label>
            <Input
              type="password"
              value={formData.accessToken || ''}
              onChange={(e) => setFormData({ ...formData, accessToken: e.target.value })}
              placeholder="App password or API key"
            />
          </div>
        </div>
      )}

      {/* Facebook/Instagram fields */}
      {(type.name === 'facebook' || type.name === 'instagram') && (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-sm font-medium">Access Token</label>
            <Input
              type="password"
              value={formData.accessToken || ''}
              onChange={(e) => setFormData({ ...formData, accessToken: e.target.value })}
              placeholder="Meta Access Token"
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium">Webhook URL</label>
            <Input
              value={formData.webhookUrl || ''}
              onChange={(e) => setFormData({ ...formData, webhookUrl: e.target.value })}
              placeholder={`https://your-domain.com/api/webhooks/${type.name}`}
            />
          </div>
        </div>
      )}

      {/* OpenAI fields */}
      {type.name === 'openai' && (
        <div className="space-y-1.5">
          <label className="block text-sm font-medium">API Key</label>
          <Input
            type="password"
            value={formData.apiKey || ''}
            onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
            placeholder="sk-..."
          />
        </div>
      )}

      {/* Status and Test Info */}
      {isEnabled && integration?.lastTestedAt && (
        <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
          <p className="text-sm text-muted-foreground">Last tested:</p>
          <Badge variant={integration.lastTestStatus === 'success' ? 'default' : 'destructive'}>
            {new Date(integration.lastTestedAt).toLocaleString()}
          </Badge>
          {integration.lastTestMessage && (
            <p className="text-xs text-muted-foreground">{integration.lastTestMessage}</p>
          )}
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-2 pt-4 border-t border-border/50">
        {!isEnabled ? (
          <Button onClick={() => handleSave(true)} disabled={saving} className="gap-2">
            <Save className="h-4 w-4" />
            {saving ? 'Saving...' : 'Save & Enable'}
          </Button>
        ) : (
          <>
            <Button onClick={() => handleSave(false)} disabled={saving} variant="default" className="gap-2">
              <Save className="h-4 w-4" />
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
            <Button variant="outline" onClick={handleTest} disabled={testing} className="gap-2">
              <TestTube className="h-4 w-4" />
              {testing ? 'Testing...' : 'Test Connection'}
            </Button>
            <Button variant="outline" onClick={handleDisable} disabled={saving}>
              Disable
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
