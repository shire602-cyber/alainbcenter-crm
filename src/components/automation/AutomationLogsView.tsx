'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Clock, Loader2 } from 'lucide-react'
import { format } from 'date-fns'

type AutomationRunLog = {
  id: number
  dateKey: string
  ruleId: number | null
  leadId: number | null
  actionKey: string
  createdAt: string
  rule?: {
    id: number
    name: string
  } | null
}

export function AutomationLogsView() {
  const [logs, setLogs] = useState<AutomationRunLog[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadLogs()
  }, [])

  async function loadLogs() {
    try {
      setLoading(true)
      const res = await fetch('/api/automation/logs')
      if (res.ok) {
        const data = await res.json()
        setLogs(data)
      }
    } catch (error) {
      console.error('Failed to load logs:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-lg bg-blue-100">
            <Clock className="h-6 w-6 text-blue-600" />
          </div>
          <div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              Automation Run Logs
            </h1>
            <p className="text-muted-foreground mt-1 text-lg">
              View history of automation rule executions
            </p>
          </div>
        </div>
      </div>

      {/* Logs Table */}
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>Recent Automation Runs</CardTitle>
          <CardDescription>Last 50 automation rule executions</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No automation runs logged yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 font-semibold text-sm">Date</th>
                    <th className="text-left py-3 px-4 font-semibold text-sm">Rule</th>
                    <th className="text-left py-3 px-4 font-semibold text-sm">Action</th>
                    <th className="text-left py-3 px-4 font-semibold text-sm">Lead ID</th>
                    <th className="text-left py-3 px-4 font-semibold text-sm">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id} className="border-b hover:bg-muted/50 transition-colors">
                      <td className="py-3 px-4">
                        <Badge variant="outline">{log.dateKey}</Badge>
                      </td>
                      <td className="py-3 px-4">
                        {log.rule ? (
                          <span className="font-medium">{log.rule.name}</span>
                        ) : (
                          <span className="text-muted-foreground">Rule #{log.ruleId || 'N/A'}</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant="secondary" className="capitalize">
                          {log.actionKey.replace(':', ' ')}
                        </Badge>
                      </td>
                      <td className="py-3 px-4">
                        {log.leadId ? (
                          <a
                            href={`/leads/${log.leadId}`}
                            className="text-primary hover:underline"
                          >
                            #{log.leadId}
                          </a>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-sm text-muted-foreground">
                        {format(new Date(log.createdAt), 'HH:mm:ss')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}


