'use client'

import { useEffect, useState, FormEvent } from 'react'
import { MainLayout } from '@/components/layout/MainLayout'
import { BentoCard } from '@/components/dashboard/BentoCard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { Plus, Edit2, Trash2, Briefcase, AlertCircle, CheckCircle2, XCircle } from 'lucide-react'

type ServiceType = {
  id: number
  name: string
  code: string | null
  isActive: boolean
  createdAt: string
  _count?: { leads: number }
}

export default function ServicesPage() {
  const [services, setServices] = useState<ServiceType[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState<ServiceType | null>(null)
  const [formData, setFormData] = useState({ name: '', code: '' })

  async function loadServices() {
    try {
      setLoading(true)
      const res = await fetch('/api/admin/services')
      if (res.ok) {
        const data = await res.json()
        setServices(data)
      }
    } catch (err) {
      console.error(err)
      setError('Failed to load services')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadServices()
  }, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (!formData.name.trim()) {
      setError('Service name is required')
      return
    }

    try {
      setSubmitting(true)
      const url = editingId ? `/api/admin/services/${editingId}` : '/api/admin/services'
      const method = editingId ? 'PATCH' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to save service')
      }

      setFormData({ name: '', code: '' })
      setEditingId(null)
      setShowCreateModal(false)
      await loadServices()
    } catch (err: any) {
      setError(err.message || 'Error saving service')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleToggleActive(id: number, currentStatus: boolean) {
    try {
      const res = await fetch(`/api/admin/services/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !currentStatus }),
      })

      if (res.ok) {
        await loadServices()
      }
    } catch (err) {
      setError('Failed to toggle service status')
    }
  }

  async function handleDelete(id: number) {
    try {
      const res = await fetch(`/api/admin/services/${id}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to delete service')
      }

      setShowDeleteModal(null)
      await loadServices()
    } catch (err: any) {
      setError(err.message || 'Error deleting service')
    }
  }

  function startEdit(service: ServiceType) {
    setFormData({ name: service.name, code: service.code || '' })
    setEditingId(service.id)
    setShowCreateModal(true)
  }

  return (
    <MainLayout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Service Types
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage business services (Business Setup, Visas, etc.)
            </p>
          </div>
          <Button 
            onClick={() => {
              setFormData({ name: '', code: '' })
              setEditingId(null)
              setShowCreateModal(true)
            }}
            size="sm"
            className="gap-1.5 text-xs"
          >
            <Plus className="h-3.5 w-3.5" />
            New Service
          </Button>
        </div>

        {error && (
          <BentoCard className="border-red-200">
            <div className="flex items-center gap-2 text-red-800">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm font-medium">{error}</span>
            </div>
          </BentoCard>
        )}

        {/* Services Grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-32 rounded-xl" />
            ))}
          </div>
        ) : services.length === 0 ? (
          <EmptyState
            icon={Briefcase}
            title="No services yet"
            description="Create your first service type to get started"
            action={
              <Button onClick={() => setShowCreateModal(true)} size="sm" className="gap-1.5 text-xs">
                <Plus className="h-3.5 w-3.5" />
                Create Service
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {services.map((service) => (
              <BentoCard
                key={service.id}
                title={service.name}
                icon={<Briefcase className="h-4 w-4" />}
                badge={
                  <Badge variant={service.isActive ? 'default' : 'secondary'} className="text-xs">
                    {service.isActive ? (
                      <>
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Active
                      </>
                    ) : (
                      <>
                        <XCircle className="h-3 w-3 mr-1" />
                        Inactive
                      </>
                    )}
                  </Badge>
                }
              >
                {service.code && (
                  <p className="text-xs text-slate-600 font-mono bg-slate-100 px-2 py-1 rounded inline-block mb-2">
                    {service.code}
                  </p>
                )}
                {service._count && (
                  <div className="flex items-center gap-1.5 text-xs text-slate-600 mb-3">
                    <Briefcase className="h-3 w-3" />
                    <span>{service._count.leads} {service._count.leads === 1 ? 'lead' : 'leads'}</span>
                  </div>
                )}
                <div className="flex gap-2 pt-2 border-t border-slate-200">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 gap-1 text-xs h-8"
                    onClick={() => startEdit(service)}
                  >
                    <Edit2 className="h-3 w-3" />
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs h-8"
                    onClick={() => handleToggleActive(service.id, service.isActive)}
                  >
                    {service.isActive ? 'Deactivate' : 'Activate'}
                  </Button>
                  {(!service._count || service._count.leads === 0) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive h-8 w-8 p-0"
                      onClick={() => setShowDeleteModal(service)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </BentoCard>
            ))}
          </div>
        )}

        {/* Create/Edit Modal */}
        <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingId ? 'Edit Service' : 'Create New Service'}</DialogTitle>
              <DialogDescription>
                {editingId ? 'Update service details' : 'Add a new service type to your system'}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1.5">Service Name *</label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Business Setup"
                  required
                  className="h-9 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5">Code (Optional)</label>
                <Input
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  placeholder="e.g., BS001"
                  className="h-9 text-sm"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setShowCreateModal(false)} size="sm" className="text-xs">
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting} size="sm" className="text-xs">
                  {submitting ? 'Saving...' : editingId ? 'Update' : 'Create'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Modal */}
        <Dialog open={!!showDeleteModal} onOpenChange={() => setShowDeleteModal(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Service</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete "{showDeleteModal?.name}"? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowDeleteModal(null)} size="sm" className="text-xs">
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => showDeleteModal && handleDelete(showDeleteModal.id)}
                size="sm"
                className="text-xs"
              >
                Delete
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  )
}
