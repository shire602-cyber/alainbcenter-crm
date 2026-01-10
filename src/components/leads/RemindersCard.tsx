'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Clock, Plus, Check, X } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { useToast } from '@/components/ui/toast'

interface Reminder {
  id: number
  type: string
  scheduledAt: string
  channel: string
  message: string | null
  sent: boolean
  sentAt: string | null
  error: string | null
}

interface RemindersCardProps {
  leadId: number
}

export function RemindersCard({ leadId }: RemindersCardProps) {
  const { showToast } = useToast()
  const [reminders, setReminders] = useState<Reminder[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [reminderType, setReminderType] = useState('FOLLOW_UP')
  const [scheduledAt, setScheduledAt] = useState('')
  const [channel, setChannel] = useState('WHATSAPP')
  const [message, setMessage] = useState('')

  useEffect(() => {
    loadReminders()
  }, [leadId])

  async function loadReminders() {
    try {
      setLoading(true)
      const res = await fetch(`/api/leads/${leadId}/reminders`)
      if (res.ok) {
        const data = await res.json()
        setReminders(data.reminders || [])
      }
    } catch (error) {
      console.error('Failed to load reminders:', error)
    } finally {
      setLoading(false)
    }
  }

  async function handleAddReminder() {
    if (!scheduledAt) {
      showToast('Please select a date and time', 'error')
      return
    }

    try {
      const res = await fetch(`/api/leads/${leadId}/reminders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: reminderType,
          scheduledAt: new Date(scheduledAt).toISOString(),
          channel,
          message: message || undefined,
        }),
      })

      if (res.ok) {
        showToast('Reminder created', 'success')
        setShowAddModal(false)
        setScheduledAt('')
        setMessage('')
        loadReminders()
      } else {
        const data = await res.json()
        throw new Error(data.error || 'Failed to create reminder')
      }
    } catch (error: any) {
      showToast(error.message || 'Failed to create reminder', 'error')
    }
  }

  async function handleDeleteReminder(reminderId: number) {
    if (!confirm('Delete this reminder?')) return

    try {
      const res = await fetch(`/api/leads/${leadId}/reminders/${reminderId}`, {
        method: 'DELETE',
      })

      if (res.ok) {
        showToast('Reminder deleted', 'success')
        loadReminders()
      } else {
        throw new Error('Failed to delete reminder')
      }
    } catch (error: any) {
      showToast(error.message || 'Failed to delete reminder', 'error')
    }
  }

  const upcomingReminders = reminders
    .filter(r => !r.sent)
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())

  const pastReminders = reminders
    .filter(r => r.sent)
    .sort((a, b) => new Date(b.sentAt || b.scheduledAt).getTime() - new Date(a.sentAt || a.scheduledAt).getTime())
    .slice(0, 5)

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Reminders
          </CardTitle>
          <Button onClick={() => setShowAddModal(true)} size="sm" variant="outline" className="gap-2">
            <Plus className="h-3.5 w-3.5" />
            Add
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : (
          <>
            {/* Upcoming Reminders */}
            {upcomingReminders.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-muted-foreground">Upcoming</Label>
                {upcomingReminders.map(reminder => (
                  <div
                    key={reminder.id}
                    className="flex items-center justify-between p-2 border rounded-lg"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          {reminder.type.replace('_', ' ')}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {format(parseISO(reminder.scheduledAt), 'MMM dd, yyyy HH:mm')}
                        </span>
                      </div>
                      {reminder.message && (
                        <p className="text-xs text-muted-foreground mt-1 truncate">
                          {reminder.message}
                        </p>
                      )}
                    </div>
                    <Button
                      onClick={() => handleDeleteReminder(reminder.id)}
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* Past Reminders */}
            {pastReminders.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-muted-foreground">Sent</Label>
                {pastReminders.map(reminder => (
                  <div
                    key={reminder.id}
                    className="flex items-center justify-between p-2 border rounded-lg opacity-60"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Check className="h-3 w-3 text-green-600" />
                        <Badge variant="outline" className="text-xs">
                          {reminder.type.replace('_', ' ')}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {reminder.sentAt
                            ? format(parseISO(reminder.sentAt), 'MMM dd, yyyy')
                            : format(parseISO(reminder.scheduledAt), 'MMM dd, yyyy')}
                        </span>
                      </div>
                      {reminder.error && (
                        <p className="text-xs text-red-600 mt-1">{reminder.error}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {upcomingReminders.length === 0 && pastReminders.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                No reminders scheduled
              </p>
            )}
          </>
        )}

        {/* Add Reminder Modal */}
        {showAddModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-md space-y-4">
              <h3 className="text-lg font-semibold">Add Reminder</h3>
              
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={reminderType} onChange={(e) => setReminderType(e.target.value)}>
                  <option value="FOLLOW_UP">Follow-up</option>
                  <option value="EXPIRY">Expiry</option>
                  <option value="DOCUMENT_REQUEST">Document Request</option>
                  <option value="CUSTOM">Custom</option>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Date & Time</Label>
                <Input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Channel</Label>
                <Select value={channel} onChange={(e) => setChannel(e.target.value)}>
                  <option value="WHATSAPP">WhatsApp</option>
                  <option value="EMAIL">Email</option>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Message (optional)</Label>
                <Textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Leave empty to use default message"
                  rows={3}
                />
              </div>

              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setShowAddModal(false)}>
                  Cancel
                </Button>
                <Button onClick={handleAddReminder}>Create Reminder</Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

