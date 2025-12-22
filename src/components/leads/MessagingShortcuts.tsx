'use client'

import { Button } from '@/components/ui/button'
import { MessageSquare, Mail, Phone, Instagram, Facebook } from 'lucide-react'

interface MessagingShortcutsProps {
  phone?: string | null
  email?: string | null
  onWhatsApp?: () => void
  onEmail?: () => void
  onSMS?: () => void
  onInstagram?: () => void
  onFacebook?: () => void
}

export function MessagingShortcuts({
  phone,
  email,
  onWhatsApp,
  onEmail,
  onSMS,
  onInstagram,
  onFacebook
}: MessagingShortcutsProps) {
  const handleWhatsApp = () => {
    if (phone) {
      const cleanPhone = phone.replace(/[^0-9]/g, '')
      window.open(`https://wa.me/${cleanPhone}`, '_blank')
    } else if (onWhatsApp) {
      onWhatsApp()
    }
  }

  const handleEmail = () => {
    if (email) {
      window.location.href = `mailto:${email}`
    } else if (onEmail) {
      onEmail()
    }
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Button
        size="sm"
        variant="outline"
        onClick={handleWhatsApp}
        disabled={!phone && !onWhatsApp}
      >
        <MessageSquare className="h-4 w-4 mr-2" />
        WhatsApp
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={handleEmail}
        disabled={!email && !onEmail}
      >
        <Mail className="h-4 w-4 mr-2" />
        Email
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={onSMS}
        disabled={!phone && !onSMS}
      >
        <Phone className="h-4 w-4 mr-2" />
        SMS
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={onInstagram}
        disabled={!onInstagram}
      >
        <Instagram className="h-4 w-4 mr-2" />
        Instagram
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={onFacebook}
        disabled={!onFacebook}
      >
        <Facebook className="h-4 w-4 mr-2" />
        Facebook
      </Button>
    </div>
  )
}













