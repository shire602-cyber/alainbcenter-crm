'use client'

/**
 * AI Training Area
 * 
 * Upload guidance documents and training materials for the AI autopilot
 * to follow when generating responses.
 */

import { useState, useEffect } from 'react'
import { MainLayout } from '@/components/layout/MainLayout'
import { BentoCard } from '@/components/dashboard/BentoCard'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/toast'
import { FileText, Upload, Trash2, BookOpen, Sparkles, Save } from 'lucide-react'

interface TrainingDocument {
  id: number
  title: string
  content: string
  type: 'guidance' | 'examples' | 'policies' | 'scripts'
  createdAt: string
  updatedAt: string
}

export default function AITrainingPage() {
  const { showToast } = useToast()
  const [documents, setDocuments] = useState<TrainingDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [selectedDoc, setSelectedDoc] = useState<TrainingDocument | null>(null)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [type, setType] = useState<'guidance' | 'examples' | 'policies' | 'scripts'>('guidance')
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    loadDocuments()
  }, [])

  async function loadDocuments() {
    try {
      setLoading(true)
      const res = await fetch('/api/admin/ai-training/documents')
      const data = await res.json()
      if (data.ok) {
        setDocuments(data.documents || [])
      }
    } catch (error) {
      console.error('Failed to load documents:', error)
    } finally {
      setLoading(false)
    }
  }

  async function saveDocument() {
    if (!title.trim() || !content.trim()) {
      showToast('Please provide both title and content', 'error')
      return
    }

    try {
      setSaving(true)
      const res = await fetch('/api/admin/ai-training/documents', {
        method: selectedDoc ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedDoc?.id,
          title: title.trim(),
          content: content.trim(),
          type,
        }),
      })

      const data = await res.json()
      if (data.ok) {
        showToast(selectedDoc ? 'Document updated' : 'Document saved', 'success')
        setTitle('')
        setContent('')
        setSelectedDoc(null)
        await loadDocuments()
      } else {
        showToast(data.error || 'Failed to save document', 'error')
      }
    } catch (error) {
      showToast('Failed to save document', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function deleteDocument(id: number) {
    if (!confirm('Are you sure you want to delete this document?')) return

    try {
      const res = await fetch(`/api/admin/ai-training/documents/${id}`, {
        method: 'DELETE',
      })

      const data = await res.json()
      if (data.ok) {
        showToast('Document deleted', 'success')
        if (selectedDoc?.id === id) {
          setSelectedDoc(null)
          setTitle('')
          setContent('')
        }
        await loadDocuments()
      } else {
        showToast(data.error || 'Failed to delete document', 'error')
      }
    } catch (error) {
      showToast('Failed to delete document', 'error')
    }
  }

  function selectDocument(doc: TrainingDocument) {
    setSelectedDoc(doc)
    setTitle(doc.title)
    setContent(doc.content)
    setType(doc.type)
  }

  function newDocument() {
    setSelectedDoc(null)
    setTitle('')
    setContent('')
    setType('guidance')
  }

  const typeLabels = {
    guidance: 'Guidance',
    examples: 'Examples',
    policies: 'Policies',
    scripts: 'Scripts',
  }

  return (
    <MainLayout>
      <div className="space-y-2">
        {/* Compact Header - matching other admin pages */}
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              AI Training Area
            </h1>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
              Upload guidance documents and training materials for the AI autopilot
            </p>
          </div>
          <Button onClick={newDocument} size="sm" className="gap-1.5 text-xs">
            <BookOpen className="h-3.5 w-3.5" />
            New Document
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-2">
          {/* Left: Document List */}
          <BentoCard className="lg:col-span-1" title="Training Documents">
            <p className="text-xs text-slate-600 dark:text-slate-400 mb-3">
              {documents.length} document{documents.length !== 1 ? 's' : ''} available
            </p>
            {loading ? (
              <div className="space-y-2">
                <div className="h-16 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
                <div className="h-16 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
              </div>
            ) : documents.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No documents yet</p>
                <p className="text-xs text-slate-500">Create your first training document</p>
              </div>
            ) : (
              <div className="space-y-2">
                {documents.map((doc) => (
                  <div
                    key={doc.id}
                    onClick={() => selectDocument(doc)}
                    className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedDoc?.id === doc.id
                        ? 'bg-primary/10 border-primary'
                        : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-sm truncate">{doc.title}</h3>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="outline" className="text-xs">
                            {typeLabels[doc.type]}
                          </Badge>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          deleteDocument(doc.id)
                        }}
                        className="h-6 w-6 p-0 text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </BentoCard>

          {/* Right: Editor */}
          <BentoCard className="lg:col-span-2" title={selectedDoc ? 'Edit Document' : 'New Training Document'}>
            <p className="text-xs text-slate-600 dark:text-slate-400 mb-3">
              {selectedDoc
                ? 'Update the training document content'
                : 'Create a new training document for the AI autopilot'}
            </p>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Customer Service Guidelines"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="type">Type</Label>
                <select
                  id="type"
                  value={type}
                  onChange={(e) => setType(e.target.value as any)}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-md bg-white dark:bg-slate-900"
                >
                  <option value="guidance">Guidance</option>
                  <option value="examples">Examples</option>
                  <option value="policies">Policies</option>
                  <option value="scripts">Scripts</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="content">Content</Label>
                <Textarea
                  id="content"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Enter training content here. This will be used to guide the AI autopilot when generating responses..."
                  rows={20}
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  This content will be used to guide the AI when generating responses. Be specific and clear.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Button onClick={saveDocument} disabled={saving || !title.trim() || !content.trim()}>
                  <Save className="h-4 w-4 mr-2" />
                  {saving ? 'Saving...' : selectedDoc ? 'Update' : 'Save'}
                </Button>
                {selectedDoc && (
                  <Button variant="outline" onClick={newDocument}>
                    Cancel
                  </Button>
                )}
              </div>
            </div>
          </BentoCard>
        </div>
      </div>
    </MainLayout>
  )
}

