'use client'

/**
 * REPLY ENGINE DEBUG PANEL (Admin Only)
 * Shows FSM state and ReplyEngineLog for debugging
 */

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ChevronDown, ChevronUp, Code, Loader2, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'

interface ReplyEngineDebugProps {
  conversationId: number | null
  leadId: number
}

interface FSMState {
  serviceKey: string | null
  stage: string
  collected: Record<string, any>
  required: string[]
  nextQuestionKey: string | null
  askedQuestionKeys: string[]
  followUpStep: number
  lastInboundMessageId: string | null
  lastOutboundReplyKey: string | null
  stop: {
    enabled: boolean
    reason?: string
  }
}

interface ReplyEngineLog {
  id: number
  action: string
  templateKey: string
  questionKey: string | null
  reason: string
  extractedFields: string | null
  replyKey: string
  replyText: string | null
  createdAt: string
}

export function ReplyEngineDebug({ conversationId, leadId }: ReplyEngineDebugProps) {
  const [expanded, setExpanded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [fsmState, setFsmState] = useState<FSMState | null>(null)
  const [logs, setLogs] = useState<ReplyEngineLog[]>([])

  const loadDebugData = async () => {
    if (!conversationId) return

    setLoading(true)
    try {
      // Load FSM state from conversation
      const convRes = await fetch(`/api/inbox/conversations/${conversationId}`)
      if (convRes.ok) {
        const convData = await convRes.json()
        if (convData.ok && convData.conversation?.ruleEngineMemory) {
          try {
            const parsed = JSON.parse(convData.conversation.ruleEngineMemory)
            setFsmState(parsed)
          } catch (e) {
            // Not FSM state format, ignore
          }
        }
      }

      // Load ReplyEngineLogs
      const logsRes = await fetch(`/api/admin/reply-engine-logs?conversationId=${conversationId}&limit=5`)
      if (logsRes.ok) {
        const logsData = await logsRes.json()
        if (logsData.ok && logsData.logs) {
          setLogs(logsData.logs)
        }
      }
    } catch (error: any) {
      console.error('Failed to load debug data:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (expanded && conversationId) {
      loadDebugData()
    }
  }, [expanded, conversationId])

  if (!conversationId) {
    return null
  }

  return (
    <Card className="rounded-2xl glass-soft shadow-sidebar border-dashed">
      <CardHeader className="pb-2 pt-3 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs font-semibold text-muted-foreground flex items-center gap-2">
            <Code className="h-3.5 w-3.5" />
            Reply Engine Debug (Admin)
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={loadDebugData}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? (
                <ChevronUp className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
            </Button>
          </div>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="px-4 pb-4 space-y-4">
          {/* FSM State */}
          <div>
            <h4 className="text-xs font-semibold mb-2 text-muted-foreground">FSM State</h4>
            {fsmState ? (
              <div className="space-y-2 text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Service:</span>
                  <Badge variant="outline" className="text-xs">
                    {fsmState.serviceKey || 'null'}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Stage:</span>
                  <Badge variant="outline" className="text-xs">
                    {fsmState.stage}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Next Question:</span>
                  <span className="font-mono text-xs">
                    {fsmState.nextQuestionKey || 'null'}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Asked Questions:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {fsmState.askedQuestionKeys.length > 0 ? (
                      fsmState.askedQuestionKeys.map((key, idx) => (
                        <Badge key={idx} variant="secondary" className="text-xs">
                          {key}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground">None</span>
                    )}
                  </div>
                </div>
                {Object.keys(fsmState.collected).length > 0 && (
                  <details className="mt-2">
                    <summary className="text-xs text-muted-foreground cursor-pointer">
                      Collected Data ({Object.keys(fsmState.collected).length})
                    </summary>
                    <pre className="mt-2 p-2 bg-muted rounded text-xs overflow-x-auto">
                      {JSON.stringify(fsmState.collected, null, 2)}
                    </pre>
                  </details>
                )}
                {fsmState.stop.enabled && (
                  <div className="p-2 bg-red-50 rounded text-xs">
                    <span className="font-semibold text-red-600">Stop Enabled:</span>
                    <span className="ml-2">{fsmState.stop.reason || 'Unknown'}</span>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No FSM state found</p>
            )}
          </div>

          {/* Reply Engine Logs */}
          <div>
            <h4 className="text-xs font-semibold mb-2 text-muted-foreground">Recent Logs (Last 5)</h4>
            {logs.length > 0 ? (
              <div className="space-y-2">
                {logs.map((log) => (
                  <div
                    key={log.id}
                    className="p-2 border rounded text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <Badge variant="outline" className="text-xs">
                        {log.action}
                      </Badge>
                      <span className="text-muted-foreground">
                        {format(new Date(log.createdAt), 'HH:mm:ss')}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Template:</span>
                      <span className="ml-2 font-mono">{log.templateKey}</span>
                    </div>
                    {log.questionKey && (
                      <div>
                        <span className="text-muted-foreground">Question:</span>
                        <span className="ml-2 font-mono">{log.questionKey}</span>
                      </div>
                    )}
                    <div>
                      <span className="text-muted-foreground">Reason:</span>
                      <span className="ml-2">{log.reason}</span>
                    </div>
                    {log.replyText && (
                      <details className="mt-1">
                        <summary className="text-xs text-muted-foreground cursor-pointer">
                          Reply Text
                        </summary>
                        <p className="mt-1 p-2 bg-muted rounded text-xs">
                          {log.replyText}
                        </p>
                      </details>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-muted-foreground">Reply Key:</span>
                      <code className="text-xs font-mono bg-muted px-1 rounded">
                        {log.replyKey.substring(0, 8)}...
                      </code>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No logs found</p>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  )
}


