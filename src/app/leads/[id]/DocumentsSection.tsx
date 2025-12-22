'use client'

import { useState, FormEvent, useEffect } from 'react'

type Document = {
  id: number
  type: string
  fileName: string
  fileUrl: string
  uploadedAt: string
}

export default function DocumentsSection({ leadId }: { leadId: number }) {
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [type, setType] = useState('other')
  const [fileName, setFileName] = useState('')

  async function loadDocuments() {
    try {
      setLoading(true)
      const res = await fetch(`/api/leads/${leadId}/documents`)
      const data = await res.json()
      setDocuments(data)
    } catch (err) {
      console.error(err)
      setError('Failed to load documents')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDocuments()
  }, [leadId])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (!fileName.trim()) {
      setError('File name is required')
      return
    }

    try {
      setSubmitting(true)
      const res = await fetch(`/api/leads/${leadId}/documents`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type,
          fileName: fileName.trim(),
        }),
      })

      if (!res.ok) {
        throw new Error('Failed to create document')
      }

      setFileName('')
      await loadDocuments()
    } catch (err) {
      console.error(err)
      setError('Error creating document')
    } finally {
      setSubmitting(false)
    }
  }

  function formatDate(dateString: string) {
    return new Date(dateString).toLocaleDateString()
  }

  return (
    <div className="bg-white shadow rounded-lg p-4 space-y-4">
      <h2 className="text-lg font-semibold">Documents</h2>

      {error && (
        <div className="bg-red-100 text-red-800 text-sm px-3 py-2 rounded">
          {error}
        </div>
      )}

      {/* Add Document Form */}
      <form onSubmit={handleSubmit} className="space-y-2 border-b pb-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <select
            className="border rounded px-3 py-2 text-sm"
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            <option value="passport">Passport</option>
            <option value="photo">Photo</option>
            <option value="visa_copy">Visa Copy</option>
            <option value="license">License</option>
            <option value="other">Other</option>
          </select>
          <input
            type="text"
            className="border rounded px-3 py-2 text-sm"
            placeholder="File name"
            value={fileName}
            onChange={(e) => setFileName(e.target.value)}
            required
          />
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded disabled:opacity-60"
        >
          {submitting ? 'Adding...' : 'Add Document'}
        </button>
      </form>

      {/* Documents List */}
      {loading ? (
        <p className="text-sm text-gray-500">Loading...</p>
      ) : documents.length === 0 ? (
        <p className="text-sm text-gray-500">No documents yet.</p>
      ) : (
        <div className="space-y-2">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center justify-between p-2 border rounded text-sm"
            >
              <div>
                <span className="font-medium capitalize">{doc.type.replace('_', ' ')}</span>
                <span className="text-gray-500 ml-2">{doc.fileName}</span>
                <span className="text-gray-400 ml-2 text-xs">
                  Uploaded: {formatDate(doc.uploadedAt)}
                </span>
              </div>
              <span className="text-xs text-gray-400">{doc.fileUrl}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

