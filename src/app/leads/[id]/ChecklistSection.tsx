'use client'

import { useState, FormEvent, useEffect } from 'react'

type ChecklistItem = {
  id: number
  label: string
  required: boolean
  completed: boolean
  completedAt: string | null
  createdAt: string
}

export default function ChecklistSection({ leadId }: { leadId: number }) {
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

      await loadChecklist()
    } catch (err) {
      console.error(err)
      setError('Error updating checklist item')
    }
  }

  return (
    <div className="bg-white shadow rounded-lg p-4 space-y-4">
      <h2 className="text-lg font-semibold">Onboarding Checklist</h2>

      {error && (
        <div className="bg-red-100 text-red-800 text-sm px-3 py-2 rounded">
          {error}
        </div>
      )}

      {/* Add Checklist Item Form */}
      <form onSubmit={handleSubmit} className="space-y-2 border-b pb-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <input
            type="text"
            className="border rounded px-3 py-2 text-sm"
            placeholder="Checklist item label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            required
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={required}
              onChange={(e) => setRequired(e.target.checked)}
            />
            Required
          </label>
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded disabled:opacity-60"
        >
          {submitting ? 'Adding...' : 'Add Item'}
        </button>
      </form>

      {/* Checklist Items */}
      {loading ? (
        <p className="text-sm text-gray-500">Loading...</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-gray-500">No checklist items yet.</p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-3 p-2 border rounded text-sm"
            >
              <input
                type="checkbox"
                checked={item.completed}
                onChange={() => handleToggle(item.id, item.completed)}
                className="w-4 h-4"
              />
              <div className="flex-1">
                <span className={item.completed ? 'line-through text-gray-500' : ''}>
                  {item.label}
                </span>
                {item.required && (
                  <span className="text-red-500 text-xs ml-2">(Required)</span>
                )}
              </div>
              {item.completed && item.completedAt && (
                <span className="text-xs text-gray-400">
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

