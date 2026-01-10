'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Facebook, CheckCircle2, XCircle, Eye, EyeOff, AlertCircle, Info } from 'lucide-react'

export function MetaIntegrationSettings() {
  const [config, setConfig] = useState({
    verifyToken: '',
    appSecret: '',
    pageAccessToken: '',
  })
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({
    verifyToken: false,
    appSecret: false,
    pageAccessToken: false,
  })
  const [status, setStatus] = useState<{
    verifyToken: boolean
    appSecret: boolean
    pageAccessToken: boolean
  }>({
    verifyToken: false,
    appSecret: false,
    pageAccessToken: false,
  })
  const [webhookUrl, setWebhookUrl] = useState('')

  useEffect(() => {
    checkEnvVars()
    if (typeof window !== 'undefined') {
      setWebhookUrl(`${window.location.origin}/api/webhooks/meta-leads`)
    }
  }, [])

  function checkEnvVars() {
    setStatus({
      verifyToken: !!process.env.NEXT_PUBLIC_META_VERIFY_TOKEN,
      appSecret: !!process.env.NEXT_PUBLIC_META_APP_SECRET,
      pageAccessToken: !!process.env.NEXT_PUBLIC_META_PAGE_ACCESS_TOKEN,
    })
  }

  function toggleSecret(field: string) {
    setShowSecrets((prev) => ({ ...prev, [field]: !prev[field] }))
  }

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-lg bg-blue-100">
            <Facebook className="h-6 w-6 text-blue-600" />
          </div>
          <div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              Meta Lead Ads Integration
            </h1>
            <p className="text-muted-foreground mt-1 text-lg">
              Connect Facebook and Instagram Lead Ads for automatic lead capture
            </p>
          </div>
        </div>
      </div>

      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>Configuration Status</CardTitle>
          <CardDescription>
            Configure these settings in your .env file or Meta Business Manager
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 border rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium">Verify Token</span>
                <Badge variant={status.verifyToken ? 'success' : 'secondary'}>
                  {status.verifyToken ? (
                    <>
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Configured
                    </>
                  ) : (
                    <>
                      <XCircle className="h-3 w-3 mr-1" />
                      Not Set
                    </>
                  )}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">META_VERIFY_TOKEN</p>
            </div>

            <div className="p-4 border rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium">App Secret</span>
                <Badge variant={status.appSecret ? 'success' : 'secondary'}>
                  {status.appSecret ? (
                    <>
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Configured
                    </>
                  ) : (
                    <>
                      <XCircle className="h-3 w-3 mr-1" />
                      Not Set
                    </>
                  )}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">META_APP_SECRET</p>
            </div>

            <div className="p-4 border rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium">Page Access Token</span>
                <Badge variant={status.pageAccessToken ? 'success' : 'secondary'}>
                  {status.pageAccessToken ? (
                    <>
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Configured
                    </>
                  ) : (
                    <>
                      <XCircle className="h-3 w-3 mr-1" />
                      Not Set
                    </>
                  )}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">META_PAGE_ACCESS_TOKEN</p>
            </div>
          </div>

          <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-start gap-3">
              <Info className="h-5 w-5 text-blue-600 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold text-blue-900 mb-2">
                  Webhook Callback URL
                </p>
                <code className="block p-2 bg-white rounded text-sm mb-2 break-all">
                  {webhookUrl || 'Loading...'}
                </code>
                <p className="text-sm text-blue-700">
                  Use this URL when setting up your webhook in Meta Business Manager
                </p>
              </div>
            </div>
          </div>

          <div className="mt-6 p-4 bg-muted rounded-lg">
            <p className="font-semibold mb-2">Setup Instructions:</p>
            <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
              <li>Go to Meta Business Manager → Webhooks</li>
              <li>Create a new webhook subscription for "Leadgen" events</li>
              <li>Set Callback URL to the URL shown above</li>
              <li>Set Verify Token to your META_VERIFY_TOKEN value</li>
              <li>Add required environment variables to your .env file</li>
            </ol>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>Environment Variables</CardTitle>
          <CardDescription>
            Add these to your .env file (restart server after changes)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">META_VERIFY_TOKEN</label>
              <code className="block p-3 bg-muted rounded text-sm">
                META_VERIFY_TOKEN=your_verify_token_here
              </code>
              <p className="text-xs text-muted-foreground mt-1">
                Used for webhook verification handshake
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">META_APP_SECRET</label>
              <code className="block p-3 bg-muted rounded text-sm">
                META_APP_SECRET=your_app_secret_here
              </code>
              <p className="text-xs text-muted-foreground mt-1">
                Used to verify webhook signatures
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">META_PAGE_ACCESS_TOKEN</label>
              <code className="block p-3 bg-muted rounded text-sm">
                META_PAGE_ACCESS_TOKEN=your_page_access_token_here
              </code>
              <p className="text-xs text-muted-foreground mt-1">
                Used to fetch lead details from Meta Graph API
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-lg">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold mb-1">Test Integration</h3>
              <p className="text-sm text-muted-foreground">
                Use the test tool to manually ingest a lead by leadgen_id
              </p>
            </div>
            <Button asChild>
              <a href="/settings/integrations/meta/test">Open Test Tool →</a>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}



