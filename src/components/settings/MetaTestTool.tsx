'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { TestTube, Loader2, CheckCircle2, XCircle, AlertCircle, ExternalLink } from 'lucide-react'

type TestResult = {
  success: boolean
  message?: string
  error?: string
  data?: {
    fetchedFields: Record<string, string>
    contact: {
      id: number
      fullName: string
      phone: string
      email: string | null
    }
    lead: {
      id: number
      leadType: string | null
      source: string | null
    }
  }
  existing?: boolean
}

export function MetaTestTool() {
  const [leadgenId, setLeadgenId] = useState('')
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<TestResult | null>(null)

  async function handleTest() {
    if (!leadgenId.trim()) {
      setResult({
        success: false,
        error: 'Please enter a leadgen_id',
      })
      return
    }

    setTesting(true)
    setResult(null)

    try {
      const res = await fetch('/api/webhooks/meta-leads/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadgenId: leadgenId.trim() }),
      })

      const data = await res.json()
      setResult(data)
    } catch (error: any) {
      setResult({
        success: false,
        error: error.message || 'Failed to test',
      })
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-lg bg-purple-100">
            <TestTube className="h-6 w-6 text-purple-600" />
          </div>
          <div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
              Meta Lead Ads Test Tool
            </h1>
            <p className="text-muted-foreground mt-1 text-lg">
              Test Meta Lead Ads integration by fetching and ingesting a lead
            </p>
          </div>
        </div>
      </div>

      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>Fetch & Ingest Lead</CardTitle>
          <CardDescription>
            Enter a Meta leadgen_id to fetch lead details and ingest into CRM
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Leadgen ID</label>
            <Input
              value={leadgenId}
              onChange={(e) => setLeadgenId(e.target.value)}
              placeholder="e.g., 1234567890123456"
              disabled={testing}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Find this in Meta Business Manager → Leads or from webhook payload
            </p>
          </div>

          <Button onClick={handleTest} disabled={testing || !leadgenId.trim()}>
            {testing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Testing...
              </>
            ) : (
              <>
                <TestTube className="h-4 w-4 mr-2" />
                Fetch & Ingest
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {result && (
        <Card
          className={`shadow-lg ${
            result.success ? 'border-green-500' : 'border-red-500'
          }`}
        >
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {result.success ? (
                <>
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  Test Successful
                </>
              ) : (
                <>
                  <XCircle className="h-5 w-5 text-red-600" />
                  Test Failed
                </>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {result.success ? (
              <div className="space-y-6">
                <div className="p-4 bg-green-50 rounded-lg">
                  <p className="font-semibold text-green-900 mb-1">
                    {result.message || 'Lead ingested successfully!'}
                  </p>
                  {result.existing && (
                    <p className="text-sm text-green-700">
                      Note: This lead was already in the system
                    </p>
                  )}
                </div>

                {result.data && (
                  <>
                    <div>
                      <h3 className="font-semibold mb-3">Created Contact</h3>
                      <div className="p-4 bg-muted rounded-lg space-y-2">
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">ID:</span>
                          <span className="font-medium">{result.data.contact.id}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">Name:</span>
                          <span className="font-medium">{result.data.contact.fullName}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">Phone:</span>
                          <span className="font-medium">{result.data.contact.phone}</span>
                        </div>
                        {result.data.contact.email && (
                          <div className="flex justify-between">
                            <span className="text-sm text-muted-foreground">Email:</span>
                            <span className="font-medium">{result.data.contact.email}</span>
                          </div>
                        )}
                        <div className="pt-2 mt-2 border-t">
                          <a
                            href={`/leads/${result.data.lead.id}`}
                            className="text-sm text-primary hover:underline flex items-center gap-1"
                          >
                            View Lead <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                      </div>
                    </div>

                    <div>
                      <h3 className="font-semibold mb-3">Created Lead</h3>
                      <div className="p-4 bg-muted rounded-lg space-y-2">
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">ID:</span>
                          <span className="font-medium">{result.data.lead.id}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">Service:</span>
                          <span className="font-medium">{result.data.lead.leadType || 'N/A'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">Source:</span>
                          <Badge variant="secondary">{result.data.lead.source}</Badge>
                        </div>
                      </div>
                    </div>

                    {result.data.fetchedFields && Object.keys(result.data.fetchedFields).length > 0 && (
                      <div>
                        <h3 className="font-semibold mb-3">Fetched Lead Fields</h3>
                        <div className="p-4 bg-muted rounded-lg">
                          <div className="space-y-2">
                            {Object.entries(result.data.fetchedFields).map(([key, value]) => (
                              <div key={key} className="flex justify-between text-sm">
                                <span className="text-muted-foreground font-mono">{key}:</span>
                                <span className="font-medium">{value}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            ) : (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
                  <div>
                    <p className="font-semibold text-red-900 mb-1">Error</p>
                    <p className="text-sm text-red-700">
                      {result.error || 'Unknown error occurred'}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}








