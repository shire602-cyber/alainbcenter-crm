'use client'

import { useState, FormEvent, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { CheckCircle2, Circle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/ui/toast'

type ChecklistItem = {
  id: number
  label: string
  required: boolean
  completed: boolean
  completedAt: string | null
  createdAt: string
}

export default function ChecklistSection({ leadId }: { leadId: number }) {
  const { showToast } = useToast()
  const [items, setItems] = useState<ChecklistItem[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [label, setLabel] = useState('')
  const [required, setRequired] = useState(true)

  async function loadChecklist() {
    try {
      setLoading(true)
      const res = await fetch(`/api/leads/${leadId}/checklist`)
      const data = await res.json()
      setItems(data)
    } catch (err) {
      console.error(err)
      setError('Failed to load checklist')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadChecklist()
  }, [leadId])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (!label.trim()) {
      setError('Label is required')
      return
    }

    try {
      setSubmitting(true)
      const res = await fetch(`/api/leads/${leadId}/checklist`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          label: label.trim(),
          required,
        }),
      })

      if (!res.ok) {
        throw new Error('Failed to create checklist item')
      }

      setLabel('')
      setRequired(true)
      await loadChecklist()
    } catch (err) {
      console.error(err)
      setError('Error creating checklist item')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleToggle(itemId: number, currentCompleted: boolean) {
    // Optimistic update
    setItems(items.map(item => 
      item.id === itemId 
        ? { ...item, completed: !currentCompleted, completedAt: !currentCompleted ? new Date().toISOString() : null }
        : item
    ))

    try {
      const res = await fetch(`/api/checklist/${itemId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          completed: !currentCompleted,
        }),
      })

      if (!res.ok) {
        throw new Error('Failed to update checklist item')
      }

      // Reload to get server state
      await loadChecklist()
      showToast('Checklist updated', 'success')
    } catch (err) {
      console.error(err)
      // Revert optimistic update
      await loadChecklist()
      showToast('Failed to update checklist', 'error')
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-destructive/10 text-destructive text-sm px-3 py-2 rounded">
          {error}
        </div>
      )}

      {/* Add Checklist Item Form */}
      <form onSubmit={handleSubmit} className="space-y-3 border-b pb-4">
        <div className="flex gap-2">
          <Input
            type="text"
            placeholder="Checklist item label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            required
            className="flex-1"
          />
          <div className="flex items-center gap-2 px-3 border rounded">
            <Checkbox
              id="required-check"
              checked={required}
              onCheckedChange={(checked) => setRequired(checked === true)}
            />
            <label htmlFor="required-check" className="text-sm text-muted-foreground cursor-pointer">
              Required
            </label>
          </div>
        </div>
        <Button
          type="submit"
          disabled={submitting}
          size="sm"
        >
          {submitting ? 'Adding...' : 'Add Item'}
        </Button>
      </form>

      {/* Checklist Items */}
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No checklist items yet.</p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
              onClick={() => handleToggle(item.id, item.completed)}
            >
              {item.completed ? (
                <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
              ) : (
                <Circle className="h-5 w-5 text-muted-foreground shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <span className={cn(
                  'text-sm',
                  item.completed && 'line-through text-muted-foreground'
                )}>
                  {item.label}
                </span>
                {item.required && (
                  <Badge variant="destructive" className="ml-2 text-xs">Required</Badge>
                )}
              </div>
              {item.completed && item.completedAt && (
                <span className="text-xs text-muted-foreground shrink-0">
                  {new Date(item.completedAt).toLocaleDateString()}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

