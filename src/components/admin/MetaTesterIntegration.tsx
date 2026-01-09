'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { CheckCircle2, XCircle, AlertCircle, Loader2 } from 'lucide-react'

interface MetaConnection {
  id: number
  pageId: string
  pageName: string | null
  igUsername: string | null
  triggerSubscribed: boolean
  status: string
  lastError: string | null
}

interface MetaPage {
  id: string
  name: string
  instagram_business_account: {
    id: string
    username: string
  } | null
}

interface PersistedConfig {
  pageId: string | null
  pageName: string | null
  igBusinessId: string | null
  igUsername: string | null
  connectedAt: string | null
}

export function MetaTesterIntegration({
  connections,
  hasConnection,
}: {
  connections: MetaConnection[]
  hasConnection: boolean
}) {
  const [token, setToken] = useState('')
  const [webhookVerifyToken, setWebhookVerifyToken] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [errorDetails, setErrorDetails] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [connectionStatus, setConnectionStatus] = useState(connections)
  const [webhookUrl, setWebhookUrl] = useState<string | null>(null)
  const [webhookVerifyTokenConfigured, setWebhookVerifyTokenConfigured] = useState(false)
  
  // Page selection state
  const [pages, setPages] = useState<MetaPage[]>([])
  const [selectedPageId, setSelectedPageId] = useState<string>('')
  const [fetchingPages, setFetchingPages] = useState(false)
  const [persistedConfig, setPersistedConfig] = useState<PersistedConfig | null>(null)

  // Load status on mount and refresh periodically
  useEffect(() => {
    const loadStatus = async () => {
      try {
        const res = await fetch('/api/integrations/meta/status')
        if (res.ok) {
          const data = await res.json()
          setConnectionStatus(data.connections || [])
          setWebhookUrl(data.webhookUrl || null)
          setWebhookVerifyTokenConfigured(data.webhookVerifyTokenConfigured || false)
          
          // Load persisted config and pre-select page
          if (data.persistedConfig) {
            setPersistedConfig(data.persistedConfig)
            // Pre-select the persisted page if we have one
            if (data.persistedConfig.pageId && !selectedPageId) {
              setSelectedPageId(data.persistedConfig.pageId)
            }
          }
        }
      } catch (err) {
        // Silent fail
      }
    }

    loadStatus()

    if (hasConnection) {
      const interval = setInterval(loadStatus, 30000) // Every 30 seconds
      return () => clearInterval(interval)
    }
  }, [hasConnection, selectedPageId])

  const handleFetchPages = async () => {
    if (!token.trim()) {
      setError('Please enter a Meta tester token first')
      return
    }

    setFetchingPages(true)
    setError(null)
    setErrorDetails(null)
    setPages([])
    // Don't clear selectedPageId - preserve user selection or persisted config

    try {
      const res = await fetch('/api/integrations/meta/assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken: token.trim() }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to fetch pages')
        setErrorDetails(data.details || data.hint || null)
        return
      }

      if (data.pages && Array.isArray(data.pages) && data.pages.length > 0) {
        setPages(data.pages)
        
        // Pre-select persisted page if available, otherwise don't auto-select
        if (persistedConfig?.pageId) {
          const persistedPageExists = data.pages.find((p: MetaPage) => p.id === persistedConfig.pageId)
          if (persistedPageExists) {
            setSelectedPageId(persistedConfig.pageId)
          } else {
            // Persisted page no longer exists, clear selection
            setSelectedPageId('')
          }
        }
        // No auto-selection - user must explicitly select a page
      } else {
        setError('No Facebook pages found. Please create a page first.')
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch pages')
      setErrorDetails('Network error or server unavailable')
    } finally {
      setFetchingPages(false)
    }
  }

  const handleConnect = async () => {
    if (!token.trim()) {
      setError('Please enter a Meta tester token')
      return
    }

    // Require page selection for IG DM integration
    if (!selectedPageId) {
      setError('Please select a Facebook Page with Instagram Business Account')
      return
    }

    // Validate selected page has IG account
    if (selectedPageId && pages.length > 0) {
      const selectedPage = pages.find((p) => p.id === selectedPageId)
      if (!selectedPage) {
        setError('Selected page not found. Please fetch pages again.')
        return
      }
      if (!selectedPage.instagram_business_account) {
        setError('Selected page does not have an Instagram Business Account connected. Please connect an Instagram account to this page in Meta Business Manager.')
        return
      }
    }

    setConnecting(true)
    setError(null)
    setSuccess(null)

    try {
      const res = await fetch('/api/integrations/meta/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          token: token.trim(),
          pageId: selectedPageId || undefined,
          webhookVerifyToken: webhookVerifyToken.trim() || undefined,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to connect')
        setErrorDetails(data.details || data.hint || null)
        return
      }

      setSuccess(`Connected to ${data.connection.pageName || data.connection.pageId}${data.connection.igUsername ? ` (@${data.connection.igUsername})` : ''}`)
      setError(null)
      setErrorDetails(null)
      setToken('')
      setWebhookVerifyToken('') // Clear after successful connection
      setPages([])
      setSelectedPageId('')
      
      // Refresh status
      const statusRes = await fetch('/api/integrations/meta/status')
      if (statusRes.ok) {
        const statusData = await statusRes.json()
        setConnectionStatus(statusData.connections || [])
        setWebhookUrl(statusData.webhookUrl || null)
        setWebhookVerifyTokenConfigured(statusData.webhookVerifyTokenConfigured || false)
      }

      // Reload page after 2 seconds to show updated state
      setTimeout(() => {
        window.location.reload()
      }, 2000)
    } catch (err: any) {
      setError(err.message || 'Failed to connect')
      setErrorDetails('Network error or server unavailable')
    } finally {
      setConnecting(false)
    }
  }

  const handleDisconnect = async (connectionId: number) => {
    if (!confirm('Are you sure you want to disconnect this Meta integration?')) {
      return
    }

    setDisconnecting(true)
    setError(null)
    setSuccess(null)

    try {
      const res = await fetch('/api/integrations/meta/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to disconnect')
        return
      }

      setSuccess('Disconnected successfully')
      
      // Reload page after 1 second
      setTimeout(() => {
        window.location.reload()
      }, 1000)
    } catch (err: any) {
      setError(err.message || 'Failed to disconnect')
    } finally {
      setDisconnecting(false)
    }
  }

  const handleTestWebhook = async () => {
    // Simple ping to verify webhook URL is reachable
    // Note: This tests if the endpoint is reachable, but actual verification requires META_VERIFY_TOKEN
    try {
      const res = await fetch('/api/webhooks/meta?hub.mode=subscribe&hub.verify_token=test', {
        method: 'GET',
      })
      
      // Even if verification fails, if we get a response, the endpoint is reachable
      if (res.status === 200 || res.status === 403) {
        setSuccess('Webhook endpoint is reachable (verification requires correct token)')
      } else {
        setError('Webhook endpoint returned unexpected status: ' + res.status)
      }
    } catch (err: any) {
      setError('Failed to test webhook: ' + err.message)
    }
  }

  if (hasConnection && connectionStatus.length > 0) {
    return (
      <div className="space-y-3">
        {error && (
          <div className="p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-xs text-red-700 dark:text-red-300">
            <div className="font-medium">{error}</div>
            {errorDetails && (
              <div className="mt-1 text-red-600 dark:text-red-400">{errorDetails}</div>
            )}
          </div>
        )}
        {success && (
          <div className="p-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded text-xs text-green-700 dark:text-green-300">
            {success}
          </div>
        )}

        <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1.5">
          <p className="font-medium text-green-600 dark:text-green-400">Connected:</p>
          {connectionStatus.map((conn) => {
            // Use persisted config for display if available (preferred source)
            const displayPageName = persistedConfig?.pageName || conn.pageName || conn.pageId
            const displayIgUsername = persistedConfig?.igUsername || conn.igUsername
            
            return (
            <div key={conn.id} className="pl-2 border-l-2 border-green-200 dark:border-green-800">
              <p className="font-medium">{displayPageName}</p>
              {displayIgUsername && (
                <p className="text-slate-500">Instagram: @{displayIgUsername}</p>
              )}
              <div className="flex items-center gap-2 mt-1">
                <span className={`text-xs ${conn.triggerSubscribed ? 'text-green-600' : 'text-yellow-600'}`}>
                  {conn.triggerSubscribed ? '✓ Subscribed' : '⚠ Not subscribed'}
                </span>
                {conn.status === 'error' && conn.lastError && (
                  <span className="text-xs text-red-600" title={conn.lastError}>
                    <AlertCircle className="h-3 w-3 inline" />
                  </span>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="mt-2 h-6 text-xs"
                onClick={() => handleDisconnect(conn.id)}
                disabled={disconnecting}
              >
                {disconnecting ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Disconnect'}
              </Button>
            </div>
          ))}
        </div>

        {webhookUrl && (
          <div className="pt-2 border-t border-slate-200 dark:border-slate-700 space-y-2">
            <div className="text-xs space-y-1">
              <p className="font-medium text-slate-700 dark:text-slate-300">Webhook Configuration:</p>
              <div className="pl-2 space-y-1">
                <p className="text-slate-600 dark:text-slate-400">
                  <span className="font-medium">Callback URL:</span>{' '}
                  <code className="text-xs bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">
                    {webhookUrl}
                  </code>
                </p>
                <p className="text-slate-600 dark:text-slate-400">
                  <span className="font-medium">Verify Token:</span>{' '}
                  {webhookVerifyTokenConfigured ? (
                    <span className="text-green-600 dark:text-green-400">✓ Configured</span>
                  ) : (
                    <span className="text-yellow-600 dark:text-yellow-400">⚠ Not set</span>
                  )}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-500 mt-2">
                  Copy the Callback URL above and paste it in Meta Developers → Instagram → API Setup → Webhooks → Callback URL
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full text-xs h-7"
              onClick={handleTestWebhook}
            >
              Test Webhook
            </Button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-xs text-red-700 dark:text-red-300">
          <div className="font-medium">{error}</div>
          {errorDetails && (
            <div className="mt-1 text-red-600 dark:text-red-400">{errorDetails}</div>
          )}
        </div>
      )}
      {success && (
        <div className="p-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded text-xs text-green-700 dark:text-green-300">
          {success}
        </div>
      )}

      <div className="space-y-3">
        <div className="space-y-2">
          <label className="block text-xs font-medium">Meta Tester Token</label>
          <Input
            type="password"
            placeholder="Paste your Meta tester token here"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            className="text-xs h-8"
          />
          <p className="text-xs text-slate-500">
            Generate a tester token in Meta Developers → Tools → Graph API Explorer
          </p>
          {token.trim() && (
            <Button
              variant="outline"
              size="sm"
              className="w-full text-xs h-7 mt-2"
              onClick={handleFetchPages}
              disabled={fetchingPages}
            >
              {fetchingPages ? (
                <>
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  Fetching Pages...
                </>
              ) : (
                'Fetch Pages'
              )}
            </Button>
          )}
        </div>

        {pages.length > 0 && (
          <div className="space-y-2">
            <label className="block text-xs font-medium">
              Select Facebook Page <span className="text-red-500">*</span>
            </label>
            <Select
              value={selectedPageId}
              onChange={(e) => setSelectedPageId(e.target.value)}
              className="text-xs h-8"
            >
              <option value="">-- Select a page --</option>
              {pages.map((page) => (
                <option key={page.id} value={page.id}>
                  {page.name} — IG: {page.instagram_business_account?.username || 'None'}
                </option>
              ))}
            </Select>
            {selectedPageId && (() => {
              const selectedPage = pages.find((p) => p.id === selectedPageId)
              if (selectedPage && !selectedPage.instagram_business_account) {
                return (
                  <p className="text-xs text-red-600 dark:text-red-400">
                    ⚠️ Selected page does not have an Instagram Business Account connected. Instagram DM integration requires a page with IG connected.
                  </p>
                )
              }
              return null
            })()}
            <p className="text-xs text-slate-500">
              Select the Facebook Page and Instagram account you want to connect
            </p>
          </div>
        )}

        <div className="space-y-2">
          <label className="block text-xs font-medium">
            Webhook Verify Token <span className="text-slate-400">(optional)</span>
          </label>
          <Input
            type="text"
            placeholder="Enter webhook verify token (set in Meta app)"
            value={webhookVerifyToken}
            onChange={(e) => setWebhookVerifyToken(e.target.value)}
            className="text-xs h-8"
          />
          <p className="text-xs text-slate-500">
            Set this in Meta App → Webhooks → Verify Token. Stored in database.
          </p>
        </div>
      </div>

      {webhookUrl && (
        <div className="p-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded text-xs">
          <p className="font-medium text-blue-700 dark:text-blue-300 mb-1">Webhook URL for Meta:</p>
          <code className="text-xs bg-blue-100 dark:bg-blue-900 px-1 py-0.5 rounded break-all">
            {webhookUrl}
          </code>
          <p className="text-blue-600 dark:text-blue-400 mt-1">
            Copy this URL and paste it in Meta Developers → Instagram → API Setup → Webhooks → Callback URL
          </p>
        </div>
      )}

      <Button
        variant="default"
        size="sm"
        className="w-full text-xs h-8"
        onClick={handleConnect}
        disabled={connecting || !token.trim() || (pages.length > 0 && !selectedPageId)}
      >
        {connecting ? (
          <>
            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            Connecting...
          </>
        ) : (
          'Save & Connect'
        )}
      </Button>
    </div>
  )
}

