'use client'

import { useEffect, useState } from 'react'
import { BentoCard } from '@/components/dashboard/BentoCard'
import { KPICard } from '@/components/dashboard/KPICard'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Zap, Play, Loader2, CheckCircle2, XCircle } from 'lucide-react'
import { AutomationRulesClient } from '@/components/admin/AutomationRulesClient'
import { Skeleton } from '@/components/ui/skeleton'

type RunResult = {
  success: boolean
  timestamp?: string
  mode?: 'draft' | 'send'
  rulesRun?: number
  expiryRemindersSent?: number
  followUpsSent?: number
  draftsCreated?: number
  skippedDuplicates?: number
  errors?: string[]
  processing?: boolean
  message?: string
}

type RunLog = {
  id: number
  ruleKey: string | null
  status: string | null
  message: string | null
  ranAt: string
  createdAt: string
}

export function AutomationRulesManager() {
  const [running, setRunning] = useState(false)
  const [runResult, setRunResult] = useState<RunResult | null>(null)
  const [loadingStats, setLoadingStats] = useState(false)
  const [runLogs, setRunLogs] = useState<RunLog[]>([])
  const [draftCount, setDraftCount] = useState(0)
  const [seeding, setSeeding] = useState(false)
  const [seedResult, setSeedResult] = useState<{ success: boolean; message?: string } | null>(null)
  
  async function handleSeedInbound() {
    if (!confirm('Seed INBOUND_MESSAGE automation rules? This will create rules for auto-replying to incoming messages.')) {
      return
    }
    
    setSeeding(true)
    setSeedResult(null)
    
    try {
      const res = await fetch('/api/admin/automation/seed-inbound', {
        method: 'POST',
        credentials: 'include',
      })
      
      const data = await res.json()
      
      if (res.ok && data.ok) {
        setSeedResult({ success: true, message: data.message || 'Inbound rules seeded successfully' })
        // Reload page after 2 seconds to show new rules
        setTimeout(() => {
          window.location.reload()
        }, 2000)
      } else {
        setSeedResult({ success: false, message: data.error || 'Failed to seed inbound rules' })
      }
    } catch (error: any) {
      setSeedResult({ success: false, message: error.message || 'Failed to seed inbound rules' })
    } finally {
      setSeeding(false)
    }
  }
  
  async function handleSeedInfoFollowup() {
    if (!confirm('Seed info/quotation follow-up automation rules?')) {
      return
    }
    
    setSeeding(true)
    setSeedResult(null)
    
    try {
      const res = await fetch('/api/admin/automation/seed-info-followup', {
        method: 'POST',
        credentials: 'include',
      })
      
      const data = await res.json()
      
      if (res.ok && data.ok) {
        setSeedResult({ success: true, message: data.message || 'Info follow-up rules seeded successfully' })
        setTimeout(() => {
          window.location.reload()
        }, 2000)
      } else {
        setSeedResult({ success: false, message: data.error || 'Failed to seed info follow-up rules' })
      }
    } catch (error: any) {
      setSeedResult({ success: false, message: error.message || 'Failed to seed info follow-up rules' })
    } finally {
      setSeeding(false)
    }
  }
  
  async function handleSeedEscalation() {
    if (!confirm('Seed escalation automation rules?')) {
      return
    }
    
    setSeeding(true)
    setSeedResult(null)
    
    try {
      const res = await fetch('/api/admin/automation/seed-escalation', {
        method: 'POST',
        credentials: 'include',
      })
      
      const data = await res.json()
      
      if (res.ok && data.ok) {
        setSeedResult({ success: true, message: data.message || 'Escalation rules seeded successfully' })
        setTimeout(() => {
          window.location.reload()
        }, 2000)
      } else {
        setSeedResult({ success: false, message: data.error || 'Failed to seed escalation rules' })
      }
    } catch (error: any) {
      setSeedResult({ success: false, message: error.message || 'Failed to seed escalation rules' })
    } finally {
      setSeeding(false)
    }
  }
  useEffect(() => {
    loadStats()
  }, [])

  async function loadStats() {
    try {
      setLoadingStats(true)
      // Load recent run logs - filter for summary runs (autopilot_manual_run or autopilot_daily_run)
      const logsRes = await fetch('/api/automation/logs?limit=20')
      if (logsRes.ok) {
        const logsData = await logsRes.json()
        // Filter to show only summary runs (not individual rule executions)
        const summaryLogs = (logsData.logs || []).filter((log: any) => 
          log.ruleKey === 'autopilot_manual_run' || 
          log.ruleKey === 'autopilot_daily_run' ||
          log.ruleKey === null // Include logs without ruleKey as they might be summaries
        )
        setRunLogs(summaryLogs.slice(0, 10)) // Show last 10 summary runs
      }
      
      // Load draft count
      const draftsRes = await fetch('/api/messages?status=draft')
      if (draftsRes.ok) {
        const draftsData = await draftsRes.json()
        setDraftCount(Array.isArray(draftsData) ? draftsData.length : 0)
      }
    } catch (err) {
      console.error('Failed to load stats:', err)
    } finally {
      setLoadingStats(false)
    }
  }

  async function handleRunNow() {
    if (!confirm('Run autopilot automation now? This will process all active rules.')) {
      return
    }

    setRunning(true)
    setRunResult(null)

    try {
      console.log('🚀 Starting automation run...')
      
      // Use the autopilot run endpoint which handles all automation rules
      const res = await fetch('/api/autopilot/run', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      console.log('📡 Response status:', res.status, res.statusText)

      // Check if response is OK before parsing JSON
      if (!res.ok) {
        const errorText = await res.text()
        console.error('❌ API error:', errorText)
        throw new Error(`Server error: ${res.status} ${res.statusText}`)
      }

      const data = await res.json()
      console.log('📦 Response data:', data)

      if (data.ok) {
        // Autopilot now runs synchronously and returns results immediately
        const totals = data.totals || {}
        console.log('✅ Automation completed:', totals)
        
        setRunResult({
          success: true,
          timestamp: data.timestamp || new Date().toISOString(),
          rulesRun: totals.rules || 0,
          expiryRemindersSent: totals.sent || 0,
          followUpsSent: totals.sent || 0,
          draftsCreated: totals.sent || 0,
          skippedDuplicates: totals.skipped || 0,
          errors: totals.failed > 0 ? [`${totals.failed} rule(s) failed`] : [],
          message: data.message || 'Automation run completed successfully',
        })
        // Reload stats after a short delay to ensure log is saved
        setTimeout(() => {
          loadStats()
        }, 1000)
      } else {
        console.error('❌ Automation failed:', data.error)
        setRunResult({
          success: false,
          errors: [data.error || 'Failed to run automation'],
        })
      }
    } catch (error: any) {
      console.error('❌ Run automation error:', error)
      setRunResult({
        success: false,
        errors: [error.message || 'Failed to run automation. Check console for details.'],
      })
    } finally {
      setRunning(false)
    }
  }

  async function handleSeedDocuments() {
    if (!confirm('Seed default document & compliance automation rules? This will create 3 new rules if they don\'t exist.')) {
      return
    }

    setSeeding(true)
    setSeedResult(null)

    try {
      const res = await fetch('/api/admin/automation/seed-documents', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const data = await res.json()

      if (res.ok) {
        setSeedResult({ success: true, message: data.message || 'Document rules seeded successfully!' })
        // Reload page after 2 seconds to show new rules
        setTimeout(() => {
          window.location.reload()
        }, 2000)
      } else {
        setSeedResult({ success: false, message: data.error || 'Failed to seed document rules' })
      }
    } catch (error: any) {
      setSeedResult({ success: false, message: error.message || 'Failed to seed document rules' })
    } finally {
      setSeeding(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Autopilot Automation
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure automated messages for expiry reminders and follow-ups. Automation runs automatically in the background via scheduled cron jobs.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={handleSeedDocuments}
            disabled={seeding}
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs"
          >
            {seeding ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Seeding...
              </>
            ) : (
              <>
                <Zap className="h-3.5 w-3.5" />
                Seed Rules
              </>
            )}
          </Button>
          <Button
            onClick={handleRunNow}
            disabled={running}
            size="sm"
            className="gap-1.5 text-xs"
          >
            {running ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Running...
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5" />
                Run Now
              </>
            )}
          </Button>
        </div>
      </div>

      {seedResult && (
        <BentoCard className={seedResult.success ? 'border-green-200 dark:border-green-800' : 'border-red-200 dark:border-red-800'}>
          <div className={`flex items-center gap-2 ${seedResult.success ? 'text-green-800 dark:text-green-200' : 'text-red-800 dark:text-red-200'}`}>
            {seedResult.success ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <XCircle className="h-4 w-4" />
            )}
            <p className="text-sm font-semibold">{seedResult.message}</p>
          </div>
        </BentoCard>
      )}

      {/* Run Results */}
      {runResult && (
        <BentoCard 
          title={
            runResult.processing 
              ? "Automation Run Processing" 
              : runResult.success 
                ? "Automation Run Completed" 
                : "Automation Run Failed"
          }
          icon={
            runResult.processing 
              ? <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />
              : runResult.success 
                ? <CheckCircle2 className="h-4 w-4 text-green-600" /> 
                : <XCircle className="h-4 w-4 text-red-600" />
          }
          className={
            runResult.processing 
              ? 'border-blue-500' 
              : runResult.success 
                ? 'border-green-500' 
                : 'border-red-500'
          }
        >
          {runResult.timestamp && (
            <p className="text-xs text-slate-600 dark:text-slate-400 mb-3">
              {runResult.processing ? 'Queued at' : 'Ran at'}: {new Date(runResult.timestamp).toLocaleString()}
            </p>
          )}
          {runResult.processing ? (
            <div className="space-y-3">
              <p className="text-sm text-slate-700 dark:text-slate-300">
                {runResult.message || 'Automation run is queued and processing in the background. Results will appear in the logs below.'}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Check the "Recent Runs" section below for updates.
              </p>
            </div>
          ) : runResult.success ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                <KPICard
                  title="Rules Run"
                  value={runResult.rulesRun || 0}
                  className="bg-slate-100 dark:bg-slate-800"
                />
                {runResult.mode === 'draft' ? (
                  <KPICard
                    title="Drafts Created"
                    value={runResult.draftsCreated || 0}
                    className="bg-purple-50 dark:bg-purple-900/20"
                  />
                ) : (
                  <>
                    <KPICard
                      title="Expiry Reminders"
                      value={runResult.expiryRemindersSent || 0}
                      className="bg-green-50 dark:bg-green-900/20"
                    />
                    <KPICard
                      title="Follow-ups Sent"
                      value={runResult.followUpsSent || 0}
                      className="bg-blue-50 dark:bg-blue-900/20"
                    />
                  </>
                )}
                <KPICard
                  title="Skipped"
                  value={runResult.skippedDuplicates || 0}
                  className="bg-yellow-50 dark:bg-yellow-900/20"
                />
              </div>

              {runResult.errors && runResult.errors.length > 0 && (
                <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                  <p className="text-xs font-semibold text-yellow-800 dark:text-yellow-200 mb-2">
                    Warnings ({runResult.errors.length}):
                  </p>
                  <ul className="list-disc list-inside space-y-0.5 text-xs text-yellow-700 dark:text-yellow-300">
                    {runResult.errors.map((error, idx) => (
                      <li key={idx}>{error}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-xs font-semibold text-red-800 dark:text-red-200 mb-2">Error:</p>
              <ul className="list-disc list-inside space-y-0.5 text-xs text-red-700 dark:text-red-300">
                {runResult.errors?.map((error, idx) => <li key={idx}>{error}</li>) || (
                  <li>Unknown error occurred</li>
                )}
              </ul>
            </div>
          )}
        </BentoCard>
      )}

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <BentoCard
          title="Draft Messages"
          icon={<Zap className="h-4 w-4" />}
        >
          {loadingStats ? (
            <Skeleton className="h-8 w-16 rounded" />
          ) : (
            <p className="text-2xl font-semibold tracking-tight text-purple-600">{draftCount}</p>
          )}
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
            Pending drafts created by autopilot
          </p>
        </BentoCard>

        <BentoCard
          title="Recent Runs"
          icon={<Play className="h-4 w-4" />}
        >
          {loadingStats ? (
            <Skeleton className="h-8 w-16 rounded" />
          ) : runLogs.length === 0 ? (
            <p className="text-xs text-slate-600 dark:text-slate-400">No runs yet</p>
          ) : (
            <div className="space-y-1.5">
              {runLogs.slice(0, 5).map((log) => (
                <div key={log.id} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    {log.status === 'success' || log.status === 'SUCCESS' ? (
                      <CheckCircle2 className="h-3 w-3 text-green-600" />
                    ) : (
                      <XCircle className="h-3 w-3 text-red-600" />
                    )}
                    <span className="text-slate-600 dark:text-slate-400">
                      {log.ruleKey === 'autopilot_manual_run' ? 'Manual Run' :
                       log.ruleKey === 'autopilot_daily_run' ? 'Daily Cron' :
                       log.message || log.ruleKey || 'Automation Run'}
                    </span>
                  </div>
                  <span className="text-xs text-slate-500 dark:text-slate-500">
                    {new Date(log.ranAt || log.createdAt).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </BentoCard>

        <BentoCard
          title="Mode"
          icon={<Zap className="h-4 w-4" />}
        >
          <Badge variant="outline" className="text-sm px-2 py-0.5">
            Draft Mode (Safe)
          </Badge>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-2">
            Drafts are created but not sent automatically
          </p>
        </BentoCard>
      </div>

      {/* Seed Rules Section */}
      <BentoCard
        title="Seed Automation Rules"
        icon={<Zap className="h-4 w-4" />}
      >
        <p className="text-xs text-slate-600 dark:text-slate-400 mb-3">
          Create default automation rules for your system. Click the buttons below to seed different rule types.
        </p>
        
        <div className="flex flex-wrap gap-2 mb-3">
          <Button
            onClick={handleSeedInbound}
            disabled={seeding}
            variant="outline"
            size="sm"
            className="text-xs"
          >
            {seeding ? (
              <>
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                Seeding...
              </>
            ) : (
              'Seed Inbound Rules'
            )}
          </Button>
          
          <Button
            onClick={handleSeedInfoFollowup}
            disabled={seeding}
            variant="outline"
            size="sm"
            className="text-xs"
          >
            {seeding ? (
              <>
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                Seeding...
              </>
            ) : (
              'Seed Info Follow-up'
            )}
          </Button>
          
          <Button
            onClick={handleSeedEscalation}
            disabled={seeding}
            variant="outline"
            size="sm"
            className="text-xs"
          >
            {seeding ? (
              <>
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                Seeding...
              </>
            ) : (
              'Seed Escalation'
            )}
          </Button>
        </div>
        
        {seedResult && (
          <div className={`text-xs p-2 rounded ${
            seedResult.success
              ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
              : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
          }`}>
            {seedResult.success ? (
              <div className="flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" />
                {seedResult.message}
              </div>
            ) : (
              <div className="flex items-center gap-1">
                <XCircle className="h-3 w-3" />
                {seedResult.message}
              </div>
            )}
          </div>
        )}
      </BentoCard>

      {/* Rules Management */}
      <BentoCard
        title="Automation Rules"
        icon={<Zap className="h-4 w-4" />}
      >
        <p className="text-xs text-slate-600 dark:text-slate-400 mb-3">
          Rules run daily via cron or manually using "Run Autopilot Now". Enable or disable as needed.
        </p>
        <AutomationRulesClient />
      </BentoCard>
    </div>
  )
}
