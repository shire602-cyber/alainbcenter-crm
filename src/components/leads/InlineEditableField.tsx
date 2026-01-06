'use client'

import { useState, useRef, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Edit2, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface InlineEditableFieldProps {
  value: string | null | undefined
  onSave: (value: string) => Promise<void>
  type?: 'text' | 'select' | 'date'
  options?: Array<{ value: string; label: string }>
  placeholder?: string
  className?: string
  displayValue?: string // Optional formatted display value (e.g., for dates)
}

export function InlineEditableField({
  value,
  onSave,
  type = 'text',
  options = [],
  placeholder = 'Click to edit',
  className,
  displayValue
}: InlineEditableFieldProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(value || '')
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isEditing])

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave(editValue)
      setIsEditing(false)
    } catch (error) {
      console.error('Failed to save:', error)
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    setEditValue(value || '')
    setIsEditing(false)
  }

  if (isEditing) {
    return (
      <div className={cn('flex items-center gap-2', className)}>
        {type === 'select' ? (
          <Select
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            className="flex-1"
          >
            {options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Select>
        ) : type === 'date' ? (
          <Input
            ref={inputRef}
            type="date"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                handleSave()
              } else if (e.key === 'Escape') {
                handleCancel()
              }
            }}
            className="flex-1"
            disabled={saving}
            onBlur={handleSave}
          />
        ) : (
          <Input
            ref={inputRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleSave}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                handleSave()
              } else if (e.key === 'Escape') {
                handleCancel()
              }
            }}
            className="flex-1"
            disabled={saving}
          />
        )}
        <Button
          size="sm"
          variant="ghost"
          onClick={handleSave}
          disabled={saving}
        >
          <Check className="h-4 w-4" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={handleCancel}
          disabled={saving}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    )
  }

  return (
    <div 
      className={cn('flex items-center gap-2 group cursor-pointer', className)}
      onClick={() => setIsEditing(true)}
    >
      <span className="text-sm">{displayValue || value || <span className="text-muted-foreground">{placeholder}</span>}</span>
      <Edit2 className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
    </div>
  )
}











