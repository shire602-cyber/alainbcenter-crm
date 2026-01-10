'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { CheckCircle2, XCircle, AlertCircle, Loader2 } from 'lucide-react'

interface PageSubscriptionStatus {
  subscribed: boolean
  fields: string[]
}

interface InstagramSubscriptionStatus {
  subscribed: boolean
  fields: string[]
}

interface MetaConnection {
  id: number
  pageId: string
  pageName: string | null
  igUsername: string | null
  igBusinessId?: string | null
  triggerSubscribed: boolean
  pageSubscriptionStatus?: PageSubscriptionStatus | null
  igSubscriptionStatus?: InstagramSubscriptionStatus | null
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
  const [storedWebhookVerifyToken, setStoredWebhookVerifyToken] = useState<string | null>(null)
  const [checkingSubscription, setCheckingSubscription] = useState(false)
  const [testingVerification, setTestingVerification] = useState(false)
  const [verificationTestResults, setVerificationTestResults] = useState<any>(null)
  const [viewingWebhookEvents, setViewingWebhookEvents] = useState(false)
  const [webhookEvents, setWebhookEvents] = useState<any>(null)
  const [showTroubleshooting, setShowTroubleshooting] = useState(false)
  
  // Page selection state
  const [pages, setPages] = useState<MetaPage[]>([])
  const [selectedPageId, setSelectedPageId] = useState<string>('')
  const [fetchingPages, setFetchingPages] = useState(false)
  const [persistedConfig, setPersistedConfig] = useState<PersistedConfig | null>(null)
  
  // Connection warnings from connect response
  const [connectionWarnings, setConnectionWarnings] = useState<string[]>([])

  // Load status on mount and refresh periodically
  useEffect(() => {
    const loadStatus = async () => {
      try {
        const res = await fetch('/api/integrations/meta/status')
        if (res.ok) {
          const data = await res.json()
          setConnectionStatus(data.activeConnections || data.connections || [])
          setWebhookUrl(data.webhookUrl || null)
          setWebhookVerifyTokenConfigured(data.webhookVerifyTokenConfigured || false)
          
          // Get verify token from top-level response or persisted config
          if (data.webhookVerifyToken) {
            setStoredWebhookVerifyToken(data.webhookVerifyToken)
          } else if (data.persistedConfig && data.persistedConfig.webhookVerifyToken) {
            setStoredWebhookVerifyToken(data.persistedConfig.webhookVerifyToken)
          }
          
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
        setConnectionWarnings([])
        return
      }

      // Store verify token from response (auto-generated or provided)
      if (data.webhookVerifyToken) {
        setStoredWebhookVerifyToken(data.webhookVerifyToken)
      }

      // Show warnings if Instagram subscription failed
      if (data.warnings && data.warnings.length > 0) {
        setConnectionWarnings(data.warnings)
      } else {
        setConnectionWarnings([])
      }

      const successMsg = `Connected to ${data.connection.pageName || data.connection.pageId}${data.connection.igUsername ? ` (@${data.connection.igUsername})` : ''}`
      const subscriptionMsg = data.connection.igSubscribed 
        ? ' Instagram webhook subscribed.' 
        : ' ⚠️ Instagram webhook subscription failed - manual setup required.'
      
      setSuccess(successMsg + subscriptionMsg)
      setError(null)
      setErrorDetails(null)
      setToken('')
      setWebhookVerifyToken('') // Clear input after successful connection
      setPages([])
      setSelectedPageId('')
      
      // Refresh status
      const statusRes = await fetch('/api/integrations/meta/status')
      if (statusRes.ok) {
        const statusData = await statusRes.json()
        setConnectionStatus(statusData.activeConnections || statusData.connections || [])
        setWebhookUrl(statusData.webhookUrl || null)
        setWebhookVerifyTokenConfigured(statusData.webhookVerifyTokenConfigured || false)
        // Update stored verify token from persisted config
        if (statusData.persistedConfig?.webhookVerifyToken) {
          setStoredWebhookVerifyToken(statusData.persistedConfig.webhookVerifyToken)
        }
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

  const [testingWebhook, setTestingWebhook] = useState(false)
  const [webhookTestResults, setWebhookTestResults] = useState<any>(null)

  const handleTestWebhook = async () => {
    setTestingWebhook(true)
    setError(null)
    setSuccess(null)
    setWebhookTestResults(null)

    try {
      // First, get comprehensive diagnostic info
      const testRes = await fetch('/api/integrations/meta/test-webhook-url')
      if (testRes.ok) {
        const testData = await testRes.json()
        setWebhookTestResults(testData)
        
        if (testData.webhookAccessible) {
          setSuccess('✅ Webhook URL is accessible and responding correctly')
        } else {
          setError(`⚠️ Webhook URL is not accessible: ${testData.webhookError || 'Unknown error'}`)
        }
      } else {
        // Fallback: direct healthcheck
        const res = await fetch('/api/webhooks/meta', {
          method: 'GET',
        })
        
        if (res.status === 200) {
          const data = await res.json()
          if (data.ok && data.mode === 'healthcheck') {
            setSuccess('✅ Webhook endpoint is reachable and healthy')
            setError(null)
          } else {
            setSuccess('✅ Webhook endpoint is reachable')
            setError(null)
          }
        } else {
          setError(`Webhook endpoint returned status ${res.status}`)
          setSuccess(null)
        }
      }
    } catch (err: any) {
      setError('Failed to test webhook: ' + err.message)
      setSuccess(null)
    } finally {
      setTestingWebhook(false)
    }
  }

  const handleTestWebhookVerification = async () => {
    setTestingVerification(true)
    setError(null)
    setSuccess(null)
    setVerificationTestResults(null)

    try {
      const res = await fetch('/api/integrations/meta/test-webhook-verification')
      const data = await res.json()
      setVerificationTestResults(data)
      
      if (data.verificationSuccess) {
        setSuccess('✅ Webhook verification test PASSED - Meta should be able to verify your webhook')
      } else {
        setError(`⚠️ Webhook verification test failed: ${data.explanation || 'Unknown error'}`)
      }
    } catch (err: any) {
      setError('Failed to test webhook verification: ' + err.message)
    } finally {
      setTestingVerification(false)
    }
  }

  const handleViewWebhookEvents = async () => {
    setViewingWebhookEvents(true)
    setError(null)
    setSuccess(null)

    try {
      const igBusinessId = connectionStatus[0]?.igBusinessId
      const url = `/api/integrations/meta/webhook-events${igBusinessId ? `?igBusinessId=${igBusinessId}&limit=20` : '?limit=20'}`
      const res = await fetch(url)
      const data = await res.json()
      setWebhookEvents(data)
      
      if (data.events && data.events.length > 0) {
        setSuccess(`✅ Found ${data.events.length} recent webhook event(s)`)
      } else {
        setSuccess('ℹ️ No webhook events found yet. If you just configured the webhook, wait a few minutes and check again.')
      }
    } catch (err: any) {
      setError('Failed to fetch webhook events: ' + err.message)
    } finally {
      setViewingWebhookEvents(false)
    }
  }

  const handleCheckSubscriptionStatus = async () => {
    setCheckingSubscription(true)
    setError(null)
    setSuccess(null)
    
    try {
      const res = await fetch('/api/integrations/meta/diagnostics')
      if (res.ok) {
        const data = await res.json()
        
        if (data.instagramSubscriptionStatus?.subscribed) {
          setSuccess('✅ Instagram Business Account is subscribed to webhooks!')
        } else if (data.instagramSubscriptionStatus === null) {
          setSuccess('⚠️ Subscription status cannot be verified via API. Please verify manually in Meta Developer Console or by sending a test DM.')
        } else {
          setError('❌ Instagram Business Account is not subscribed. Please complete manual setup in Meta Developer Console.')
        }
        
        // Refresh status to show updated subscription info
        const statusRes = await fetch('/api/integrations/meta/status')
        if (statusRes.ok) {
          const statusData = await statusRes.json()
          setConnectionStatus(statusData.activeConnections || statusData.connections || [])
        }
      } else {
        setError('Failed to check subscription status')
      }
    } catch (err: any) {
      setError('Failed to check subscription status: ' + err.message)
    } finally {
      setCheckingSubscription(false)
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

        {connectionWarnings.length > 0 && (
          <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded text-xs">
            <p className="font-medium text-yellow-800 dark:text-yellow-200 mb-2">⚠️ Instagram Webhook Setup Required:</p>
            <ul className="list-disc list-inside space-y-1 text-yellow-700 dark:text-yellow-300">
              {connectionWarnings.map((warning, idx) => {
                // If warning contains verify token, make it copyable
                if (warning.includes('Verify Token:')) {
                  const parts = warning.split('Verify Token: ')
                  return (
                    <li key={idx}>
                      {parts[0]}Verify Token:{' '}
                      {parts[1] && (
                        <span className="inline-flex items-center gap-1">
                          <code className="bg-yellow-100 dark:bg-yellow-900 px-1 rounded font-mono">
                            {parts[1]}
                          </code>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(parts[1])
                              setSuccess('Verify token copied!')
                              setTimeout(() => setSuccess(null), 2000)
                            }}
                            className="text-xs px-1 py-0.5 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded hover:bg-blue-200 dark:hover:bg-blue-800"
                          >
                            Copy
                          </button>
                        </span>
                      )}
                    </li>
                  )
                }
                return <li key={idx}>{warning}</li>
              })}
            </ul>
          </div>
        )}

        <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1.5">
          <p className="font-medium text-green-600 dark:text-green-400">Connected:</p>
          {connectionStatus.map((conn) => {
            // Use persisted config for display if available (preferred source)
            const displayPageName = persistedConfig?.pageName || conn.pageName || conn.pageId
            const displayIgUsername = persistedConfig?.igUsername || conn.igUsername
            
            const pageSubscribed = conn.pageSubscriptionStatus?.subscribed ?? conn.triggerSubscribed
            const igSubscriptionStatus = conn.igSubscriptionStatus
            const igSubscribed = igSubscriptionStatus?.subscribed === true
            const igStatusUnknown = igSubscriptionStatus === null || igSubscriptionStatus === undefined // API check not supported
            const pageFields = conn.pageSubscriptionStatus?.fields || []
            const igFields = igSubscriptionStatus?.fields || []
            
            return (
              <div key={conn.id} className="pl-2 border-l-2 border-green-200 dark:border-green-800 space-y-2">
                <div>
                  <p className="font-medium">{displayPageName}</p>
                  {displayIgUsername && (
                    <p className="text-slate-500">Instagram: @{displayIgUsername}</p>
                  )}
                </div>
                
                {/* Page Subscription Status */}
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-medium ${pageSubscribed ? 'text-green-600' : 'text-yellow-600'}`}>
                      {pageSubscribed ? '✓' : '⚠'} Facebook Page:
                    </span>
                    <span className={`text-xs ${pageSubscribed ? 'text-green-600' : 'text-yellow-600'}`}>
                      {pageSubscribed ? `Subscribed (${pageFields.length} fields)` : 'Not subscribed'}
                    </span>
                  </div>
                  {pageFields.length > 0 && (
                    <p className="text-xs text-slate-500 pl-4">Fields: {pageFields.join(', ')}</p>
                  )}
                </div>

                {/* Instagram Subscription Status */}
                {conn.igBusinessId && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-medium ${
                        igSubscribed ? 'text-green-600' : 
                        igStatusUnknown ? 'text-yellow-600' : 
                        'text-red-600'
                      }`}>
                        {igSubscribed ? '✓' : igStatusUnknown ? '⚠' : '❌'} Instagram Business Account:
                      </span>
                      <span className={`text-xs ${
                        igSubscribed ? 'text-green-600' : 
                        igStatusUnknown ? 'text-yellow-600' : 
                        'text-red-600'
                      }`}>
                        {igSubscribed 
                          ? `Subscribed (${igFields.length} fields)` 
                          : igStatusUnknown
                          ? 'Status unknown - verify manually or check if DMs are received'
                          : 'NOT SUBSCRIBED - DMs will not be received'}
                      </span>
                    </div>
                    {igFields.length > 0 && (
                      <p className="text-xs text-slate-500 pl-4">Fields: {igFields.join(', ')}</p>
                    )}
                    {(!igSubscribed || igStatusUnknown) && (
                      <div className={`mt-2 p-3 border rounded text-xs ${
                        igStatusUnknown 
                          ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800' 
                          : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                      }`}>
                        <p className={`font-medium mb-2 ${
                          igStatusUnknown
                            ? 'text-yellow-800 dark:text-yellow-200'
                            : 'text-red-800 dark:text-red-200'
                        }`}>
                          {igStatusUnknown ? '⚠️ Manual Verification Required:' : 'Manual Setup Required:'}
                        </p>
                        <ol className={`list-decimal list-inside space-y-1 ${
                          igStatusUnknown
                            ? 'text-yellow-700 dark:text-yellow-300'
                            : 'text-red-700 dark:text-red-300'
                        }`}>
                          <li>
                            Go to{' '}
                            <a 
                              href="https://developers.facebook.com/apps/" 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="underline font-medium"
                            >
                              Meta Developers → Your App → Instagram → Webhooks
                            </a>
                          </li>
                          <li className="flex items-center gap-2">
                            <span>Add Webhook URL:</span>
                            <code className={`px-2 py-0.5 rounded font-mono text-xs ${
                              igStatusUnknown
                                ? 'bg-yellow-100 dark:bg-yellow-900'
                                : 'bg-red-100 dark:bg-red-900'
                            }`}>
                              {webhookUrl || '[your webhook URL]'}
                            </code>
                            {webhookUrl && (
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(webhookUrl)
                                  setSuccess('Webhook URL copied to clipboard!')
                                  setTimeout(() => setSuccess(null), 2000)
                                }}
                                className="text-xs px-2 py-0.5 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded hover:bg-blue-200 dark:hover:bg-blue-800"
                              >
                                Copy
                              </button>
                            )}
                          </li>
                          <li className="flex items-center gap-2">
                            <span>Set Verify Token:</span>
                            <code className={`px-2 py-0.5 rounded font-mono text-xs ${
                              igStatusUnknown
                                ? 'bg-yellow-100 dark:bg-yellow-900'
                                : 'bg-red-100 dark:bg-red-900'
                            }`}>
                              {storedWebhookVerifyToken || webhookVerifyToken || '[your verify token]'}
                            </code>
                            {(storedWebhookVerifyToken || webhookVerifyToken) && (
                              <button
                                onClick={() => {
                                  const tokenToCopy = storedWebhookVerifyToken || webhookVerifyToken
                                  if (tokenToCopy) {
                                    navigator.clipboard.writeText(tokenToCopy)
                                    setSuccess('Verify token copied to clipboard!')
                                    setTimeout(() => setSuccess(null), 2000)
                                  }
                                }}
                                className="text-xs px-2 py-0.5 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded hover:bg-blue-200 dark:hover:bg-blue-800"
                              >
                                Copy
                              </button>
                            )}
                          </li>
                          <li>Subscribe to: <code className={`px-1 rounded ${
                            igStatusUnknown
                              ? 'bg-yellow-100 dark:bg-yellow-900'
                              : 'bg-red-100 dark:bg-red-900'
                          }`}>messages, messaging_postbacks</code></li>
                          <li>Click &quot;Verify and Save&quot;</li>
                          <li>
                            <button
                              onClick={handleCheckSubscriptionStatus}
                              disabled={checkingSubscription}
                              className="mt-1 text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {checkingSubscription ? 'Checking...' : 'Verify Setup After Manual Configuration'}
                            </button>
                          </li>
                        </ol>
                      </div>
                    )}
                  </div>
                )}

                {conn.status === 'error' && conn.lastError && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-red-600" title={conn.lastError}>
                      <AlertCircle className="h-3 w-3 inline" /> Error
                    </span>
                  </div>
                )}
                
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
            )
          })}
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
                <div className="space-y-1">
                  <p className="text-slate-600 dark:text-slate-400">
                    <span className="font-medium">Verify Token:</span>{' '}
                    {webhookVerifyTokenConfigured || storedWebhookVerifyToken ? (
                      <span className="text-green-600 dark:text-green-400">✓ Configured</span>
                    ) : (
                      <span className="text-yellow-600 dark:text-yellow-400">⚠ Not set</span>
                    )}
                  </p>
                  {storedWebhookVerifyToken && (
                    <div className="flex items-center gap-2">
                      <code className="text-xs bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded font-mono flex-1 truncate">
                        {storedWebhookVerifyToken}
                      </code>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(storedWebhookVerifyToken)
                          setSuccess('Verify token copied to clipboard!')
                          setTimeout(() => setSuccess(null), 2000)
                        }}
                        className="text-xs px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded hover:bg-blue-200 dark:hover:bg-blue-800"
                      >
                        Copy
                      </button>
                    </div>
                  )}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-500 mt-2">
                  Copy the Callback URL above and paste it in Meta Developers → Instagram → API Setup → Webhooks → Callback URL
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 text-xs h-7"
                onClick={handleTestWebhook}
                disabled={testingWebhook}
              >
                {testingWebhook ? (
                  <>
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    Testing...
                  </>
                ) : (
                  'Test Webhook URL'
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1 text-xs h-7"
                onClick={handleCheckSubscriptionStatus}
                disabled={checkingSubscription}
              >
                {checkingSubscription ? (
                  <>
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    Checking...
                  </>
                ) : (
                  'Check Subscription'
                )}
              </Button>
            </div>
            {webhookTestResults && (
              <div className="mt-3 p-3 bg-slate-50 dark:bg-slate-900 border rounded text-xs">
                <p className="font-medium mb-2">Webhook Diagnostic Results:</p>
                <div className="space-y-1 text-xs">
                  <p><span className="font-medium">URL:</span> <code className="bg-slate-200 dark:bg-slate-800 px-1 rounded">{webhookTestResults.webhookUrl}</code></p>
                  <p><span className="font-medium">Accessible:</span> {webhookTestResults.webhookAccessible ? '✅ Yes' : '❌ No'}</p>
                  {webhookTestResults.webhookResponse && (
                    <p><span className="font-medium">Response Status:</span> {webhookTestResults.webhookResponse.status}</p>
                  )}
                  {webhookTestResults.webhookError && (
                    <p className="text-red-600"><span className="font-medium">Error:</span> {webhookTestResults.webhookError}</p>
                  )}
                  <p><span className="font-medium">Verify Token:</span> {webhookTestResults.verifyTokenConfigured ? '✅ Configured' : '❌ Not Set'}</p>
                  {webhookTestResults.environment && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs text-slate-600 dark:text-slate-400">Environment Info</summary>
                      <pre className="mt-1 p-2 bg-slate-100 dark:bg-slate-800 rounded text-xs overflow-auto">
                        {JSON.stringify(webhookTestResults.environment, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              </div>
            )}

            {/* Meta Console Configuration Checklist */}
            <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-100">
                  📋 Meta Developer Console Configuration Checklist
                </h4>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs h-7"
                  onClick={handleTestWebhookVerification}
                  disabled={testingVerification}
                >
                  {testingVerification ? (
                    <>
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      Testing...
                    </>
                  ) : (
                    'Test Verification'
                  )}
                </Button>
              </div>
              
              <div className="space-y-2 text-xs">
                <div className="flex items-start gap-2">
                  <span className="mt-0.5">1️⃣</span>
                  <div className="flex-1">
                    <p className="font-medium">Go to Meta Developer Console</p>
                    <p className="text-slate-600 dark:text-slate-400">Meta Developers → Your App → Instagram → Webhooks</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <span className="mt-0.5">2️⃣</span>
                  <div className="flex-1">
                    <p className="font-medium">Enter Webhook URL (exact copy):</p>
                    <code className="block mt-1 p-1.5 bg-white dark:bg-slate-800 rounded text-xs break-all">
                      {webhookUrl || '[your webhook URL]'}
                    </code>
                    <p className="text-red-600 dark:text-red-400 mt-1">⚠️ Must include https:// - no trailing slash</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <span className="mt-0.5">3️⃣</span>
                  <div className="flex-1">
                    <p className="font-medium">Enter Verify Token (exact copy, case-sensitive):</p>
                    <code className="block mt-1 p-1.5 bg-white dark:bg-slate-800 rounded text-xs break-all">
                      {storedWebhookVerifyToken || webhookVerifyToken || '[your verify token]'}
                    </code>
                    <p className="text-red-600 dark:text-red-400 mt-1">⚠️ Case-sensitive - copy exactly, no extra spaces</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <span className="mt-0.5">4️⃣</span>
                  <div className="flex-1">
                    <p className="font-medium">Subscribe to these fields:</p>
                    <code className="block mt-1 p-1.5 bg-white dark:bg-slate-800 rounded text-xs">
                      messages, messaging_postbacks
                    </code>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <span className="mt-0.5">5️⃣</span>
                  <div className="flex-1">
                    <p className="font-medium">Click &quot;Verify and Save&quot;</p>
                    <p className="text-slate-600 dark:text-slate-400">Meta will test the webhook - use &quot;Test Verification&quot; button above to simulate this</p>
                  </div>
                </div>
              </div>

              {verificationTestResults && (
                <div className={`mt-3 p-3 rounded text-xs ${
                  verificationTestResults.verificationSuccess
                    ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                    : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
                }`}>
                  <p className={`font-medium mb-1 ${
                    verificationTestResults.verificationSuccess
                      ? 'text-green-800 dark:text-green-200'
                      : 'text-red-800 dark:text-red-200'
                  }`}>
                    Verification Test Result:
                  </p>
                  <p className={verificationTestResults.verificationSuccess ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}>
                    {verificationTestResults.explanation}
                  </p>
                  {verificationTestResults.verificationResult && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs">Technical Details</summary>
                      <pre className="mt-1 p-2 bg-white dark:bg-slate-800 rounded text-xs overflow-auto max-h-40">
                        {JSON.stringify(verificationTestResults.verificationResult, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              )}

              {/* Webhook Events Viewer */}
              <div className="mt-4 pt-4 border-t border-blue-300 dark:border-blue-700">
                <div className="flex items-center justify-between mb-2">
                  <h5 className="text-xs font-semibold text-blue-900 dark:text-blue-100">
                    Recent Webhook Events
                  </h5>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs h-7"
                    onClick={handleViewWebhookEvents}
                    disabled={viewingWebhookEvents}
                  >
                    {viewingWebhookEvents ? (
                      <>
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        Loading...
                      </>
                    ) : (
                      'View Events'
                    )}
                  </Button>
                </div>
                
                {webhookEvents && (
                  <div className="mt-2 text-xs">
                    {webhookEvents.events && webhookEvents.events.length > 0 ? (
                      <div className="space-y-2 max-h-60 overflow-y-auto">
                        {webhookEvents.events.slice(0, 5).map((event: any) => (
                          <div key={event.id} className="p-2 bg-white dark:bg-slate-800 rounded border">
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-medium text-xs">{event.payloadObject || event.eventType}</span>
                              <span className="text-slate-500 text-xs">
                                {new Date(event.createdAt).toLocaleString()}
                              </span>
                            </div>
                            {event.messagePreview && (
                              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                                Message from: {event.messagePreview.from} - {event.messagePreview.text}
                              </p>
                            )}
                            {event.payloadPreview && (
                              <details className="mt-1">
                                <summary className="cursor-pointer text-xs text-slate-500">Payload Preview</summary>
                                <pre className="mt-1 p-1 bg-slate-100 dark:bg-slate-900 rounded text-xs overflow-auto max-h-32">
                                  {JSON.stringify(event.payloadPreview, null, 2)}
                                </pre>
                              </details>
                            )}
                          </div>
                        ))}
                        {webhookEvents.events.length > 5 && (
                          <p className="text-xs text-slate-500 text-center">
                            Showing 5 of {webhookEvents.total} events
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-600 dark:text-slate-400">
                        {webhookEvents.message || 'No webhook events found yet. If you just configured the webhook, wait a few minutes after sending a test DM.'}
                      </p>
                    )}
                    {webhookEvents.stats && (
                      <div className="mt-2 pt-2 border-t text-xs text-slate-500">
                        Total: {webhookEvents.stats.total} | Last 24h: {webhookEvents.stats.recent24h}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Troubleshooting Guide */}
              <div className="mt-4 pt-4 border-t border-blue-300 dark:border-blue-700">
                <button
                  onClick={() => setShowTroubleshooting(!showTroubleshooting)}
                  className="w-full text-left text-xs font-semibold text-blue-900 dark:text-blue-100 flex items-center justify-between"
                >
                  <span>🔧 Troubleshooting Guide</span>
                  <span>{showTroubleshooting ? '▼' : '▶'}</span>
                </button>
                {showTroubleshooting && (
                  <div className="mt-2 space-y-3 text-xs">
                    <div>
                      <p className="font-medium text-red-700 dark:text-red-300 mb-1">❌ No webhook events received:</p>
                      <ul className="list-disc list-inside space-y-1 text-slate-600 dark:text-slate-400 ml-2">
                        <li>Verify webhook URL is EXACT (including https://, no trailing slash)</li>
                        <li>Verify token matches EXACTLY (case-sensitive, no extra spaces)</li>
                        <li>Make sure you clicked &quot;Verify and Save&quot; in Meta Console</li>
                        <li>Check that you subscribed to &quot;messages&quot; and &quot;messaging_postbacks&quot;</li>
                        <li>Wait 2-3 minutes after configuration for Meta to activate webhook</li>
                        <li>Send a test DM from a different Instagram account</li>
                      </ul>
                    </div>
                    <div>
                      <p className="font-medium text-yellow-700 dark:text-yellow-300 mb-1">⚠️ Verification fails:</p>
                      <ul className="list-disc list-inside space-y-1 text-slate-600 dark:text-slate-400 ml-2">
                        <li>Use the &quot;Test Verification&quot; button above to diagnose</li>
                        <li>Check that verify token is configured in your system</li>
                        <li>Check Vercel logs for verification errors</li>
                        <li>Make sure webhook URL is publicly accessible (not localhost)</li>
                      </ul>
                    </div>
                    <div>
                      <p className="font-medium text-blue-700 dark:text-blue-300 mb-1">ℹ️ Events received but no DMs in inbox:</p>
                      <ul className="list-disc list-inside space-y-1 text-slate-600 dark:text-slate-400 ml-2">
                        <li>Check &quot;View Events&quot; above to see if events are arriving</li>
                        <li>Check Vercel logs for [META-WEBHOOK-INSTAGRAM-DEBUG] entries</li>
                        <li>Verify connection is active (check connection status above)</li>
                        <li>Check that IG Business Account ID matches in events</li>
                      </ul>
                    </div>
                    <div>
                      <p className="font-medium text-green-700 dark:text-green-300 mb-1">✅ Testing your setup:</p>
                      <ol className="list-decimal list-inside space-y-1 text-slate-600 dark:text-slate-400 ml-2">
                        <li>Click &quot;Test Verification&quot; - should pass if token is correct</li>
                        <li>Send a DM to your Instagram account from another account</li>
                        <li>Click &quot;View Events&quot; - should show recent webhook events</li>
                        <li>Check Vercel logs - should show POST requests to /api/webhooks/meta</li>
                        <li>DM should appear in Inbox after successful processing</li>
                      </ol>
                    </div>
                  </div>
                )}
              </div>
            </div>
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

