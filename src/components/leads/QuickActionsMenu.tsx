'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Phone,
  MessageSquare,
  Copy,
  Mail,
  Calendar,
  RefreshCw,
  FileCheck,
  ChevronDown,
  MoreVertical,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/ui/toast'

interface QuickActionsMenuProps {
  type: 'phone' | 'email' | 'expiry' | 'document'
  value: string
  onAction?: (action: string) => void
  className?: string
  phone?: string
  email?: string
  expiryDate?: string
  documentId?: number
}

export function QuickActionsMenu({ 
  type, 
  value, 
  onAction,
  className,
  phone,
  email,
  expiryDate,
  documentId 
}: QuickActionsMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const { showToast } = useToast()

  const handleAction = (action: string) => {
    if (onAction) {
      onAction(action)
    }
    setIsOpen(false)
  }

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
    showToast(`${label} copied to clipboard`, 'success')
  }

  const openWhatsApp = (phoneNumber: string, text?: string) => {
    const encodedText = text ? encodeURIComponent(text) : ''
    window.open(`https://wa.me/${phoneNumber.replace(/[^0-9]/g, '')}${encodedText ? `?text=${encodedText}` : ''}`, '_blank')
  }

  if (type === 'phone' && phone) {
    return (
      <div className={cn('relative inline-flex', className)}>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => window.open(`tel:${phone}`, '_self')}
            className="h-6 px-2"
          >
            <Phone className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => openWhatsApp(phone)}
            className="h-6 px-2 text-green-600 hover:text-green-700 hover:bg-green-50"
          >
            <MessageSquare className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => copyToClipboard(phone, 'Phone')}
            className="h-6 px-2"
          >
            <Copy className="h-3 w-3" />
          </Button>
        </div>
      </div>
    )
  }

  if (type === 'email' && email) {
    return (
      <div className={cn('relative inline-flex', className)}>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => window.open(`mailto:${email}`, '_self')}
            className="h-6 px-2"
          >
            <Mail className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => copyToClipboard(email, 'Email')}
            className="h-6 px-2"
          >
            <Copy className="h-3 w-3" />
          </Button>
        </div>
      </div>
    )
  }

  if (type === 'expiry') {
    return (
      <div className={cn('relative inline-flex', className)}>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => handleAction('add-task')}
          className="h-6 px-2 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <Calendar className="h-3 w-3 mr-1" />
          Task
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => handleAction('renew')}
          className="h-6 px-2 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <RefreshCw className="h-3 w-3 mr-1" />
          Renew
        </Button>
      </div>
    )
  }

  if (type === 'document') {
    return (
      <div className={cn('relative inline-flex', className)}>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => handleAction('send')}
          className="h-6 px-2 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <MessageSquare className="h-3 w-3 mr-1" />
          Send
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => handleAction('verify')}
          className="h-6 px-2 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <FileCheck className="h-3 w-3 mr-1" />
          Verify
        </Button>
      </div>
    )
  }

  return null
}

















