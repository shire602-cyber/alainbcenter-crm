'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select } from '@/components/ui/select'
import { Sparkles, Send, Clock } from 'lucide-react'
import { useToast } from '@/components/ui/toast'

interface AutopilotCardProps {
  leadId: number
  lead: {
    autoReplyEnabled?: boolean
    allowOutsideHours?: boolean
    autoReplyMode?: string
  }
  onUpdate?: () => void
}

export function AutopilotCard({ leadId, lead, onUpdate }: AutopilotCardProps) {
  const { showToast } = useToast()
  const [autoReplyEnabled, setAutoReplyEnabled] = useState(lead.autoReplyEnabled ?? true)
  const [allowOutsideHours, setAllowOutsideHours] = useState(lead.allowOutsideHours ?? false)
  const [autoReplyMode, setAutoReplyMode] = useState(lead.autoReplyMode || 'AI_ONLY')
  const [saving, setSaving] = useState(false)
  const [sendingFollowUp, setSendingFollowUp] = useState(false)

  useEffect(() => {
    setAutoReplyEnabled(lead.autoReplyEnabled ?? true)
    setAllowOutsideHours(lead.allowOutsideHours ?? false)
    setAutoReplyMode(lead.autoReplyMode || 'AI_ONLY')
  }, [lead])

  async function handleSave() {
    try {
      setSaving(true)
      const res = await fetch(`/api/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          autoReplyEnabled,
          allowOutsideHours,
          autoReplyMode,
        }),
      })

      if (res.ok) {
        showToast('Settings saved', 'success')
        onUpdate?.()
      } else {
        throw new Error('Failed to save settings')
      }
    } catch (error: any) {
      showToast(error.message || 'Failed to save settings', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleSendFollowUp() {
    try {
      setSendingFollowUp(true)
      const res = await fetch(`/api/leads/${leadId}/send-followup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      if (res.ok) {
        showToast('Follow-up sent', 'success')
      } else {
        const data = await res.json()
        throw new Error(data.error || 'Failed to send follow-up')
      }
    } catch (error: any) {
      showToast(error.message || 'Failed to send follow-up', 'error')
    } finally {
      setSendingFollowUp(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-4 w-4" />
          Autopilot
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="auto-reply">Auto-reply enabled</Label>
            <Switch
              id="auto-reply"
              checked={autoReplyEnabled}
              onCheckedChange={setAutoReplyEnabled}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            AI will automatically reply to inbound messages
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="outside-hours">Allow outside business hours</Label>
            <Switch
              id="outside-hours"
              checked={allowOutsideHours}
              onCheckedChange={setAllowOutsideHours}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Send replies outside 9 AM - 6 PM Dubai time
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="reply-mode">Reply mode</Label>
          <Select 
            id="reply-mode"
            value={autoReplyMode} 
            onChange={(e) => setAutoReplyMode(e.target.value)}
          >
            <option value="AI_ONLY">AI Only</option>
            <option value="TEMPLATES_FIRST">Templates First</option>
            <option value="OFF">Off</option>
          </Select>
        </div>

        <div className="flex gap-2 pt-2">
          <Button onClick={handleSave} disabled={saving} size="sm" className="flex-1">
            {saving ? 'Saving...' : 'Save Settings'}
          </Button>
          <Button
            onClick={handleSendFollowUp}
            disabled={sendingFollowUp}
            variant="outline"
            size="sm"
            className="gap-2"
          >
            <Send className="h-3.5 w-3.5" />
            Send Follow-up Now
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

