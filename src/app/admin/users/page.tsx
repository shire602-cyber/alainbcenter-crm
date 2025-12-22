'use client'

import { useEffect, useState, FormEvent } from 'react'
import { MainLayout } from '@/components/layout/MainLayout'
import { BentoCard } from '@/components/dashboard/BentoCard'
import { KPICard } from '@/components/dashboard/KPICard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Select } from '@/components/ui/select'
import { EmptyState } from '@/components/ui/empty-state'
import { Plus, Users, Shield, User as UserIcon, Mail, Calendar, AlertCircle, KeyRound } from 'lucide-react'
import { format } from 'date-fns'

type User = {
  id: number
  name: string
  email: string
  role: string
  createdAt: string
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'agent',
  })

  async function loadUsers() {
    try {
      setLoading(true)
      const res = await fetch('/api/admin/users')
      if (res.ok) {
        const data = await res.json()
        setUsers(data)
      } else {
        throw new Error('Failed to load users')
      }
    } catch (err) {
      console.error(err)
      setError('Failed to load users')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadUsers()
  }, [])

  const [resetPasswordUserId, setResetPasswordUserId] = useState<number | null>(null)
  const [resetPasswordValue, setResetPasswordValue] = useState('')
  const [resettingPassword, setResettingPassword] = useState(false)

  async function handleRoleChange(userId: number, newRole: string) {
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to update user role')
      }

      await loadUsers()
    } catch (err: any) {
      console.error(err)
      setError(err.message || 'Error updating user role')
    }
  }

  async function handleResetPassword(userId: number) {
    setResetPasswordUserId(userId)
    setResetPasswordValue('')
  }

  async function confirmResetPassword() {
    if (!resetPasswordUserId || !resetPasswordValue) {
      setError('Password is required')
      return
    }

    if (resetPasswordValue.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }

    try {
      setResettingPassword(true)
      setError(null)
      const res = await fetch(`/api/admin/users/${resetPasswordUserId}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword: resetPasswordValue }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to reset password')
      }

      setResetPasswordUserId(null)
      setResetPasswordValue('')
      setError(null)
      alert('Password reset successfully!')
    } catch (err: any) {
      console.error(err)
      setError(err.message || 'Error resetting password')
    } finally {
      setResettingPassword(false)
    }
  }

  async function handleCreateUser(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (!formData.name || !formData.email || !formData.password) {
      setError('Name, email, and password are required')
      return
    }

    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }

    try {
      setSubmitting(true)
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to create user')
      }

      setFormData({ name: '', email: '', password: '', role: 'agent' })
      setShowCreateModal(false)
      await loadUsers()
    } catch (err: any) {
      console.error(err)
      setError(err.message || 'Error creating user')
    } finally {
      setSubmitting(false)
    }
  }

  const adminCount = users.filter((u) => u.role?.toUpperCase() === 'ADMIN').length
  const agentCount = users.filter((u) => u.role?.toUpperCase() === 'AGENT').length

  return (
    <MainLayout>
      <div className="space-y-2">
        {/* Compact Header */}
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              User Management
            </h1>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
              View and manage user accounts and roles
            </p>
          </div>
          <Button onClick={() => setShowCreateModal(true)} size="sm" className="gap-1.5 text-xs">
            <Plus className="h-3.5 w-3.5" />
            Create User
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <KPICard
            title="Total Users"
            value={users.length}
            icon={<Users className="h-4 w-4" />}
          />
          <KPICard
            title="Admins"
            value={adminCount}
            icon={<Shield className="h-4 w-4" />}
          />
          <KPICard
            title="Agents"
            value={agentCount}
            icon={<UserIcon className="h-4 w-4" />}
          />
        </div>

        {error && (
          <BentoCard className="border-red-200 dark:border-red-800">
            <div className="flex items-center gap-2 text-red-800 dark:text-red-200">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm font-medium">{error}</span>
            </div>
          </BentoCard>
        )}

        {/* Users List */}
        <BentoCard
          title="All Users"
          icon={<Users className="h-4 w-4" />}
        >
          <p className="text-xs text-slate-600 dark:text-slate-400 mb-3">
            Manage user roles and permissions
          </p>
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full rounded-lg" />
              ))}
            </div>
          ) : users.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No users found"
              description="Create your first user to get started"
              action={
                <Button onClick={() => setShowCreateModal(true)} size="sm" className="gap-1.5 text-xs">
                  <Plus className="h-3.5 w-3.5" />
                  Create User
                </Button>
              }
            />
          ) : (
            <div className="space-y-2">
              {users.map((user) => (
                <div
                  key={user.id}
                  className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1">
                      <div className="p-2 rounded-lg bg-primary/10">
                        <UserIcon className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1">{user.name}</h3>
                        <div className="flex items-center gap-3 text-xs text-slate-600 dark:text-slate-400">
                          <div className="flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            <span className="truncate">{user.email}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            <span>{format(new Date(user.createdAt), 'MMM dd, yyyy')}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={user.role?.toUpperCase() === 'ADMIN' ? 'default' : 'secondary'} className="text-xs">
                          {user.role?.toUpperCase() === 'ADMIN' && <Shield className="h-3 w-3 mr-1" />}
                          {user.role?.toUpperCase() || 'AGENT'}
                        </Badge>
                        <Select
                          value={user.role?.toLowerCase() || 'agent'}
                          onChange={(e) => handleRoleChange(user.id, e.target.value)}
                          className="w-28 h-8 text-xs"
                        >
                          <option value="agent">Agent</option>
                          <option value="admin">Admin</option>
                        </Select>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleResetPassword(user.id)}
                          className="gap-1 text-xs h-8"
                        >
                          <KeyRound className="h-3 w-3" />
                          Reset
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </BentoCard>

        {/* Reset Password Modal */}
        <Dialog open={resetPasswordUserId !== null} onOpenChange={(open) => !open && setResetPasswordUserId(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reset Password</DialogTitle>
              <DialogDescription>
              {`Enter a new password for ${users.find((u) => u.id === resetPasswordUserId)?.name || 'this user'}`}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1.5">New Password * (min 6 characters)</label>
                <Input
                  type="password"
                  value={resetPasswordValue}
                  onChange={(e) => setResetPasswordValue(e.target.value)}
                  minLength={6}
                  required
                  placeholder="Enter new password"
                  className="h-9 text-sm"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setResetPasswordUserId(null)} size="sm" className="text-xs">
                  Cancel
                </Button>
                <Button type="button" onClick={confirmResetPassword} disabled={resettingPassword} size="sm" className="text-xs">
                  {resettingPassword ? 'Resetting...' : 'Reset Password'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Create User Modal */}
        <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New User</DialogTitle>
              <DialogDescription>Add a new user account to the system</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreateUser} className="space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1.5">Full Name *</label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  className="h-9 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5">Email *</label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                  className="h-9 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5">Password * (min 6 characters)</label>
                <Input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  minLength={6}
                  required
                  className="h-9 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5">Role</label>
                <Select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  className="h-9 text-sm"
                >
                  <option value="agent">Agent</option>
                  <option value="admin">Admin</option>
                </Select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setShowCreateModal(false)} size="sm" className="text-xs">
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting} size="sm" className="text-xs">
                  {submitting ? 'Creating...' : 'Create User'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  )
}