'use client'

import { useState, FormEvent } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Plus, Trash2, CheckCircle2, XCircle, Loader2, Edit } from 'lucide-react'
import { format } from 'date-fns'

type WhatsAppTemplate = {
  id: number
  name: string
  language: string
  body: string
  status: string
  createdAt: string
  updatedAt: string
}

export function WhatsAppTemplatesClient({
  initialTemplates,
}: {
  initialTemplates: WhatsAppTemplate[]
}) {
  const placeholderHint = 'Use {{1}}, {{2}}, etc. for variable placeholders'
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>(initialTemplates)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<WhatsAppTemplate | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    language: 'en_US',
    body: '',
    status: 'draft',
  })

  async function loadTemplates() {
    try {
      setLoading(true)
      const res = await fetch('/api/whatsapp/templates')
      if (res.ok) {
        const data = await res.json()
        setTemplates(data)
      }
    } catch (err) {
      console.error('Failed to load templates:', err)
    } finally {
      setLoading(false)
    }
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (!formData.name || !formData.body) {
      setError('Name and body are required')
      return
    }

    try {
      setLoading(true)
      const res = await fetch('/api/whatsapp/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          language: formData.language,
          body: formData.body,
          status: formData.status,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to create template')
      }

      const newTemplate = await res.json()
      setTemplates([newTemplate, ...templates])
      setShowCreateModal(false)
      setFormData({ name: '', language: 'en_US', body: '', status: 'draft' })
    } catch (err: any) {
      console.error(err)
      setError(err.message || 'Error creating template')
    } finally {
      setLoading(false)
    }
  }

  async function handleUpdate(templateId: number, updates: Partial<WhatsAppTemplate>) {
    try {
      setLoading(true)
      const res = await fetch(`/api/whatsapp/templates/${templateId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })

      if (res.ok) {
        await loadTemplates()
      } else {
        const data = await res.json()
        throw new Error(data.error || 'Failed to update template')
      }
    } catch (err: any) {
      console.error('Failed to update template:', err)
      setError(err.message || 'Failed to update template')
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(templateId: number) {
    if (!confirm('Are you sure you want to delete this template?')) return

    try {
      setLoading(true)
      const res = await fetch(`/api/whatsapp/templates/${templateId}`, {
        method: 'DELETE',
      })

      if (res.ok) {
        setTemplates(templates.filter((t) => t.id !== templateId))
      } else {
        const data = await res.json()
        throw new Error(data.error || 'Failed to delete template')
      }
    } catch (err: any) {
      console.error('Failed to delete template:', err)
      setError(err.message || 'Failed to delete template')
    } finally {
      setLoading(false)
    }
  }

  const approvedTemplates = templates.filter((t) => t.status === 'approved')

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <p className="text-muted-foreground">
            {templates.length} total templates • {approvedTemplates.length} approved
          </p>
        </div>
        <Button onClick={() => setShowCreateModal(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Create Template
        </Button>
      </div>

      {error && (
        <Card className="border-destructive/50 bg-destructive/10">
          <CardContent className="p-4">
            <p className="text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4">
        {templates.map((template) => (
          <Card key={template.id} className="shadow-md">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-lg">{template.name}</CardTitle>
                  <CardDescription className="mt-1">
                    Language: {template.language} • Created:{' '}
                    {format(new Date(template.createdAt), 'MMM dd, yyyy')}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    variant={
                      template.status === 'approved' ? 'success' : 'secondary'
                    }
                  >
                    {template.status}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap mb-4 bg-muted p-3 rounded">
                {template.body}
              </p>
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Updated {format(new Date(template.updatedAt), 'MMM dd, yyyy HH:mm')}
                </p>
                <div className="flex gap-2">
                  {template.status !== 'approved' && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleUpdate(template.id, { status: 'approved' })}
                      disabled={loading}
                    >
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      Approve
                    </Button>
                  )}
                  {template.status === 'approved' && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleUpdate(template.id, { status: 'draft' })}
                      disabled={loading}
                    >
                      <XCircle className="h-4 w-4 mr-2" />
                      Mark Draft
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDelete(template.id)}
                    disabled={loading}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {templates.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground mb-4">No templates created yet</p>
            <Button onClick={() => setShowCreateModal(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create First Template
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Create Template Modal */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Create WhatsApp Template</DialogTitle>
            <DialogDescription>
              Create a new message template. Templates must match approved templates in Meta Business Manager.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Template Name *</label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="welcome_message"
                required
              />
              <p className="text-xs text-muted-foreground mt-1">
                Must match the template name in Meta Business Manager (lowercase with underscores)
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Language</label>
              <select
                value={formData.language}
                onChange={(e) => setFormData({ ...formData, language: e.target.value })}
                className="w-full p-2 border rounded-md"
              >
                <option value="en_US">English (US)</option>
                <option value="en_GB">English (UK)</option>
                <option value="ar">Arabic</option>
                <option value="fr">French</option>
                <option value="hi">Hindi</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Template Body *</label>
              <Textarea
                value={formData.body}
                onChange={(e) => setFormData({ ...formData, body: e.target.value })}
                placeholder="Enter template message content..."
                rows={6}
                required
              />
              <p className="text-xs text-muted-foreground mt-1">
                {placeholderHint}
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Status</label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                className="w-full p-2 border rounded-md"
              >
                <option value="draft">Draft</option>
                <option value="approved">Approved</option>
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowCreateModal(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Template
                  </>
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
