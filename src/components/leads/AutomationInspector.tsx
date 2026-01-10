'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  Zap,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'

interface AutomationRule {
  id: string
  name: string
  trigger: string
  action: string
  status: 'active' | 'inactive'
  nextRun?: string
}

interface AutomationLog {
  id: string
  rule: string
  triggeredAt: string
  status: 'executed' | 'skipped'
  reason?: string
}

interface AutomationInspectorProps {
  leadId: number
  className?: string
}

export function AutomationInspector({ leadId, className }: AutomationInspectorProps) {
  const [autopilotEnabled, setAutopilotEnabled] = useState(true)
  const [rules, setRules] = useState<AutomationRule[]>([])
  const [logs, setLogs] = useState<AutomationLog[]>([])
  const [showLogs, setShowLogs] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    loadAutomationData()
  }, [leadId])

  async function loadAutomationData() {
    setLoading(true)
    try {
      // Load lead to get autopilot status
      const leadRes = await fetch(`/api/leads/${leadId}`)
      if (leadRes.ok) {
        const lead = await leadRes.json()
        setAutopilotEnabled(lead.autopilotEnabled !== false)
      }

      // Load automation rules
      const rulesRes = await fetch('/api/automation/rules')
      if (rulesRes.ok) {
        const data = await rulesRes.json()
        const activeRules = (data.rules || [])
          .filter((r: any) => r.isActive && r.enabled)
          .map((r: any) => ({
            id: r.id.toString(),
            name: r.name,
            trigger: formatTrigger(r.trigger, r.conditions),
            action: formatActions(r.actions),
            status: 'active' as const,
          }))
        setRules(activeRules)
      }

      // Load automation logs for this lead
      const logsRes = await fetch(`/api/automation/logs?leadId=${leadId}`)
      if (logsRes.ok) {
        const data = await logsRes.json()
        const formattedLogs = (data.logs || []).slice(0, 5).map((log: any) => ({
          id: log.id.toString(),
          rule: log.rule?.name || log.ruleKey || 'Unknown',
          triggeredAt: log.ranAt || log.createdAt,
          status: log.status === 'SUCCESS' || log.status === 'sent' ? 'executed' : 'skipped',
          reason: log.reason || undefined,
        }))
        setLogs(formattedLogs)
      }
    } catch (err) {
      console.error('Failed to load automation data:', err)
    } finally {
      setLoading(false)
    }
  }

  async function handleToggleAutopilot(enabled: boolean) {
    setAutopilotEnabled(enabled)
    try {
      const res = await fetch(`/api/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autopilotEnabled: enabled }),
      })
      if (!res.ok) {
        // Revert on error
        setAutopilotEnabled(!enabled)
      }
    } catch (err) {
      console.error('Failed to update autopilot status:', err)
      setAutopilotEnabled(!enabled)
    }
  }

  function formatTrigger(trigger: string, conditions: any): string {
    if (!conditions) return trigger
    const cond = typeof conditions === 'string' ? JSON.parse(conditions) : conditions
    
    if (trigger === 'EXPIRY_WINDOW') {
      return `${cond.daysBefore || 'N'} days before expiry`
    }
    if (trigger === 'NO_ACTIVITY') {
      return `${cond.daysWithoutMessage || 7} days no activity`
    }
    if (trigger === 'NO_REPLY_SLA') {
      return `${cond.hoursWithoutReply || 48}h no reply`
    }
    return trigger.replace(/_/g, ' ')
  }

  function formatActions(actions: any): string {
    if (!actions) return 'No actions'
    const acts = typeof actions === 'string' ? JSON.parse(actions) : actions
    if (!Array.isArray(acts)) return 'Invalid actions'
    
    const actionNames = acts.map((a: any) => {
      if (a.type === 'SEND_WHATSAPP' || a.type === 'SEND_WHATSAPP_TEMPLATE') return 'Send WhatsApp'
      if (a.type === 'SEND_EMAIL' || a.type === 'SEND_EMAIL_TEMPLATE') return 'Send Email'
      if (a.type === 'CREATE_TASK') return 'Create Task'
      if (a.type === 'SET_NEXT_FOLLOWUP') return 'Set Follow-up'
      return a.type
    })
    return actionNames.join(', ') || 'No actions'
  }

  const nextAction = rules.find(r => r.status === 'active' && r.nextRun)

  return (
    <Card className={cn('rounded-2xl shadow-sm border-2', autopilotEnabled ? 'border-green-200' : 'border-gray-200', className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Zap className={cn('h-4 w-4', autopilotEnabled && 'text-green-600')} />
            Autopilot
          </CardTitle>
          <Switch
            checked={autopilotEnabled}
            onCheckedChange={handleToggleAutopilot}
            disabled={loading}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {autopilotEnabled ? (
          <>
            {nextAction && (
              <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
                <div className="flex items-start gap-2">
                  <Clock className="h-4 w-4 text-blue-600 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-blue-900">
                      Next Action
                    </p>
                    <p className="text-xs text-blue-700 mt-0.5">
                      {nextAction.name} - {format(new Date(nextAction.nextRun!), 'MMM dd, HH:mm')}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Active Rules</p>
              {rules.filter(r => r.status === 'active').map((rule) => (
                <div
                  key={rule.id}
                  className="flex items-center justify-between p-2 rounded-lg border hover:bg-muted/50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{rule.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {rule.trigger} → {rule.action}
                    </p>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    Active
                  </Badge>
                </div>
              ))}
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowLogs(!showLogs)}
              className="w-full justify-between"
            >
              <span className="text-xs">Automation Log</span>
              {showLogs ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>

            {showLogs && (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {logs.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-start gap-2 p-2 rounded-lg border text-xs"
                  >
                    {log.status === 'executed' ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-600 mt-0.5 flex-shrink-0" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium">{log.rule}</p>
                      <p className="text-muted-foreground">
                        {format(new Date(log.triggeredAt), 'MMM dd, HH:mm')}
                      </p>
                      {log.reason && (
                        <p className="text-muted-foreground mt-0.5 italic">{log.reason}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-4 text-muted-foreground text-sm">
            <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>Autopilot is disabled</p>
            <p className="text-xs mt-1">Enable to automate follow-ups and reminders</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

