'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Plus, Trash2, ToggleLeft, ToggleRight } from 'lucide-react'

type AutomationRule = {
  id: number
  name: string
  isActive: boolean
  type: string
  channel: string
  daysBeforeExpiry: number | null
  followupAfterDays: number | null
  createdAt: string
}

export function AutomationRulesClient({
  initialRules = [],
}: {
  initialRules?: AutomationRule[]
}) {
  const [rules, setRules] = useState<AutomationRule[]>(initialRules)
  const [loading, setLoading] = useState(!initialRules || initialRules.length === 0)

  // Load rules if not provided
  useEffect(() => {
    if (!initialRules || initialRules.length === 0) {
      loadRules()
    }
  }, [])

  async function loadRules() {
    try {
      setLoading(true)
      const res = await fetch('/api/admin/automation/rules')
      if (res.ok) {
        const data = await res.json()
        setRules(data)
      }
    } catch (error) {
      console.error('Failed to load rules:', error)
    } finally {
      setLoading(false)
    }
  }
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    type: 'expiry_reminder',
    channel: 'whatsapp',
    daysBeforeExpiry: null as number | null,
    followupAfterDays: null as number | null,
  })

  async function handleCreate() {
    try {
      const res = await fetch('/api/admin/automation/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      if (res.ok) {
        await loadRules()
        setFormData({
          name: '',
          type: 'expiry_reminder',
          channel: 'whatsapp',
          daysBeforeExpiry: null,
          followupAfterDays: null,
        })
        setShowForm(false)
      } else {
        const error = await res.json()
        alert(error.error || 'Failed to create rule')
      }
    } catch (error) {
      alert('Failed to create rule')
    }
  }

  async function handleToggle(id: number, currentStatus: boolean) {
    try {
      const res = await fetch(`/api/admin/automation/rules/${id}/toggle`, {
        method: 'POST',
      })

      if (res.ok) {
        await loadRules()
      }
    } catch (error) {
      alert('Failed to toggle rule')
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('Are you sure you want to delete this rule?')) return

    try {
      const res = await fetch(`/api/admin/automation/rules/${id}`, {
        method: 'DELETE',
      })

      if (res.ok) {
        await loadRules()
      }
    } catch (error) {
      alert('Failed to delete rule')
    }
  }

  if (loading) {
    return <div className="p-4 text-center text-muted-foreground">Loading rules...</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Rules ({rules.length})</h3>
        <Button onClick={() => setShowForm(!showForm)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Rule
        </Button>
      </div>

      {showForm && (
        <Card className="p-4">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Rule Name</label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., 90 Days Before Expiry"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Type</label>
              <Select
                value={formData.type}
                onChange={(e) => {
                  const newType = e.target.value
                  setFormData({
                    ...formData,
                    type: newType,
                    daysBeforeExpiry: newType === 'expiry_reminder' ? 90 : null,
                    followupAfterDays: newType === 'followup_due' ? 2 : null,
                  })
                }}
              >
                <option value="expiry_reminder">Expiry Reminder</option>
                <option value="followup_due">Follow-up Due</option>
              </Select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Channel</label>
              <Select
                value={formData.channel}
                onChange={(e) => setFormData({ ...formData, channel: e.target.value })}
              >
                <option value="whatsapp">WhatsApp</option>
                <option value="email">Email</option>
              </Select>
            </div>

            {formData.type === 'expiry_reminder' && (
              <div>
                <label className="block text-sm font-medium mb-2">
                  Days Before Expiry
                </label>
                <Input
                  type="number"
                  value={formData.daysBeforeExpiry || ''}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      daysBeforeExpiry: parseInt(e.target.value) || null,
                    })
                  }
                  placeholder="90, 30, 7, or 1"
                />
              </div>
            )}

            {formData.type === 'followup_due' && (
              <div>
                <label className="block text-sm font-medium mb-2">
                  Follow-up After (Days)
                </label>
                <Input
                  type="number"
                  value={formData.followupAfterDays || ''}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      followupAfterDays: parseInt(e.target.value) || null,
                    })
                  }
                  placeholder="2"
                />
              </div>
            )}

            <div className="flex gap-2">
              <Button onClick={handleCreate} disabled={!formData.name}>
                Create Rule
              </Button>
              <Button variant="outline" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </Card>
      )}

      <div className="space-y-2">
        {rules.length === 0 ? (
          <p className="text-sm text-muted-foreground">No automation rules yet</p>
        ) : (
          rules.map((rule) => (
            <Card key={rule.id} className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-medium">{rule.name}</h4>
                    <Badge variant={rule.isActive ? 'success' : 'secondary'}>
                      {rule.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {rule.type === 'expiry_reminder'
                      ? `${rule.daysBeforeExpiry} days before expiry via ${rule.channel}`
                      : `Follow-up after ${rule.followupAfterDays} days via ${rule.channel}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleToggle(rule.id, rule.isActive)}
                  >
                    {rule.isActive ? (
                      <ToggleRight className="h-5 w-5" />
                    ) : (
                      <ToggleLeft className="h-5 w-5" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(rule.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}
