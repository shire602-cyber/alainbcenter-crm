'use client'

import * as React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Upload, X, File, Image, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import { Button } from './button'
import { Progress } from './progress'

export interface FileUploadProps {
  onUpload: (files: File[]) => Promise<void> | void
  accept?: string
  multiple?: boolean
  maxSize?: number // in bytes
  className?: string
  disabled?: boolean
}

interface FileItem {
  id: string
  file: File
  status: 'pending' | 'uploading' | 'success' | 'error'
  progress?: number
  error?: string
}

export function FileUpload({
  onUpload,
  accept,
  multiple = true,
  maxSize = 10 * 1024 * 1024, // 10MB default
  className,
  disabled,
}: FileUploadProps) {
  const [files, setFiles] = React.useState<FileItem[]>([])
  const [isDragging, setIsDragging] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)

  const handleFiles = async (fileList: FileList) => {
    const newFiles: FileItem[] = Array.from(fileList)
      .filter((file) => {
        if (file.size > maxSize) {
          return false
        }
        return true
      })
      .map((file) => ({
        id: `${Date.now()}-${Math.random()}`,
        file,
        status: 'pending' as const,
      }))

    setFiles((prev) => (multiple ? [...prev, ...newFiles] : newFiles))

    // Auto-upload
    for (const fileItem of newFiles) {
      setFiles((prev) =>
        prev.map((item) =>
          item.id === fileItem.id ? { ...item, status: 'uploading', progress: 0 } : item
        )
      )

      try {
        await onUpload([fileItem.file])
        setFiles((prev) =>
          prev.map((item) =>
            item.id === fileItem.id ? { ...item, status: 'success', progress: 100 } : item
          )
        )
        // Remove after 2 seconds
        setTimeout(() => {
          setFiles((prev) => prev.filter((item) => item.id !== fileItem.id))
        }, 2000)
      } catch (error) {
        setFiles((prev) =>
          prev.map((item) =>
            item.id === fileItem.id
              ? { ...item, status: 'error', error: String(error) }
              : item
          )
        )
      }
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!disabled) {
      setIsDragging(true)
    }
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    if (disabled) return

    const droppedFiles = e.dataTransfer.files
    if (droppedFiles.length > 0) {
      handleFiles(droppedFiles)
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files)
    }
  }

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((item) => item.id !== id))
  }

  const isImage = (file: File) => file.type.startsWith('image/')

  return (
    <div className={cn('space-y-4', className)}>
      <div
        className={cn(
          'relative border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200',
          isDragging
            ? 'border-blue-500 bg-blue-50 scale-[1.02]'
            : 'border-slate-300 bg-slate-50 hover:border-slate-400 hover:bg-slate-100',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          onChange={handleInputChange}
          className="hidden"
          disabled={disabled}
        />
        <Upload className="h-12 w-12 mx-auto mb-4 text-slate-400" />
        <p className="text-body font-semibold text-slate-700 mb-2">
          Drag and drop files here, or{' '}
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="text-blue-600 hover:text-blue-700 underline"
            disabled={disabled}
          >
            browse
          </button>
        </p>
        <p className="text-caption text-slate-500">
          Maximum file size: {(maxSize / 1024 / 1024).toFixed(0)}MB
        </p>
      </div>

      {/* File List */}
      <AnimatePresence>
        {files.length > 0 && (
          <div className="space-y-2">
            {files.map((fileItem) => (
              <motion.div
                key={fileItem.id}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className={cn(
                  'flex items-center gap-3 p-3 rounded-lg border bg-white',
                  fileItem.status === 'error' && 'border-red-200 bg-red-50',
                  fileItem.status === 'success' && 'border-green-200 bg-green-50'
                )}
              >
                {isImage(fileItem.file) ? (
                  <Image className="h-8 w-8 text-blue-600 flex-shrink-0" />
                ) : (
                  <File className="h-8 w-8 text-slate-600 flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-body font-medium text-slate-900 truncate">
                    {fileItem.file.name}
                  </p>
                  <p className="text-caption text-slate-500">
                    {(fileItem.file.size / 1024).toFixed(1)} KB
                  </p>
                  {fileItem.status === 'uploading' && fileItem.progress !== undefined && (
                    <Progress value={fileItem.progress} className="mt-2 h-1" />
                  )}
                  {fileItem.status === 'error' && fileItem.error && (
                    <p className="text-caption text-red-600 mt-1">{fileItem.error}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {fileItem.status === 'uploading' && (
                    <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />
                  )}
                  {fileItem.status === 'success' && (
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                  )}
                  {fileItem.status === 'error' && (
                    <AlertCircle className="h-5 w-5 text-red-600" />
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeFile(fileItem.id)}
                    className="h-8 w-8 p-0"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}

