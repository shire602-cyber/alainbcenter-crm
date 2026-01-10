'use client'

/**
 * Conversation Debug Panel (Admin Only)
 * 
 * Shows diagnostic information for verifying:
 * - Single conversation per contact+channel+externalThreadId
 * - State machine transitions
 * - Deduplication keys
 * - Lead auto-fill status
 */

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { RefreshCw, AlertCircle } from 'lucide-react'

interface ConversationDebugData {
  conversationId: number | null
  externalThreadId: string | null
  stateVersion: number
  qualificationStage: string | null
  questionsAskedCount: number
  lastQuestionKey: string | null
  knownFields: Record<string, any>
  last5OutboundDedupes: Array<{
    dedupeKey: string
    timestamp: string
    messageId: number
    body: string
  }>
  leadFields: {
    serviceTypeEnum: string | null
    serviceTypeId: number | null
    requestedServiceRaw: string | null
    nationality: string | null
  }
}

interface ConversationDebugPanelProps {
  leadId: number
  isAdmin: boolean
}

export function ConversationDebugPanel({ leadId, isAdmin }: ConversationDebugPanelProps) {
  const [data, setData] = useState<ConversationDebugData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadData = async () => {
    if (!isAdmin) return
    
    setLoading(true)
    setError(null)
    
    try {
      const res = await fetch(`/api/admin/leads/${leadId}/conversation-debug`)
      if (!res.ok) {
        throw new Error(`Failed to load debug data: ${res.statusText}`)
      }
      const json = await res.json()
      setData(json)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isAdmin) {
      loadData()
    }
  }, [leadId, isAdmin])

  if (!isAdmin) {
    return null
  }

  return (
    <Card className="border-yellow-200 bg-yellow-50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-yellow-900">
            🔍 Conversation Debug Panel (Admin)
          </CardTitle>
          <Button
            size="sm"
            variant="ghost"
            onClick={loadData}
            disabled={loading}
            className="h-6 w-6 p-0"
          >
            <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-xs">
        {error && (
          <div className="flex items-center gap-2 text-red-600">
            <AlertCircle className="h-3 w-3" />
            <span>{error}</span>
          </div>
        )}
        
        {data && (
          <>
            {/* Conversation Identity */}
            <div>
              <div className="font-semibold text-yellow-900 mb-1">Conversation Identity</div>
              <div className="space-y-1 text-yellow-800">
                <div>ID: <code className="bg-yellow-100 px-1 rounded">{data.conversationId || 'N/A'}</code></div>
                <div>External Thread ID: <code className="bg-yellow-100 px-1 rounded">{data.externalThreadId || 'N/A'}</code></div>
              </div>
            </div>

            {/* State Machine */}
            <div>
              <div className="font-semibold text-yellow-900 mb-1">State Machine</div>
              <div className="space-y-1 text-yellow-800">
                <div>State Version: <Badge variant="outline" className="text-xs">{data.stateVersion}</Badge></div>
                <div>Stage: <Badge variant="outline" className="text-xs">{data.qualificationStage || 'N/A'}</Badge></div>
                <div>Questions Asked: <Badge variant="outline" className="text-xs">{data.questionsAskedCount}/5</Badge></div>
                <div>Last Question: <code className="bg-yellow-100 px-1 rounded">{data.lastQuestionKey || 'N/A'}</code></div>
              </div>
            </div>

            {/* Known Fields */}
            <div>
              <div className="font-semibold text-yellow-900 mb-1">Collected Fields</div>
              <div className="space-y-1 text-yellow-800">
                {Object.keys(data.knownFields).length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(data.knownFields).map(([key, value]) => (
                      <Badge key={key} variant="outline" className="text-xs">
                        {key}: {String(value).substring(0, 20)}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <div className="text-yellow-600">No fields collected yet</div>
                )}
              </div>
            </div>

            {/* Lead Auto-Fill Status */}
            <div>
              <div className="font-semibold text-yellow-900 mb-1">Lead Auto-Fill</div>
              <div className="space-y-1 text-yellow-800">
                <div>Service Type: <code className="bg-yellow-100 px-1 rounded">{data.leadFields.serviceTypeEnum || data.leadFields.requestedServiceRaw || 'N/A'}</code></div>
                <div>Service ID: <code className="bg-yellow-100 px-1 rounded">{data.leadFields.serviceTypeId || 'N/A'}</code></div>
                <div>Nationality: <code className="bg-yellow-100 px-1 rounded">{data.leadFields.nationality || 'N/A'}</code></div>
              </div>
            </div>

            {/* Last 5 Outbound Dedupes */}
            <div>
              <div className="font-semibold text-yellow-900 mb-1">Recent Outbound (Last 5)</div>
              <div className="space-y-1 text-yellow-800">
                {data.last5OutboundDedupes.length > 0 ? (
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {data.last5OutboundDedupes.map((dedupe, idx) => (
                      <div key={idx} className="border-l-2 border-yellow-300 pl-2">
                        <div className="text-xs">
                          <code className="bg-yellow-100 px-1 rounded text-[10px]">{dedupe.dedupeKey.substring(0, 16)}...</code>
                        </div>
                        <div className="text-[10px] text-yellow-600">
                          {new Date(dedupe.timestamp).toLocaleTimeString()}
                        </div>
                        <div className="text-[10px] truncate">{dedupe.body.substring(0, 50)}...</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-yellow-600">No outbound messages yet</div>
                )}
              </div>
            </div>

            {/* Simulate Webhook Retry Button */}
            {data.conversationId && (
              <div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    try {
                      const res = await fetch(`/api/admin/conversations/${data.conversationId}/simulate-retry`, {
                        method: 'POST',
                      })
                      if (!res.ok) {
                        throw new Error(`Failed: ${res.statusText}`)
                      }
                      const json = await res.json()
                      alert(json.wasDuplicate 
                        ? '✅ Duplicate detected (idempotency working!)' 
                        : '✅ Webhook retry simulated - check logs')
                      loadData()
                    } catch (err: any) {
                      alert(`Error: ${err.message}`)
                    }
                  }}
                  className="w-full text-xs"
                >
                  🔄 Simulate Webhook Retry
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

