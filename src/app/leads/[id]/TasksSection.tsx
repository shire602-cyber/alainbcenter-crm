'use client'

import { useState, FormEvent, useEffect } from 'react'

type Task = {
  id: number
  title: string
  type: string
  dueAt: string | null
  doneAt: string | null
  createdAt: string
}

export default function TasksSection({ leadId }: { leadId: number }) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const [title, setTitle] = useState('')
  const [type, setType] = useState('other')
  const [dueAt, setDueAt] = useState('')

  async function loadTasks() {
    try {
      setLoading(true)
      const res = await fetch(`/api/leads/${leadId}/tasks`)
      const data = await res.json()
      setTasks(data)
    } catch (err) {
      console.error(err)
      setError('Failed to load tasks')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadTasks()
  }, [leadId])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (!title.trim()) {
      setError('Title is required')
      return
    }

    try {
      setSubmitting(true)
      const res = await fetch(`/api/leads/${leadId}/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title,
          type,
          dueAt: dueAt || null,
        }),
      })

      if (!res.ok) {
        throw new Error('Failed to create task')
      }

      setTitle('')
      setType('other')
      setDueAt('')
      await loadTasks()
    } catch (err) {
      console.error(err)
      setError('Error creating task')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleMarkDone(taskId: number) {
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          doneAt: 'now',
        }),
      })

      if (!res.ok) {
        throw new Error('Failed to mark task as done')
      }

      await loadTasks()
    } catch (err) {
      console.error(err)
      setError('Error updating task')
    }
  }

  const openTasks = tasks.filter(t => !t.doneAt).sort((a, b) => {
    if (a.dueAt && b.dueAt) return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime()
    if (a.dueAt) return -1
    if (b.dueAt) return 1
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  })

  const completedTasks = tasks.filter(t => t.doneAt).sort(
    (a, b) => new Date(b.doneAt!).getTime() - new Date(a.doneAt!).getTime()
  )

  function formatDate(dateString: string | null) {
    if (!dateString) return '—'
    return new Date(dateString).toLocaleDateString()
  }

  return (
    <div className="bg-white shadow rounded-lg p-4 space-y-4">
      <h2 className="text-lg font-semibold">Tasks</h2>

      {error && (
        <div className="bg-red-100 text-red-800 text-sm px-3 py-2 rounded">
          {error}
        </div>
      )}

      {/* Add Task Form */}
      <form onSubmit={handleSubmit} className="space-y-2 border-b pb-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <input
            type="text"
            className="border rounded px-3 py-2 text-sm"
            placeholder="Task title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
          <select
            className="border rounded px-3 py-2 text-sm"
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            <option value="call">Call</option>
            <option value="meeting">Meeting</option>
            <option value="email">Email</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="other">Other</option>
          </select>
          <input
            type="date"
            className="border rounded px-3 py-2 text-sm"
            value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
          />
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded disabled:opacity-60"
        >
          {submitting ? 'Adding...' : 'Add Task'}
        </button>
      </form>

      {/* Open Tasks */}
      <div>
        <h3 className="text-md font-semibold mb-2">Open Tasks</h3>
        {loading ? (
          <p className="text-sm text-gray-500">Loading...</p>
        ) : openTasks.length === 0 ? (
          <p className="text-sm text-gray-500">No open tasks.</p>
        ) : (
          <div className="space-y-2">
            {openTasks.map((task) => (
              <div
                key={task.id}
                className="flex items-center justify-between p-2 border rounded text-sm"
              >
                <div className="flex-1">
                  <span className="font-medium">{task.title}</span>
                  <span className="text-gray-500 ml-2 capitalize">({task.type})</span>
                  {task.dueAt && (
                    <span className="text-gray-500 ml-2">
                      Due: {formatDate(task.dueAt)}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => handleMarkDone(task.id)}
                  className="px-3 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700"
                >
                  Mark Done
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Completed Tasks */}
      {completedTasks.length > 0 && (
        <div>
          <h3 className="text-md font-semibold mb-2">Completed Tasks</h3>
          <div className="space-y-2">
            {completedTasks.map((task) => (
              <div
                key={task.id}
                className="flex items-center justify-between p-2 border rounded text-sm bg-gray-50"
              >
                <div className="flex-1">
                  <span className="line-through text-gray-500">{task.title}</span>
                  <span className="text-gray-400 ml-2 capitalize">({task.type})</span>
                  <span className="text-gray-400 ml-2">
                    Completed: {formatDate(task.doneAt)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

