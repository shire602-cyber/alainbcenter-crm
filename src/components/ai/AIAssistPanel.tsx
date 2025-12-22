'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import {
  Brain,
  Loader2,
  Sparkles,
  FileText,
  Target,
  Copy,
  Check,
  AlertCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'

interface AIAssistPanelProps {
  conversationId: number
  onDraftGenerated?: (text: string) => void
}

export function AIAssistPanel({ conversationId, onDraftGenerated }: AIAssistPanelProps) {
  const [tone, setTone] = useState<'professional' | 'friendly' | 'short'>('friendly')
  const [language, setLanguage] = useState<'en' | 'ar'>('en')
  const [generating, setGenerating] = useState(false)
  const [draft, setDraft] = useState<string | null>(null)
  const [summary, setSummary] = useState<any>(null)
  const [nextActions, setNextActions] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [showDrafts, setShowDrafts] = useState(false)
  const [drafts, setDrafts] = useState<any[]>([])
  const [expanded, setExpanded] = useState(true)

  async function generateDraft() {
    setGenerating(true)
    setError(null)
    setDraft(null)

    try {
      const res = await fetch('/api/ai/draft-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId,
          tone,
          language,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to generate draft')
      }

      const data = await res.json()
      setDraft(data.text)
      if (onDraftGenerated) {
        onDraftGenerated(data.text)
      }
      await loadDrafts()
    } catch (err: any) {
      console.error('Failed to generate draft:', err)
      setError(err.message || 'Failed to generate draft. Make sure OpenAI API key is configured.')
    } finally {
      setGenerating(false)
    }
  }

  async function generateSummary() {
    setGenerating(true)
    setError(null)
    setSummary(null)

    try {
      const res = await fetch('/api/ai/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to generate summary')
      }

      const data = await res.json()
      setSummary(data)
    } catch (err: any) {
      console.error('Failed to generate summary:', err)
      setError(err.message || 'Failed to generate summary')
    } finally {
      setGenerating(false)
    }
  }

  async function generateNextActions() {
    setGenerating(true)
    setError(null)
    setNextActions(null)

    try {
      const res = await fetch('/api/ai/next-actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to generate next actions')
      }

      const data = await res.json()
      setNextActions(data)
    } catch (err: any) {
      console.error('Failed to generate next actions:', err)
      setError(err.message || 'Failed to generate next actions')
    } finally {
      setGenerating(false)
    }
  }

  async function loadDrafts() {
    try {
      const res = await fetch(`/api/ai/drafts?conversationId=${conversationId}`)
      if (res.ok) {
        const data = await res.json()
        setDrafts(data)
      }
    } catch (err) {
      console.error('Failed to load drafts:', err)
    }
  }

  function handleCopy() {
    if (draft) {
      navigator.clipboard.writeText(draft)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  function handleUseDraft(draftText: string) {
    setDraft(draftText)
    if (onDraftGenerated) {
      onDraftGenerated(draftText)
    }
    setShowDrafts(false)
  }

  return (
    <Card className="w-80">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Brain className="h-4 w-4" />
            AI Assist
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(!expanded)}
            className="h-6 w-6 p-0"
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>
        <CardDescription className="text-xs">
          Generate replies, summaries, and next actions
        </CardDescription>
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-4">
          {error && (
            <div className="p-2 rounded-lg bg-destructive/10 border border-destructive/20">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
                <p className="text-xs text-destructive">{error}</p>
              </div>
            </div>
          )}

          {/* Tone & Language Selectors */}
          <div className="space-y-2">
            <div>
              <label className="block text-xs font-medium mb-1">Tone</label>
              <div className="flex gap-1">
                {(['professional', 'friendly', 'short'] as const).map((t) => (
                  <Button
                    key={t}
                    variant={tone === t ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setTone(t)}
                    className="flex-1 text-xs capitalize"
                  >
                    {t}
                  </Button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Language</label>
              <div className="flex gap-1">
                {(['en', 'ar'] as const).map((l) => (
                  <Button
                    key={l}
                    variant={language === l ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setLanguage(l)}
                    className="flex-1 text-xs uppercase"
                  >
                    {l === 'en' ? 'English' : 'Arabic'}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          {/* Generate Draft */}
          <div className="space-y-2">
            <Button
              onClick={generateDraft}
              disabled={generating}
              className="w-full gap-2"
              size="sm"
            >
              {generating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Generate Draft Reply
                </>
              )}
            </Button>

            {drafts.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowDrafts(!showDrafts)
                  if (!showDrafts) loadDrafts()
                }}
                className="w-full text-xs"
              >
                {showDrafts ? 'Hide' : 'View'} Last {drafts.length} Drafts
              </Button>
            )}

            {showDrafts && drafts.length > 0 && (
              <div className="space-y-1 max-h-40 overflow-y-auto border rounded p-2">
                {drafts.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => handleUseDraft(d.draftText)}
                    className="w-full text-left p-2 rounded hover:bg-secondary text-xs"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <Badge variant="outline" className="text-xs capitalize">
                        {d.tone}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {new Date(d.createdAt).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-xs truncate">{d.draftText.substring(0, 60)}...</p>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Draft Display */}
          {draft && (
            <div className="space-y-2 p-3 rounded-lg bg-muted/50 border">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium">Draft Reply:</label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCopy}
                  className="h-6 px-2"
                >
                  {copied ? (
                    <Check className="h-3 w-3" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </Button>
              </div>
              <Textarea
                value={draft}
                readOnly
                className="text-sm min-h-[100px] font-mono"
                onClick={(e) => (e.target as HTMLTextAreaElement).select()}
              />
              <p className="text-xs text-muted-foreground">
                Click to select all, then paste into message composer
              </p>
            </div>
          )}

          {/* Summary & Next Actions */}
          <div className="space-y-2">
            <Button
              onClick={generateSummary}
              disabled={generating}
              variant="outline"
              className="w-full gap-2"
              size="sm"
            >
              {generating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileText className="h-4 w-4" />
              )}
              Generate Summary
            </Button>

            <Button
              onClick={generateNextActions}
              disabled={generating}
              variant="outline"
              className="w-full gap-2"
              size="sm"
            >
              {generating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Target className="h-4 w-4" />
              )}
              Next Actions
            </Button>
          </div>

          {/* Summary Display */}
          {summary && (
            <div className="space-y-2 p-3 rounded-lg bg-muted/50 border">
              <label className="text-xs font-medium">Summary:</label>
              <ul className="text-xs space-y-1 list-disc list-inside">
                {summary.summary?.map((s: string, i: number) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
              {summary.missingInfo && summary.missingInfo.length > 0 && (
                <div className="mt-2">
                  <label className="text-xs font-medium">Missing Info:</label>
                  <ul className="text-xs space-y-1 list-disc list-inside">
                    {summary.missingInfo.map((info: string, i: number) => (
                      <li key={i}>{info}</li>
                    ))}
                  </ul>
                </div>
              )}
              {summary.urgency && (
                <div className="mt-2">
                  <Badge
                    variant={
                      summary.urgency === 'high'
                        ? 'destructive'
                        : summary.urgency === 'medium'
                        ? 'default'
                        : 'outline'
                    }
                    className="text-xs"
                  >
                    Urgency: {summary.urgency.toUpperCase()}
                  </Badge>
                  {summary.urgencyReason && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {summary.urgencyReason}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Next Actions Display */}
          {nextActions && nextActions.actions && (
            <div className="space-y-2 p-3 rounded-lg bg-muted/50 border">
              <label className="text-xs font-medium">Next Actions:</label>
              <ul className="text-xs space-y-2">
                {nextActions.actions.map((action: any, i: number) => (
                  <li key={i} className="flex items-start gap-2">
                    <Badge
                      variant={
                        action.priority === 'high'
                          ? 'destructive'
                          : action.priority === 'medium'
                          ? 'default'
                          : 'outline'
                      }
                      className="text-xs flex-shrink-0"
                    >
                      {action.priority}
                    </Badge>
                    <div>
                      <p className="font-medium">{action.action}</p>
                      {action.reason && (
                        <p className="text-muted-foreground">{action.reason}</p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  )
}






















