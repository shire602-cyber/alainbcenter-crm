/**
 * Enhanced Documents Card with Compliance Checklist
 * 
 * Shows required documents, upload status, expiry tracking, and compliance badge
 */

'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
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
  Calendar,
  Loader2,
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
  const [uploadProgress, setUploadProgress] = useState(0)
  
  // Stable modal state - prevent flicker
  const [showUploadModal, setShowUploadModal] = useState(false)
  const modalMountedRef = useRef(false)
  
  // Toast notifications - using window events or direct showToast if available
  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    if (typeof window !== 'undefined') {
      // Try to use global toast if available
      const event = new CustomEvent('toast', { detail: { message, type } })
      window.dispatchEvent(event)
    }
    console.log(`[${type.toUpperCase()}] ${message}`)
  }, [])

  // Stable load functions
  const loadDocuments = useCallback(async () => {
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
  }, [leadId])

  const loadRequirements = useCallback(async () => {
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
  }, [serviceType])

  const loadCompliance = useCallback(async () => {
    try {
      const res = await fetch(`/api/leads/${leadId}/compliance`)
      if (res.ok) {
        const data = await res.json()
        setCompliance(data.compliance)
      }
    } catch (err) {
      console.error('Failed to load compliance:', err)
    }
  }, [leadId])

  // Load data only when leadId or serviceType changes (not on every render)
  useEffect(() => {
    setLoading(true)
    loadDocuments()
    loadRequirements()
    loadCompliance()
  }, [loadDocuments, loadRequirements, loadCompliance])

  // Handle modal open/close - stable state
  const handleOpenModal = useCallback(() => {
    modalMountedRef.current = true
    setShowUploadModal(true)
  }, [])

  const handleCloseModal = useCallback(() => {
    // Only close if not uploading
    if (!uploading) {
      setShowUploadModal(false)
      modalMountedRef.current = false
    }
  }, [uploading])

  // Stable upload handler - only refetch after success
  const handleFileUpload = useCallback(async (file: File, docType: string, expiryDate: string) => {
    if (!file) return

    setUploading(true)
    setUploadProgress(0)
    
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('category', docType)

      // Use XMLHttpRequest for progress tracking
      const xhr = new XMLHttpRequest()
      
      const uploadPromise = new Promise<any>((resolve, reject) => {
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const percentComplete = (e.loaded / e.total) * 100
            setUploadProgress(percentComplete)
          }
        })

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const response = JSON.parse(xhr.responseText)
              resolve(response)
            } catch (err) {
              reject(new Error('Invalid response'))
            }
          } else {
            try {
              const error = JSON.parse(xhr.responseText)
              reject(new Error(error.error || 'Upload failed'))
            } catch {
              reject(new Error('Upload failed'))
            }
          }
        })

        xhr.addEventListener('error', () => {
          reject(new Error('Network error'))
        })

        xhr.open('POST', `/api/leads/${leadId}/documents/upload`)
        xhr.send(formData)
      })

      const uploadedDoc = await uploadPromise

      // If expiry date was provided, update the document
      if (expiryDate) {
        try {
          await fetch(`/api/leads/${leadId}/documents/${uploadedDoc.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              expiryDate: expiryDate,
            }),
          })
        } catch (err) {
          console.warn('Failed to set expiry date:', err)
        }
      }

      showToast('Document uploaded successfully', 'success')
      
      // Close modal and reset state
      setShowUploadModal(false)
      modalMountedRef.current = false
      setUploadProgress(0)
      
      // Refetch documents ONLY after successful upload
      await loadDocuments()
      await loadCompliance()
    } catch (err: any) {
      showToast(err.message || 'Failed to upload document', 'error')
    } finally {
      setUploading(false)
      setUploadProgress(0)
    }
  }, [leadId, showToast, loadDocuments, loadCompliance])

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
    if (compliance.status === 'CRITICAL') return 'bg-red-100 text-red-700 font-semibold'
    if (compliance.status === 'WARNING') return 'bg-yellow-100 text-yellow-700 font-semibold'
    return 'bg-green-100 text-green-700 font-semibold'
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
              variant="default"
              size="sm"
              onClick={handleOpenModal}
              className="h-8 px-3 rounded-full shadow-md hover:shadow-lg transition-all gap-1.5"
              title="Upload Document or Media"
            >
              <Upload className="h-3.5 w-3.5" />
              <span className="text-xs font-medium">Upload</span>
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
                    matchingDoc && !isExpired && 'bg-green-50 border-green-200/60',
                    isExpired && 'bg-red-50 border-red-200/60',
                    isExpiringSoon && 'bg-yellow-50 border-yellow-200/60',
                    !matchingDoc && req.isMandatory && 'bg-gray-50 border-gray-200/60',
                    !matchingDoc && !req.isMandatory && 'border-border'
                  )}
                >
                  {matchingDoc && !isExpired ? (
                    <CheckCircle2 className="h-4 w-4 text-green-700 flex-shrink-0" />
                  ) : isExpired ? (
                    <XCircle className="h-4 w-4 text-red-700 flex-shrink-0" />
                  ) : isExpiringSoon ? (
                    <Clock className="h-4 w-4 text-yellow-600 flex-shrink-0" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-gray-400 flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={cn(
                        'font-medium',
                        !matchingDoc && req.isMandatory && 'text-red-700',
                        isExpired && 'text-red-700',
                        isExpiringSoon && 'text-yellow-700'
                      )}>
                        {req.label}
                      </p>
                      {req.isMandatory && (
                        <Badge variant="outline" className="text-[10px]">Required</Badge>
                      )}
                      {!matchingDoc && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 px-2.5 text-[10px] rounded-full shadow-sm hover:shadow-md transition-all"
                          onClick={handleOpenModal}
                        >
                          <Upload className="h-3 w-3 mr-1" />
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
                            isExpired && 'text-red-600 font-medium',
                            isExpiringSoon && 'text-yellow-600'
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
            compliance.status === 'CRITICAL' && 'bg-red-50 border-red-200',
            compliance.status === 'WARNING' && 'bg-yellow-50 border-yellow-200'
          )}>
            <p className="font-medium mb-2">Compliance Issues:</p>
            {compliance.expired.length > 0 && (
              <div className="space-y-1">
                <p className="text-red-700 font-medium">Expired:</p>
                <ul className="list-disc list-inside space-y-0.5 text-red-600">
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
                <p className="text-yellow-700 font-medium">Expiring Soon:</p>
                <ul className="list-disc list-inside space-y-0.5 text-yellow-600">
                  {compliance.expiringSoon.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>

      {/* Upload Modal - Stable mount, local state */}
      {showUploadModal && (
        <UploadModal
          isOpen={showUploadModal}
          onClose={handleCloseModal}
          onUpload={handleFileUpload}
          uploading={uploading}
          uploadProgress={uploadProgress}
        />
      )}
    </Card>
  )
}

// Separate Upload Modal Component - Prevents flicker with local state
interface UploadModalProps {
  isOpen: boolean
  onClose: () => void
  onUpload: (file: File, docType: string, expiryDate: string) => Promise<void>
  uploading: boolean
  uploadProgress: number
}

function UploadModal({ isOpen, onClose, onUpload, uploading, uploadProgress }: UploadModalProps) {
  // Local state inside modal - prevents parent re-renders from affecting it
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [selectedDocType, setSelectedDocType] = useState<string>('OTHER')
  const [selectedExpiryDate, setSelectedExpiryDate] = useState<string>('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setSelectedFile(null)
      setSelectedDocType('OTHER')
      setSelectedExpiryDate('')
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }, [isOpen])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setSelectedFile(file)
    }
  }

  const handleUpload = async () => {
    if (!selectedFile) return
    await onUpload(selectedFile, selectedDocType, selectedExpiryDate)
  }

  const handleCancel = () => {
    if (!uploading) {
      onClose()
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open && !uploading) {
        onClose()
      }
    }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-2xl font-semibold">Upload Document or Media</DialogTitle>
          <DialogDescription className="text-base">
            Upload documents, images, PDFs, or other media files
          </DialogDescription>
        </DialogHeader>
        <div className="px-6 pb-6 pt-4 space-y-6">
          {/* File Upload Area */}
          <div>
            <Label className="text-sm font-semibold text-slate-900 mb-2 block">
              File <span className="text-red-500">*</span>
            </Label>
            <div className="relative">
              <input
                ref={fileInputRef}
                type="file"
                id="file-upload-modal"
                onChange={handleFileSelect}
                accept="image/*,application/pdf,.doc,.docx"
                disabled={uploading}
                className="hidden"
              />
              <label
                htmlFor="file-upload-modal"
                className={cn(
                  "flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-2xl cursor-pointer transition-all duration-200",
                  selectedFile
                    ? "border-primary bg-primary/5 hover:bg-primary/10"
                    : "border-slate-300 hover:border-primary hover:bg-slate-50:bg-slate-800/50",
                  uploading && "opacity-50 cursor-not-allowed"
                )}
              >
                {selectedFile ? (
                  <>
                    <FileText className="h-8 w-8 text-primary mb-2" />
                    <p className="text-sm font-medium text-slate-900">
                      {selectedFile.name}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      {(selectedFile.size / 1024).toFixed(1)} KB
                    </p>
                  </>
                ) : (
                  <>
                    <Upload className="h-8 w-8 text-slate-400 mb-2" />
                    <p className="text-sm font-medium text-slate-700">
                      Click to browse or drag and drop
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      PDF, Images, Word documents
                    </p>
                  </>
                )}
              </label>
            </div>
          </div>

          {/* Upload Progress */}
          {uploading && uploadProgress > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Uploading...</span>
                <span>{Math.round(uploadProgress)}%</span>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div
                  className="h-2 bg-primary rounded-full transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Document Type */}
          <div>
            <Label className="text-sm font-semibold text-slate-900 mb-2 block">
              Document Type <span className="text-red-500">*</span>
            </Label>
            <select
              value={selectedDocType}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedDocType(e.target.value)}
              disabled={uploading}
              className="flex h-11 w-full rounded-xl border-2 border-slate-200 bg-background px-4 py-2 text-sm font-medium transition-all focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none hover:border-slate-300:border-slate-600 disabled:opacity-50 disabled:cursor-not-allowed"
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

          {/* Expiry Date */}
          <div>
            <Label className="text-sm font-semibold text-slate-900 mb-2 block">
              Expiry Date <span className="text-slate-400 text-xs font-normal">(Optional)</span>
            </Label>
            <Input
              type="date"
              value={selectedExpiryDate}
              onChange={(e) => setSelectedExpiryDate(e.target.value)}
              disabled={uploading}
              className="h-11 rounded-xl border-2 border-slate-200 focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all hover:border-slate-300:border-slate-600 disabled:opacity-50"
            />
            <p className="text-xs text-slate-500 mt-2 flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              Set if this document expires (e.g., EID, Visa)
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
            <Button
              variant="outline"
              onClick={handleCancel}
              className="px-6 h-11 rounded-xl font-medium"
              disabled={uploading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpload}
              disabled={!selectedFile || uploading}
              className="px-6 h-11 rounded-xl font-medium shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {uploading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}


