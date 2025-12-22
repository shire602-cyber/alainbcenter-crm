/**
 * Enhanced Documents Card with Compliance Checklist
 * 
 * Shows required documents, upload status, expiry tracking, and compliance badge
 */

'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { 
  FileText, 
  Upload, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle,
  Clock,
  File,
  Download,
  Trash2,
  Sparkles,
  Mail,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { format, differenceInDays, parseISO } from 'date-fns'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
// Use toast notification function - check if hook exists or use window events

interface DocumentRequirement {
  id: number
  documentType: string
  label: string
  isMandatory: boolean
  order: number
}

interface Document {
  id: number
  fileName: string
  category: string | null
  expiryDate: string | null
  url: string | null
  createdAt: string
}

interface ComplianceStatus {
  status: 'GOOD' | 'WARNING' | 'CRITICAL'
  missingMandatory: string[]
  expiringSoon: string[]
  expired: string[]
  notes: string
  score: number
}

interface DocumentsCardEnhancedProps {
  leadId: number
  serviceType?: string
  className?: string
}

export function DocumentsCardEnhanced({ 
  leadId, 
  serviceType,
  className 
}: DocumentsCardEnhancedProps) {
  const [requirements, setRequirements] = useState<DocumentRequirement[]>([])
  const [documents, setDocuments] = useState<Document[]>([])
  const [compliance, setCompliance] = useState<ComplianceStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  // Toast notifications - using window events or direct showToast if available
  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    if (typeof window !== 'undefined') {
      // Try to use global toast if available
      const event = new CustomEvent('toast', { detail: { message, type } })
      window.dispatchEvent(event)
    }
    console.log(`[${type.toUpperCase()}] ${message}`)
  }

  useEffect(() => {
    loadDocuments()
    loadRequirements()
    loadCompliance()
  }, [leadId, serviceType])

  async function loadDocuments() {
    try {
      const res = await fetch(`/api/leads/${leadId}/documents`)
      if (res.ok) {
        const data = await res.json()
        setDocuments(data.documents || data || [])
        // Also set requirements if returned
        if (data.requirements) {
          setRequirements(data.requirements)
        }
      }
    } catch (err) {
      console.error('Failed to load documents:', err)
    } finally {
      setLoading(false)
    }
  }

  async function loadRequirements() {
    if (!serviceType) return
    
    try {
      const res = await fetch(`/api/service-document-requirements?serviceType=${serviceType}`)
      if (res.ok) {
        const data = await res.json()
        setRequirements(data.requirements || data.requirements || [])
      }
    } catch (err) {
      console.error('Failed to load requirements:', err)
    }
  }

  async function loadCompliance() {
    try {
      const res = await fetch(`/api/leads/${leadId}/compliance`)
      if (res.ok) {
        const data = await res.json()
        setCompliance(data.compliance)
      }
    } catch (err) {
      console.error('Failed to load compliance:', err)
    }
  }

  const [showUploadModal, setShowUploadModal] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [selectedDocType, setSelectedDocType] = useState<string>('OTHER')
  const [selectedExpiryDate, setSelectedExpiryDate] = useState<string>('')

  async function handleFileUpload(e?: React.ChangeEvent<HTMLInputElement>) {
    const file = e?.target.files?.[0] || selectedFile
    if (!file) return

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('category', selectedDocType)

      const res = await fetch(`/api/leads/${leadId}/documents/upload`, {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Upload failed')
      }

      const uploadedDoc = await res.json()

      // If expiry date was provided, update the document
      if (selectedExpiryDate) {
        try {
          await fetch(`/api/leads/${leadId}/documents/${uploadedDoc.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              expiryDate: selectedExpiryDate,
            }),
          })
        } catch (err) {
          console.warn('Failed to set expiry date:', err)
        }
      }

      showToast('Document uploaded successfully', 'success')
      setShowUploadModal(false)
      setSelectedFile(null)
      setSelectedDocType('OTHER')
      setSelectedExpiryDate('')
      await loadDocuments()
      await loadCompliance()
    } catch (err: any) {
      showToast(err.message || 'Failed to upload document', 'error')
    } finally {
      setUploading(false)
      if (e?.target) {
        e.target.value = ''
      }
    }
  }

  async function handleDeleteDocument(docId: number) {
    if (!confirm('Delete this document?')) return

    try {
      const res = await fetch(`/api/leads/${leadId}/documents/${docId}`, {
        method: 'DELETE',
      })

      if (!res.ok) throw new Error('Delete failed')

      showToast('Document deleted', 'success')
      await loadDocuments()
      await loadCompliance()
    } catch (err: any) {
      showToast(err.message || 'Failed to delete document', 'error')
    }
  }

  async function handleAIDocReminder(channel: 'WHATSAPP' | 'EMAIL' = 'WHATSAPP') {
    try {
      const res = await fetch(`/api/leads/${leadId}/docs/ai-reminder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel }),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to generate reminder')
      }

      const data = await res.json()
      showToast(`AI ${channel} reminder generated`, 'success')
      
      // Emit event to fill composer
      if (typeof window !== 'undefined') {
        const event = new CustomEvent('ai-draft-generated', {
          detail: {
            draft: data.draft,
            channel: channel.toLowerCase(),
          },
        })
        window.dispatchEvent(event)
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to generate reminder', 'error')
    }
  }

  const getComplianceBadgeColor = () => {
    if (!compliance) return 'bg-gray-100 text-gray-700'
    if (compliance.status === 'CRITICAL') return 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400'
    if (compliance.status === 'WARNING') return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400'
    return 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400'
  }

  return (
    <Card className={cn('rounded-2xl glass-soft shadow-sidebar', className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold text-section-header flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Documents
            {compliance && (
              <Badge className={cn('text-xs', getComplianceBadgeColor())}>
                {compliance.status}
              </Badge>
            )}
          </CardTitle>
          <div className="flex gap-1">
            {compliance && (compliance.missingMandatory.length > 0 || compliance.expired.length > 0) && (
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleAIDocReminder('WHATSAPP')}
                  className="h-7 px-2"
                  title="AI WhatsApp Reminder"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleAIDocReminder('EMAIL')}
                  className="h-7 px-2"
                  title="AI Email Reminder"
                >
                  <Mail className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowUploadModal(true)}
              className="h-7 px-2"
              title="Upload Document"
            >
              <Upload className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        {compliance && compliance.score < 100 && compliance.notes && (
          <p className="text-xs text-muted-foreground mt-1">
            Compliance: {compliance.score}/100 - {compliance.notes}
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Compliance Progress Bar */}
        {compliance && requirements.length > 0 && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Compliance Progress</span>
              <span className="font-medium">
                {requirements.length - compliance.missingMandatory.length}/{requirements.length} docs
              </span>
            </div>
            <div className="w-full bg-muted rounded-full h-2">
              <div
                className={cn(
                  'h-2 rounded-full transition-all',
                  compliance.status === 'CRITICAL' && 'bg-red-500',
                  compliance.status === 'WARNING' && 'bg-yellow-500',
                  compliance.status === 'GOOD' && 'bg-green-500'
                )}
                style={{
                  width: `${((requirements.length - compliance.missingMandatory.length) / requirements.length) * 100}%`,
                }}
              />
            </div>
          </div>
        )}

        {/* Required Documents Checklist */}
        {requirements.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Required Documents</p>
            {requirements.map((req) => {
              const matchingDoc = documents.find(
                (d) => d.category?.toLowerCase() === req.documentType.toLowerCase()
              )
              
              const isExpired = matchingDoc?.expiryDate 
                ? differenceInDays(parseISO(matchingDoc.expiryDate), new Date()) < 0
                : false
              
              const isExpiringSoon = matchingDoc?.expiryDate 
                ? differenceInDays(parseISO(matchingDoc.expiryDate), new Date()) <= 30 && 
                  differenceInDays(parseISO(matchingDoc.expiryDate), new Date()) > 0
                : false

              return (
                <div
                  key={req.id}
                  className={cn(
                    'flex items-center gap-2 p-2 rounded-lg border text-xs',
                    matchingDoc && !isExpired && 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800',
                    isExpired && 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
                    isExpiringSoon && 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800',
                    !matchingDoc && req.isMandatory && 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700',
                    !matchingDoc && !req.isMandatory && 'border-border'
                  )}
                >
                  {matchingDoc && !isExpired ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 flex-shrink-0" />
                  ) : isExpired ? (
                    <XCircle className="h-4 w-4 text-red-600 dark:text-red-400 flex-shrink-0" />
                  ) : isExpiringSoon ? (
                    <Clock className="h-4 w-4 text-yellow-600 dark:text-yellow-400 flex-shrink-0" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-gray-400 flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={cn(
                        'font-medium',
                        !matchingDoc && req.isMandatory && 'text-red-700 dark:text-red-400',
                        isExpired && 'text-red-700 dark:text-red-400',
                        isExpiringSoon && 'text-yellow-700 dark:text-yellow-400'
                      )}>
                        {req.label}
                      </p>
                      {req.isMandatory && (
                        <Badge variant="outline" className="text-[10px]">Required</Badge>
                      )}
                      {!matchingDoc && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 px-2 text-[10px]"
                          onClick={() => setShowUploadModal(true)}
                        >
                          Upload
                        </Button>
                      )}
                      {matchingDoc && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 px-2 text-[10px]"
                          onClick={() => window.open(matchingDoc.url || `/api/documents/${matchingDoc.id}/download`, '_blank')}
                        >
                          View
                        </Button>
                      )}
                    </div>
                    {matchingDoc && (
                      <p className="text-muted-foreground text-[10px] mt-0.5">
                        {matchingDoc.fileName}
                        {matchingDoc.expiryDate && (
                          <span className={cn(
                            'ml-2',
                            isExpired && 'text-red-600 dark:text-red-400 font-medium',
                            isExpiringSoon && 'text-yellow-600 dark:text-yellow-400'
                          )}>
                            {isExpired 
                              ? `Expired ${Math.abs(differenceInDays(parseISO(matchingDoc.expiryDate), new Date()))} days ago`
                              : `Expires ${differenceInDays(parseISO(matchingDoc.expiryDate), new Date())} days`
                            }
                          </span>
                        )}
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Uploaded Documents List */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Uploaded Documents</p>
          {loading ? (
            <p className="text-xs text-muted-foreground">Loading...</p>
          ) : documents.length === 0 ? (
            <div className="text-center py-4 text-muted-foreground">
              <FileText className="h-8 w-8 mx-auto mb-1 opacity-50" />
              <p className="text-xs">No documents uploaded</p>
              <p className="text-[10px] mt-1">Click upload to add documents</p>
            </div>
          ) : (
            documents.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center justify-between p-2 rounded-lg border hover:bg-muted/50 transition-colors group"
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <File className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{doc.fileName}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {doc.category && (
                        <Badge variant="outline" className="text-[10px]">
                          {doc.category}
                        </Badge>
                      )}
                      <span className="text-[10px] text-muted-foreground">
                        {format(parseISO(doc.createdAt), 'MMM dd, yyyy')}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {doc.url && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() => window.open(doc.url!, '_blank')}
                      title="View"
                    >
                      <Download className="h-3 w-3" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-red-600 hover:text-red-700"
                    onClick={() => handleDeleteDocument(doc.id)}
                    title="Delete"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Compliance Details */}
        {compliance && (compliance.missingMandatory.length > 0 || compliance.expired.length > 0 || compliance.expiringSoon.length > 0) && (
          <div className={cn(
            'p-3 rounded-lg border text-xs',
            compliance.status === 'CRITICAL' && 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
            compliance.status === 'WARNING' && 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'
          )}>
            <p className="font-medium mb-2">Compliance Issues:</p>
            {compliance.expired.length > 0 && (
              <div className="space-y-1">
                <p className="text-red-700 dark:text-red-400 font-medium">Expired:</p>
                <ul className="list-disc list-inside space-y-0.5 text-red-600 dark:text-red-400">
                  {compliance.expired.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
            {compliance.missingMandatory.length > 0 && (
              <div className="space-y-1 mt-2">
                <p className="font-medium">Missing:</p>
                <ul className="list-disc list-inside space-y-0.5 text-muted-foreground">
                  {compliance.missingMandatory.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
            {compliance.expiringSoon.length > 0 && (
              <div className="space-y-1 mt-2">
                <p className="text-yellow-700 dark:text-yellow-400 font-medium">Expiring Soon:</p>
                <ul className="list-disc list-inside space-y-0.5 text-yellow-600 dark:text-yellow-400">
                  {compliance.expiringSoon.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>

      {/* Upload Modal */}
      <Dialog open={showUploadModal} onOpenChange={setShowUploadModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload Document</DialogTitle>
            <DialogDescription>
              Select a file and specify document type
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>File *</Label>
              <Input
                type="file"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  setSelectedFile(file || null)
                }}
                accept="image/*,application/pdf,.doc,.docx"
                disabled={uploading}
              />
            </div>
            <div>
              <Label>Document Type *</Label>
              <select
                value={selectedDocType}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedDocType(e.target.value)}
                className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="PASSPORT">Passport</option>
                <option value="EID">Emirates ID</option>
                <option value="PHOTO">Photo</option>
                <option value="EJARI">Ejari</option>
                <option value="COMPANY_LICENSE">Company License</option>
                <option value="BANK_STATEMENT">Bank Statement</option>
                <option value="TENANCY_CONTRACT">Tenancy Contract</option>
                <option value="VISA_PAGE">Visa Page</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            <div>
              <Label>Expiry Date (Optional)</Label>
              <Input
                type="date"
                value={selectedExpiryDate}
                onChange={(e) => setSelectedExpiryDate(e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Set if this document expires (e.g., EID, Visa)
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowUploadModal(false)
                  setSelectedFile(null)
                  setSelectedDocType('OTHER')
                  setSelectedExpiryDate('')
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={() => handleFileUpload()}
                disabled={!selectedFile || uploading}
              >
                {uploading ? 'Uploading...' : 'Upload'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  )
}


