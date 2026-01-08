'use client'

import { useState, useEffect, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { 
  Plus, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  Users, 
  Calendar,
  Bell,
  Filter,
  X,
} from 'lucide-react'
import { format, formatDistanceToNow, isPast, isToday, isTomorrow } from 'date-fns'
import { cn } from '@/lib/utils'

type TaskAssignee = {
  id: number
  userId: number
  user: {
    id: number
    name: string
    email: string
  }
}

type Task = {
  id: number
  title: string
  description: string | null
  type: string
  priority: string
  dueAt: string | null
  status: string
  doneAt: string | null
  createdAt: string
  assignedUser: { id: number; name: string; email: string } | null
  assignees: TaskAssignee[]
  createdByUser: { id: number; name: string; email: string } | null
}

type FilterType = 'all' | 'open' | 'overdue' | 'completed'

export default function TasksSection({ leadId }: { leadId: number }) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [users, setUsers] = useState<Array<{ id: number; name: string; email: string }>>([])
  const [currentUser, setCurrentUser] = useState<{ id: number; role: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [filter, setFilter] = useState<FilterType>('all')
  
  // Create task form state
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [type, setType] = useState('OTHER')
  const [priority, setPriority] = useState('MEDIUM')
  const [dueDate, setDueDate] = useState('')
  const [dueTime, setDueTime] = useState('')
  const [assigneeIds, setAssigneeIds] = useState<number[]>([])
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    loadTasks()
    loadUsers()
    loadCurrentUser()
  }, [leadId])

  async function loadTasks() {
    try {
      setLoading(true)
      const res = await fetch(`/api/leads/${leadId}/tasks`)
      if (!res.ok) throw new Error('Failed to load tasks')
      const data = await res.json()
      setTasks(data)
    } catch (err) {
      console.error(err)
      setError('Failed to load tasks')
    } finally {
      setLoading(false)
    }
  }

  async function loadUsers() {
    try {
      const res = await fetch('/api/admin/users')
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data)) setUsers(data)
      }
    } catch (err) {
      console.error(err)
    }
  }

  async function loadCurrentUser() {
    try {
      const res = await fetch('/api/auth/me')
      if (res.ok) {
        const data = await res.json()
        if (data.user) {
          setCurrentUser({ id: data.user.id, role: data.user.role || 'AGENT' })
          // Non-admin defaults to assigning to themselves
          if (data.user.role?.toUpperCase() !== 'ADMIN') {
            setAssigneeIds([data.user.id])
          }
        }
      }
    } catch (err) {
      console.error(err)
    }
  }

  async function handleCreateTask() {
    if (!title.trim()) {
      setError('Title is required')
      return
    }

    try {
      setSubmitting(true)
      setError(null)

      // Combine date and time
      let dueAt: string | null = null
      if (dueDate) {
        if (dueTime) {
          dueAt = `${dueDate}T${dueTime}:00`
        } else {
          dueAt = `${dueDate}T23:59:59`
        }
      }

      const res = await fetch(`/api/leads/${leadId}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          type,
          priority,
          dueAt,
          assigneeIds: assigneeIds.length > 0 ? assigneeIds : undefined,
        }),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to create task')
      }

      // Reset form
      setTitle('')
      setDescription('')
      setType('OTHER')
      setPriority('MEDIUM')
      setDueDate('')
      setDueTime('')
      if (currentUser?.role?.toUpperCase() !== 'ADMIN') {
        setAssigneeIds([currentUser!.id])
      } else {
        setAssigneeIds([])
      }
      setShowCreateModal(false)
      await loadTasks()
    } catch (err: any) {
      console.error(err)
      setError(err.message || 'Error creating task')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleMarkDone(taskId: number) {
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'DONE' }),
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

  async function handleNudge(taskId: number) {
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: 'POST',
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to nudge task')
      }

      // Show success message
      setError(null)
    } catch (err: any) {
      console.error(err)
      setError(err.message || 'Error nudging task')
    }
  }

  const isAdmin = currentUser?.role?.toUpperCase() === 'ADMIN'

  // Filter and sort tasks
  const filteredTasks = useMemo(() => {
    let filtered = tasks

    if (filter === 'open') {
      filtered = filtered.filter(t => t.status === 'OPEN')
    } else if (filter === 'overdue') {
      filtered = filtered.filter(t => 
        t.status === 'OPEN' && 
        t.dueAt && 
        isPast(new Date(t.dueAt))
      )
    } else if (filter === 'completed') {
      filtered = filtered.filter(t => t.status === 'DONE')
    }

    // Sort: overdue first, then by priority, then by due date
    return filtered.sort((a, b) => {
      const aOverdue = a.status === 'OPEN' && a.dueAt && isPast(new Date(a.dueAt))
      const bOverdue = b.status === 'OPEN' && b.dueAt && isPast(new Date(b.dueAt))
      
      if (aOverdue && !bOverdue) return -1
      if (!aOverdue && bOverdue) return 1
      
      if (a.status !== b.status) {
        return a.status === 'OPEN' ? -1 : 1
      }

      const priorityOrder = { HIGH: 3, MEDIUM: 2, LOW: 1 }
      const aPriority = priorityOrder[a.priority as keyof typeof priorityOrder] || 2
      const bPriority = priorityOrder[b.priority as keyof typeof priorityOrder] || 2
      if (aPriority !== bPriority) return bPriority - aPriority

      if (a.dueAt && b.dueAt) {
        return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime()
      }
      if (a.dueAt) return -1
      if (b.dueAt) return 1

      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })
  }, [tasks, filter])

  const getPriorityColor = (priority: string) => {
    switch (priority.toUpperCase()) {
      case 'HIGH':
        return 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
      case 'MEDIUM':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400'
      case 'LOW':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400'
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400'
    }
  }

  const isTaskOverdue = (task: Task) => {
    return task.status === 'OPEN' && task.dueAt && isPast(new Date(task.dueAt))
  }

  const formatDueDate = (dueAt: string | null) => {
    if (!dueAt) return null
    const date = new Date(dueAt)
    if (isToday(date)) return `Today, ${format(date, 'HH:mm')}`
    if (isTomorrow(date)) return `Tomorrow, ${format(date, 'HH:mm')}`
    if (isPast(date)) return `Overdue: ${format(date, 'MMM dd, HH:mm')}`
    return format(date, 'MMM dd, yyyy HH:mm')
  }

  const allAssignees = (task: Task) => {
    const assignees = task.assignees.map(ta => ta.user)
    if (task.assignedUser && !assignees.find(a => a.id === task.assignedUser!.id)) {
      assignees.push(task.assignedUser)
    }
    return assignees
  }

  const canMarkDone = (task: Task) => {
    if (isAdmin) return true
    const assignees = allAssignees(task)
    return assignees.some(a => a.id === currentUser?.id)
  }

  return (
    <Card className="rounded-2xl glass-soft shadow-sidebar">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold text-section-header flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            Tasks
          </CardTitle>
          <Button
            size="sm"
            onClick={() => setShowCreateModal(true)}
            className="h-8 px-3 rounded-full shadow-md hover:shadow-lg transition-all gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            <span className="text-xs font-medium">New Task</span>
          </Button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 mt-3">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          <div className="flex gap-1">
            {(['all', 'open', 'overdue', 'completed'] as FilterType[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  'px-2.5 py-1 text-xs font-medium rounded-full transition-all',
                  filter === f
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                )}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-400 text-sm px-3 py-2 rounded-lg">
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading tasks...</p>
        ) : filteredTasks.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <CheckCircle2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No tasks {filter !== 'all' ? `(${filter})` : ''}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredTasks.map((task) => {
              const overdue = isTaskOverdue(task)
              const assignees = allAssignees(task)
              
              return (
                <div
                  key={task.id}
                  className={cn(
                    'p-3 rounded-lg border transition-all',
                    task.status === 'DONE'
                      ? 'bg-muted/50 border-muted'
                      : overdue
                        ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800'
                        : 'bg-background border-border hover:border-primary/50'
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {task.status === 'DONE' ? (
                          <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 flex-shrink-0" />
                        ) : (
                          <Circle className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        )}
                        <h4 className={cn(
                          'text-sm font-medium',
                          task.status === 'DONE' && 'line-through text-muted-foreground'
                        )}>
                          {task.title}
                        </h4>
                        <Badge className={cn('text-[10px]', getPriorityColor(task.priority))}>
                          {task.priority}
                        </Badge>
                        {overdue && (
                          <Badge className="text-[10px] bg-red-600 text-white">
                            Overdue
                          </Badge>
                        )}
                      </div>

                      {task.description && (
                        <p className="text-xs text-muted-foreground mb-2 ml-6">
                          {task.description}
                        </p>
                      )}

                      <div className="flex items-center gap-3 ml-6 text-xs text-muted-foreground">
                        {task.dueAt && (
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            <span className={cn(overdue && 'text-red-600 dark:text-red-400 font-medium')}>
                              {formatDueDate(task.dueAt)}
                            </span>
                          </div>
                        )}
                        {assignees.length > 0 && (
                          <div className="flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            <span>
                              {assignees.map(a => a.name).join(', ')}
                            </span>
                          </div>
                        )}
                        <span className="capitalize text-[10px]">
                          {task.type.replace(/_/g, ' ').toLowerCase()}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      {task.status === 'OPEN' && isAdmin && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleNudge(task.id)}
                          className="h-7 px-2 text-xs"
                          title="Nudge assignees"
                        >
                          <Bell className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {task.status === 'OPEN' && canMarkDone(task) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleMarkDone(task.id)}
                          className="h-7 px-2 text-xs text-green-600 hover:text-green-700"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>

      {/* Create Task Modal */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create New Task</DialogTitle>
            <DialogDescription>
              Add a new task for this lead
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Task title"
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Task description (optional)"
                className="mt-1 min-h-[80px]"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="type">Type</Label>
                <Select
                  id="type"
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  className="mt-1"
                >
                  <option value="CALL">Call</option>
                  <option value="MEETING">Meeting</option>
                  <option value="EMAIL">Email</option>
                  <option value="WHATSAPP">WhatsApp</option>
                  <option value="DOCUMENT_REQUEST">Document Request</option>
                  <option value="OTHER">Other</option>
                </Select>
              </div>

              <div>
                <Label htmlFor="priority">Priority</Label>
                <Select
                  id="priority"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  className="mt-1"
                >
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="dueDate">Due Date</Label>
                <Input
                  id="dueDate"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="dueTime">Due Time</Label>
                <Input
                  id="dueTime"
                  type="time"
                  value={dueTime}
                  onChange={(e) => setDueTime(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="assignees">Assignees {isAdmin ? '' : '(including yourself)'}</Label>
              <Select
                id="assignees"
                multiple
                value={assigneeIds.map(String)}
                onChange={(e) => {
                  const selected = Array.from(e.target.selectedOptions, option => parseInt(option.value))
                  // Non-admin must include themselves
                  if (!isAdmin && !selected.includes(currentUser!.id)) {
                    selected.push(currentUser!.id)
                  }
                  setAssigneeIds(selected)
                }}
                className="mt-1"
                size={Math.min(users.length, 5)}
              >
                {users.map(user => (
                  <option key={user.id} value={user.id.toString()}>
                    {user.name} {user.email ? `(${user.email})` : ''}
                  </option>
                ))}
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                {isAdmin 
                  ? 'Select one or more assignees (Ctrl/Cmd + Click for multiple)'
                  : 'You can add other assignees, but you will always be included'}
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button
                variant="outline"
                onClick={() => setShowCreateModal(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateTask}
                disabled={submitting || !title.trim()}
              >
                {submitting ? 'Creating...' : 'Create Task'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
