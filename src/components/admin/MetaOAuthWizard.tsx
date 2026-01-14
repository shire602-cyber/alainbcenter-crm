'use client'

import { useState, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { CheckCircle2, XCircle, AlertCircle, Loader2, Facebook, Instagram, ArrowRight, ArrowLeft } from 'lucide-react'

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
  createdAt?: string
  updatedAt?: string
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
  oauthFlow?: boolean
}

type WizardStep = 'login' | 'select-page' | 'confirm-ig' | 'connecting' | 'success'

export function MetaOAuthWizard({
  connections,
  hasConnection,
}: {
  connections: MetaConnection[]
  hasConnection: boolean
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [currentStep, setCurrentStep] = useState<WizardStep>('login')
  const [pages, setPages] = useState<MetaPage[]>([])
  const [selectedPageId, setSelectedPageId] = useState<string>('')
  const [selectedPage, setSelectedPage] = useState<MetaPage | null>(null)
  const [igAccount, setIgAccount] = useState<{ id: string; username: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [errorDetails, setErrorDetails] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [connectionStatus, setConnectionStatus] = useState(connections)
  const [webhookUrl, setWebhookUrl] = useState<string | null>(null)
  const [webhookVerifyToken, setWebhookVerifyToken] = useState<string | null>(null)
  const [persistedConfig, setPersistedConfig] = useState<PersistedConfig | null>(null)
  const [connectionWarnings, setConnectionWarnings] = useState<string[]>([])

  // Check for OAuth success in URL params
  useEffect(() => {
    const oauthSuccess = searchParams?.get('meta_oauth')
    if (oauthSuccess === 'success' && !hasConnection) {
      setCurrentStep('select-page')
      loadPages()
    }
  }, [searchParams, hasConnection])

  // Load status on mount
  useEffect(() => {
    const loadStatus = async () => {
      try {
        const res = await fetch('/api/integrations/meta/status')
        if (res.ok) {
          const data = await res.json()
          setConnectionStatus(data.activeConnections || data.connections || [])
          setWebhookUrl(data.webhookUrl || null)
          if (data.webhookVerifyToken) {
            setWebhookVerifyToken(data.webhookVerifyToken)
          }
          if (data.persistedConfig) {
            setPersistedConfig(data.persistedConfig)
            if (data.persistedConfig.webhookVerifyToken) {
              setWebhookVerifyToken(data.persistedConfig.webhookVerifyToken)
            }
          }
        }
      } catch (err) {
        // Silent fail
      }
    }

    loadStatus()
    if (hasConnection) {
      const interval = setInterval(loadStatus, 30000)
      return () => clearInterval(interval)
    }
  }, [hasConnection])

  const loadPages = async () => {
    setLoading(true)
    setError(null)
    setErrorDetails(null)

    try {
      const res = await fetch('/api/integrations/meta/oauth/pages')
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to fetch pages')
        setErrorDetails(data.details || data.hint || null)
        setCurrentStep('login')
        return
      }

      if (data.pages && data.pages.length > 0) {
        setPages(data.pages)
        
        // Pre-select persisted page if available
        if (persistedConfig?.pageId) {
          const persistedPage = data.pages.find((p: MetaPage) => p.id === persistedConfig.pageId)
          if (persistedPage) {
            setSelectedPageId(persistedConfig.pageId)
            setSelectedPage(persistedPage)
          }
        }
      } else {
        setError('No Facebook pages found. Please create a page first.')
        setCurrentStep('login')
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch pages')
      setErrorDetails('Network error or server unavailable')
      setCurrentStep('login')
    } finally {
      setLoading(false)
    }
  }

  const handleStartOAuth = () => {
    window.location.href = '/api/integrations/meta/start?return_url=/admin/integrations'
  }

  const handlePageSelect = async (pageId: string) => {
    setSelectedPageId(pageId)
    const page = pages.find(p => p.id === pageId)
    setSelectedPage(page || null)

    if (!page) return

    // If page has IG account, move to confirm step
    if (page.instagram_business_account) {
      setIgAccount(page.instagram_business_account)
      setCurrentStep('confirm-ig')
    } else {
      // Fetch IG account info
      setLoading(true)
      try {
        const res = await fetch(`/api/integrations/meta/oauth/page/${pageId}/instagram`)
        const data = await res.json()

        if (res.ok && data.instagram_business_account) {
          setIgAccount(data.instagram_business_account)
          setCurrentStep('confirm-ig')
        } else {
          setError(data.error || 'Instagram Business Account not found')
          setErrorDetails(data.hint || 'This page does not have an Instagram Business Account connected.')
        }
      } catch (err: any) {
        setError('Failed to fetch Instagram account')
        setErrorDetails(err.message)
      } finally {
        setLoading(false)
      }
    }
  }

  const handleConnect = async () => {
    if (!selectedPageId) {
      setError('Please select a page')
      return
    }

    setLoading(true)
    setError(null)
    setSuccess(null)
    setCurrentStep('connecting')

    try {
      const res = await fetch('/api/integrations/meta/oauth/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          pageId: selectedPageId,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to connect')
        setErrorDetails(data.details || data.hint || null)
        setConnectionWarnings([])
        setCurrentStep('confirm-ig')
        return
      }

      // Show warnings if Instagram subscription failed
      if (data.warnings && data.warnings.length > 0) {
        setConnectionWarnings(data.warnings)
      } else {
        setConnectionWarnings([])
      }

      if (data.webhookVerifyToken) {
        setWebhookVerifyToken(data.webhookVerifyToken)
      }

      const successMsg = `Connected to ${data.connection.pageName || data.connection.pageId}${data.connection.igUsername ? ` (@${data.connection.igUsername})` : ''}`
      setSuccess(successMsg)
      setError(null)
      setErrorDetails(null)
      setCurrentStep('success')

      // Refresh status
      setTimeout(() => {
        window.location.reload()
      }, 2000)
    } catch (err: any) {
      setError(err.message || 'Failed to connect')
      setErrorDetails('Network error or server unavailable')
      setCurrentStep('confirm-ig')
    } finally {
      setLoading(false)
    }
  }

  const handleDisconnect = async (connectionId: number) => {
    if (!confirm('Are you sure you want to disconnect this Meta integration?')) {
      return
    }

    setLoading(true)
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
      
      setTimeout(() => {
        window.location.reload()
      }, 1000)
    } catch (err: any) {
      setError(err.message || 'Failed to disconnect')
    } finally {
      setLoading(false)
    }
  }

  // If connected, show status view
  if (hasConnection && connectionStatus.length > 0) {
    return (
      <div className="space-y-3">
        {error && (
          <div className="p-2 bg-red-50 border border-red-200/60 rounded text-xs text-red-700 font-semibold">
            <div className="font-bold">{error}</div>
            {errorDetails && (
              <div className="mt-1 text-red-600 font-medium">{errorDetails}</div>
            )}
          </div>
        )}
        {success && (
          <div className="p-2 bg-green-50 border border-green-200/60 rounded text-xs text-green-700 font-semibold">
            {success}
          </div>
        )}

        <div className="text-xs text-slate-600 space-y-1.5 font-medium">
          <p className="font-bold text-green-700">Connected:</p>
          {connectionStatus.map((conn) => {
            const displayPageName = persistedConfig?.pageName || conn.pageName || conn.pageId
            const displayIgUsername = persistedConfig?.igUsername || conn.igUsername
            
            const pageSubscribed = conn.pageSubscriptionStatus?.subscribed ?? conn.triggerSubscribed
            const igSubscriptionStatus = conn.igSubscriptionStatus
            const igSubscribed = igSubscriptionStatus?.subscribed === true
            const igStatusUnknown = igSubscriptionStatus === null || igSubscriptionStatus === undefined
            
            return (
              <div key={conn.id} className="pl-2 border-l-2 border-green-200/60 space-y-2">
                <div>
                  <p className="font-medium">{displayPageName}</p>
                  {displayIgUsername && (
                    <p className="text-slate-500">Instagram: @{displayIgUsername}</p>
                  )}
                </div>
                
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-medium ${pageSubscribed ? 'text-green-600' : 'text-yellow-600'}`}>
                      {pageSubscribed ? '✓' : '⚠'} Facebook Page:
                    </span>
                    <span className={`text-xs ${pageSubscribed ? 'text-green-600' : 'text-yellow-600'}`}>
                      {pageSubscribed ? 'Subscribed' : 'Not subscribed'}
                    </span>
                  </div>
                </div>

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
                          ? 'Subscribed' 
                          : igStatusUnknown
                          ? 'Status unknown - verify manually'
                          : 'NOT SUBSCRIBED'}
                      </span>
                    </div>
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
                  disabled={loading}
                >
                  {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Disconnect'}
                </Button>
              </div>
            )
          })}
        </div>

        {webhookUrl && webhookVerifyToken && (
          <div className="pt-2 border-t border-slate-200/60 space-y-2 text-xs">
            <p className="font-bold text-slate-700">Webhook Configuration:</p>
            <div className="pl-2 space-y-1">
              <p className="text-slate-600 font-medium">
                <span className="font-bold">Callback URL:</span>{' '}
                <code className="text-xs bg-slate-100 px-1 py-0.5 rounded font-semibold">
                  {webhookUrl}
                </code>
              </p>
              <p className="text-slate-600 font-medium">
                <span className="font-bold">Verify Token:</span>{' '}
                <code className="text-xs bg-slate-100 px-1 py-0.5 rounded font-semibold">
                  {webhookVerifyToken}
                </code>
              </p>
            </div>
          </div>
        )}
      </div>
    )
  }

  // Wizard UI
  return (
    <div className="space-y-4">
      {error && (
        <div className="p-2 bg-red-50 border border-red-200/60 rounded text-xs text-red-700 font-semibold">
          <div className="font-bold">{error}</div>
          {errorDetails && (
            <div className="mt-1 text-red-600 font-medium">{errorDetails}</div>
          )}
        </div>
      )}
      {success && (
        <div className="p-2 bg-green-50 border border-green-200/60 rounded text-xs text-green-700 font-semibold">
          {success}
        </div>
      )}

      {/* Step 1: Login */}
      {currentStep === 'login' && (
        <div className="space-y-3">
          <div className="text-center space-y-2">
            <div className="flex justify-center gap-2">
              <Facebook className="h-8 w-8 text-blue-600" />
              <Instagram className="h-8 w-8 text-pink-600" />
            </div>
            <h3 className="text-sm font-bold">Connect Meta (Facebook + Instagram)</h3>
            <p className="text-xs text-slate-600">
              Connect your Facebook Page and Instagram Business Account to enable Instagram Direct Messages
            </p>
          </div>
          <Button
            variant="default"
            size="sm"
            className="w-full text-xs h-8"
            onClick={handleStartOAuth}
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                Connecting...
              </>
            ) : (
              <>
                <Facebook className="h-3 w-3 mr-1" />
                Connect with Facebook
              </>
            )}
          </Button>
        </div>
      )}

      {/* Step 2: Select Page */}
      {currentStep === 'select-page' && (
        <div className="space-y-3">
          <div className="text-center space-y-1">
            <h3 className="text-sm font-bold">Select Facebook Page</h3>
            <p className="text-xs text-slate-600">Choose the page with your Instagram Business Account</p>
          </div>
          
          {loading && pages.length === 0 ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
              <span className="ml-2 text-xs text-slate-600">Loading pages...</span>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <label className="block text-xs font-medium">
                  Facebook Page <span className="text-red-500">*</span>
                </label>
                <Select
                  value={selectedPageId}
                  onChange={(e) => handlePageSelect(e.target.value)}
                  className="text-xs h-8"
                >
                  <option value="">-- Select a page --</option>
                  {pages.map((page) => (
                    <option key={page.id} value={page.id}>
                      {page.name} {page.instagram_business_account ? `— IG: @${page.instagram_business_account.username}` : '— No IG'}
                    </option>
                  ))}
                </Select>
              </div>

              {selectedPageId && selectedPage && !selectedPage.instagram_business_account && (
                <div className="p-2 bg-yellow-50 border border-yellow-200/60 rounded text-xs text-yellow-700">
                  <p className="font-semibold">⚠️ No Instagram Business Account</p>
                  <p className="mt-1">This page does not have an Instagram Business Account connected. Please connect an Instagram account to this page in Meta Business Manager.</p>
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 text-xs h-7"
                  onClick={() => setCurrentStep('login')}
                >
                  <ArrowLeft className="h-3 w-3 mr-1" />
                  Back
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 text-xs h-7"
                  onClick={loadPages}
                  disabled={loading}
                >
                  {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Refresh'}
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Step 3: Confirm IG */}
      {currentStep === 'confirm-ig' && selectedPage && igAccount && (
        <div className="space-y-3">
          <div className="text-center space-y-1">
            <h3 className="text-sm font-bold">Confirm Instagram Account</h3>
            <p className="text-xs text-slate-600">Review your selection before connecting</p>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200/60 rounded space-y-2">
            <div>
              <p className="text-xs font-bold text-slate-700">Facebook Page:</p>
              <p className="text-xs text-slate-600">{selectedPage.name}</p>
            </div>
            <div>
              <p className="text-xs font-bold text-slate-700">Instagram Business Account:</p>
              <p className="text-xs text-slate-600">@{igAccount.username}</p>
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 text-xs h-7"
              onClick={() => setCurrentStep('select-page')}
            >
              <ArrowLeft className="h-3 w-3 mr-1" />
              Back
            </Button>
            <Button
              variant="default"
              size="sm"
              className="flex-1 text-xs h-7"
              onClick={handleConnect}
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  Connect
                  <ArrowRight className="h-3 w-3 ml-1" />
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Step 4: Connecting */}
      {currentStep === 'connecting' && (
        <div className="text-center space-y-2 py-4">
          <Loader2 className="h-6 w-6 animate-spin text-blue-600 mx-auto" />
          <p className="text-xs font-semibold">Connecting...</p>
          <p className="text-xs text-slate-600">Setting up webhooks and storing connection</p>
        </div>
      )}

      {/* Step 5: Success */}
      {currentStep === 'success' && (
        <div className="space-y-3">
          <div className="text-center space-y-2">
            <CheckCircle2 className="h-8 w-8 text-green-600 mx-auto" />
            <h3 className="text-sm font-bold text-green-700">Connection Successful!</h3>
            {selectedPage && igAccount && (
              <div className="p-3 bg-green-50 border border-green-200/60 rounded">
                <p className="text-xs font-semibold">{selectedPage.name}</p>
                <p className="text-xs text-slate-600">Instagram: @{igAccount.username}</p>
              </div>
            )}
          </div>

          {connectionWarnings.length > 0 && (
            <div className="p-3 bg-yellow-50 border border-yellow-200/60 rounded text-xs">
              <p className="font-bold text-yellow-800 mb-2">⚠️ Manual Webhook Setup Required:</p>
              <ul className="list-disc list-inside space-y-1 text-yellow-700">
                {connectionWarnings.map((warning, idx) => (
                  <li key={idx}>{warning}</li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-xs text-center text-slate-600">Redirecting to refresh connection status...</p>
        </div>
      )}
    </div>
  )
}
