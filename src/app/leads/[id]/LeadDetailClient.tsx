'use client'

import { useState, useEffect, FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Calendar, Clock, AlertCircle, Sparkles, Loader2 } from 'lucide-react'
import { format } from 'date-fns'

export default function LeadDetailClient({ leadId }: { leadId: number }) {
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aiReply, setAiReply] = useState<string | null>(null)
  const [generatingReply, setGeneratingReply] = useState(false)
  const [lead, setLead] = useState<any>(null)
  const [loadingLead, setLoadingLead] = useState(true)
  const [draftData, setDraftData] = useState<any>(null)
  const [generatingDraft, setGeneratingDraft] = useState(false)

  async function handleAddNote(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (!note.trim()) {
      setError('Please enter a note')
      return
    }

    try {
      setSubmitting(true)
      const res = await fetch(`/api/leads/${leadId}/log`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          channel: 'internal',
          direction: 'outbound',
          messageSnippet: note.substring(0, 200),
          message: note,
        }),
      })

      if (!res.ok) {
        throw new Error('Failed to add note')
      }

      setNote('')
      // Reload page to show new log entry
      window.location.reload()
    } catch (err) {
      console.error(err)
      setError('Error adding note')
    } finally {
      setSubmitting(false)
    }
  }

  useEffect(() => {
    loadLead()
  }, [])

  async function loadLead() {
    try {
      setLoadingLead(true)
      const res = await fetch(`/api/leads/${leadId}`)
      if (res.ok) {
        const data = await res.json()
        setLead(data)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoadingLead(false)
    }
  }

  async function handleGenerateAIReply() {
    try {
      setGeneratingReply(true)
      setError(null)
      const res = await fetch(`/api/leads/${leadId}/ai-reply`)
      
      if (!res.ok) {
        throw new Error('Failed to generate AI reply')
      }

      const data = await res.json()
      setAiReply(data.reply || 'No reply generated')
    } catch (err) {
      console.error(err)
      setError('Error generating AI reply')
    } finally {
      setGeneratingReply(false)
    }
  }

  async function handleGenerateDraft(objective: string = 'followup') {
    try {
      setGeneratingDraft(true)
      setError(null)
      const res = await fetch('/api/ai/draft-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId, objective }),
      })
      
      if (!res.ok) {
        throw new Error('Failed to generate draft')
      }

      const data = await res.json()
      setDraftData(data)
      setAiReply(data.draftText)
    } catch (err) {
      console.error(err)
      setError('Error generating draft')
    } finally {
      setGeneratingDraft(false)
    }
  }

  async function handleSetFollowUp(days: number | 'custom') {
    try {
      let followUpDate: Date | null = null
      
      if (days === 'custom') {
        const dateStr = prompt('Enter follow-up date (YYYY-MM-DD):')
        if (!dateStr) return
        followUpDate = new Date(dateStr)
        if (isNaN(followUpDate.getTime())) {
          setError('Invalid date format')
          return
        }
      } else {
        followUpDate = new Date()
        followUpDate.setDate(followUpDate.getDate() + days)
      }
      
      const res = await fetch(`/api/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nextFollowUpAt: followUpDate.toISOString() }),
      })
      
      if (res.ok) {
        await loadLead()
      } else {
        setError('Failed to set follow-up')
      }
    } catch (err) {
      console.error(err)
      setError('Failed to set follow-up')
    }
  }

  function getFollowUpStatus() {
    if (!lead?.nextFollowUpAt) return 'none'
    const followUpDate = new Date(lead.nextFollowUpAt)
    const today = new Date()
    today.setUTCHours(0, 0, 0, 0)
    followUpDate.setUTCHours(0, 0, 0, 0)
    const daysDiff = Math.ceil((followUpDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    if (daysDiff < 0) return 'overdue'
    if (daysDiff === 0) return 'today'
    return 'scheduled'
  }

  if (loadingLead) {
    return <div className="bg-white shadow rounded-lg p-4">Loading...</div>
  }

  const followUpStatus = getFollowUpStatus()

  return (
    <div className="space-y-4">
      {/* Follow-up Discipline Section */}
      <div className="bg-white shadow rounded-lg p-4 space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Follow-up Discipline
        </h2>
        
        {followUpStatus === 'none' && (
          <Badge variant="outline" className="w-full justify-center gap-2 text-orange-600 border-orange-300 py-2">
            <AlertCircle className="h-4 w-4" />
            No Follow-up Scheduled
          </Badge>
        )}
        {followUpStatus === 'overdue' && (
          <Badge variant="destructive" className="w-full justify-center gap-2 py-2">
            <AlertCircle className="h-4 w-4" />
            Follow-up Overdue
          </Badge>
        )}
        {followUpStatus === 'today' && (
          <Badge className="w-full justify-center gap-2 bg-blue-600 hover:bg-blue-700 py-2">
            <Clock className="h-4 w-4" />
            Follow-up Today
          </Badge>
        )}
        {followUpStatus === 'scheduled' && lead?.nextFollowUpAt && (
          <div className="flex items-center justify-between p-2 bg-blue-50 rounded">
            <span className="text-sm text-muted-foreground">Next Follow-up:</span>
            <span className="text-sm font-medium">{format(new Date(lead.nextFollowUpAt), 'MMM dd, yyyy')}</span>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleSetFollowUp(0)}
            className="text-xs"
          >
            Today
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleSetFollowUp(1)}
            className="text-xs"
          >
            Tomorrow
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleSetFollowUp(3)}
            className="text-xs"
          >
            +3 Days
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleSetFollowUp('custom')}
            className="text-xs"
          >
            Pick Date
          </Button>
        </div>
      </div>

      {/* AI Draft Section */}
      <div className="bg-white shadow rounded-lg p-4 space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Sparkles className="h-5 w-5" />
          AI Draft Reply
        </h2>
        
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleGenerateDraft('followup')}
            disabled={generatingDraft}
            className="text-xs"
          >
            {generatingDraft ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Follow-up'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleGenerateDraft('qualify')}
            disabled={generatingDraft}
            className="text-xs"
          >
            Qualify
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleGenerateDraft('renewal')}
            disabled={generatingDraft}
            className="text-xs"
          >
            Renewal
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleGenerateDraft('pricing')}
            disabled={generatingDraft}
            className="text-xs"
          >
            Pricing
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleGenerateDraft('docs_request')}
            disabled={generatingDraft}
            className="text-xs"
          >
            Docs
          </Button>
        </div>
        
        {draftData?.nextQuestions && draftData.nextQuestions.length > 0 && (
          <div className="p-3 bg-blue-50 rounded">
            <p className="text-xs font-semibold mb-2">Suggested Questions:</p>
            <ul className="list-disc list-inside text-xs text-muted-foreground space-y-1">
              {draftData.nextQuestions.map((q: string, i: number) => (
                <li key={i}>{q}</li>
              ))}
            </ul>
          </div>
        )}
        
        {aiReply && (
          <div>
            <label className="block text-sm font-medium mb-1">Draft Reply:</label>
            <textarea
              className="w-full border rounded px-3 py-2 text-sm"
              rows={6}
              value={aiReply}
              onChange={(e) => setAiReply(e.target.value)}
              placeholder="Draft reply will appear here..."
            />
            <p className="text-xs text-gray-500 mt-1">
              Review and edit before sending
            </p>
          </div>
        )}
      </div>

      {/* Add Internal Note */}
      <div className="bg-white shadow rounded-lg p-4 space-y-4">
        <h2 className="text-lg font-semibold">Add Internal Note</h2>
        
        {error && (
          <div className="bg-red-100 text-red-800 text-sm px-3 py-2 rounded">
            {error}
          </div>
        )}

        <form onSubmit={handleAddNote} className="space-y-3">
          <textarea
            className="w-full border rounded px-3 py-2 text-sm"
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add internal note about this lead..."
          />
          <Button
            type="submit"
            disabled={submitting}
            size="sm"
          >
            {submitting ? 'Saving...' : 'Save Note'}
          </Button>
        </form>
      </div>
    </div>
  )
}

