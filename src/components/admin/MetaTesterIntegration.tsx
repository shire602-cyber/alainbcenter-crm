'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
  const [success, setSuccess] = useState<string | null>(null)
  const [connectionStatus, setConnectionStatus] = useState(connections)

  // Refresh status periodically
  useEffect(() => {
    if (hasConnection) {
      const interval = setInterval(async () => {
        try {
          const res = await fetch('/api/integrations/meta/status')
          if (res.ok) {
            const data = await res.json()
            setConnectionStatus(data.connections || [])
          }
        } catch (err) {
          // Silent fail
        }
      }, 30000) // Every 30 seconds

      return () => clearInterval(interval)
    }
  }, [hasConnection])

  const handleConnect = async () => {
    if (!token.trim()) {
      setError('Please enter a Meta tester token')
      return
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
          webhookVerifyToken: webhookVerifyToken.trim() || undefined,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to connect')
        return
      }

      setSuccess(`Connected to ${data.connection.pageName || data.connection.pageId}${data.connection.igUsername ? ` (@${data.connection.igUsername})` : ''}`)
      setToken('')
      setWebhookVerifyToken('') // Clear after successful connection
      
      // Refresh status
      const statusRes = await fetch('/api/integrations/meta/status')
      if (statusRes.ok) {
        const statusData = await statusRes.json()
        setConnectionStatus(statusData.connections || [])
      }

      // Reload page after 2 seconds to show updated state
      setTimeout(() => {
        window.location.reload()
      }, 2000)
    } catch (err: any) {
      setError(err.message || 'Failed to connect')
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
            {error}
          </div>
        )}
        {success && (
          <div className="p-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded text-xs text-green-700 dark:text-green-300">
            {success}
          </div>
        )}

        <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1.5">
          <p className="font-medium text-green-600 dark:text-green-400">Connected:</p>
          {connectionStatus.map((conn) => (
            <div key={conn.id} className="pl-2 border-l-2 border-green-200 dark:border-green-800">
              <p className="font-medium">{conn.pageName || conn.pageId}</p>
              {conn.igUsername && (
                <p className="text-slate-500">Instagram: @{conn.igUsername}</p>
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

        <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
          <Button
            variant="outline"
            size="sm"
            className="w-full text-xs h-7"
            onClick={handleTestWebhook}
          >
            Test Webhook
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-xs text-red-700 dark:text-red-300">
          {error}
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
        </div>

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

      <Button
        variant="default"
        size="sm"
        className="w-full text-xs h-8"
        onClick={handleConnect}
        disabled={connecting || !token.trim()}
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

