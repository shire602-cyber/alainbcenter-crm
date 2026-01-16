'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'

export function MetaLeadgenConfig({
  initialAdAccountId,
  initialFormIds,
}: {
  initialAdAccountId: string
  initialFormIds: string[]
}) {
  const [adAccountId, setAdAccountId] = useState(initialAdAccountId)
  const [formIdsText, setFormIdsText] = useState(initialFormIds.join(', '))
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    setSaving(true)
    setError(null)
    setMessage(null)

    const formIds = formIdsText
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)

    try {
      const res = await fetch('/api/integrations/meta/leadgen-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selectedAdAccountId: adAccountId.trim(),
          selectedFormIds: formIds,
        }),
      })

      const data = await res.json()
      if (!res.ok || data?.ok === false) {
        setError(data?.error || 'Failed to save leadgen config')
      } else {
        setMessage('Leadgen config saved')
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to save leadgen config')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-4 space-y-3 rounded-md border border-amber-200/60 bg-amber-50/40 p-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-slate-700">Leadgen Configuration</div>
        <Badge variant="secondary">Manual</Badge>
      </div>
      <div className="space-y-2">
        <label className="text-xs font-medium text-slate-600">Ad Account ID</label>
        <Input
          value={adAccountId}
          onChange={(event) => setAdAccountId(event.target.value)}
          placeholder="1050470112230733"
        />
      </div>
      <div className="space-y-2">
        <label className="text-xs font-medium text-slate-600">Lead Form IDs (comma-separated)</label>
        <Textarea
          value={formIdsText}
          onChange={(event) => setFormIdsText(event.target.value)}
          placeholder="1234567890, 0987654321"
          rows={3}
        />
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save Leadgen Config'}
        </Button>
        {message ? <span className="text-xs text-green-700">{message}</span> : null}
        {error ? <span className="text-xs text-red-600">{error}</span> : null}
      </div>
    </div>
  )
}
