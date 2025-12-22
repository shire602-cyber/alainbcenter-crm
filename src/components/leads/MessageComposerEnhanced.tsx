'use client'

import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Send,
  Sparkles,
  Loader2,
  Paperclip,
  X,
  ChevronDown,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface MessageComposerEnhancedProps {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  sending?: boolean
  onAIDraft?: (mode: string) => void
  generatingAI?: string | null
  leadName?: string
  expiryDate?: string
  serviceType?: string
  className?: string
  placeholder?: string
}

const MESSAGE_PACKS = [
  {
    label: 'Follow-up',
    variants: ['gentle', 'urgent'],
    modes: ['followup'],
  },
  {
    label: 'Renewal',
    variants: ['gentle', 'urgent', 'reminder'],
    modes: ['renewal'],
  },
  {
    label: 'Documents',
    variants: ['missing', 'request', 'reminder'],
    modes: ['docs'],
  },
  {
    label: 'Pricing',
    variants: ['inquiry', 'offer', 'follow-up'],
    modes: ['pricing'],
  },
]

export function MessageComposerEnhanced({
  value,
  onChange,
  onSend,
  sending = false,
  onAIDraft,
  generatingAI,
  leadName,
  expiryDate,
  serviceType,
  className,
  placeholder = 'Type a message...',
}: MessageComposerEnhancedProps) {
  const [showPacks, setShowPacks] = useState(false)
  const [selectedPack, setSelectedPack] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const autofillTokens = {
    name: leadName || '{name}',
    expiry_date: expiryDate ? new Date(expiryDate).toLocaleDateString() : '{expiry_date}',
    service: serviceType || '{service}',
  }

  const handleTokenInsert = (token: string) => {
    const textarea = textareaRef.current
    if (!textarea) return

    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const text = value
    const before = text.substring(0, start)
    const after = text.substring(end)

    const tokenValue = autofillTokens[token as keyof typeof autofillTokens] || `{${token}}`
    const newValue = before + tokenValue + after
    onChange(newValue)

    setTimeout(() => {
      textarea.focus()
      textarea.setSelectionRange(start + tokenValue.length, start + tokenValue.length)
    }, 0)
  }

  const handlePackSelect = (packLabel: string, variant?: string) => {
    if (onAIDraft) {
      // Map pack labels to mode names
      const modeMap: Record<string, string> = {
        'follow-up': 'FOLLOW_UP',
        'renewal': 'RENEWAL',
        'documents': 'DOCS',
        'docs': 'DOCS',
        'pricing': 'PRICING',
      }
      const normalizedLabel = packLabel.toLowerCase().replace(/\s+/g, '-')
      const mode = modeMap[normalizedLabel] || 'FOLLOW_UP'
      onAIDraft(mode)
      setSelectedPack(`${packLabel}${variant ? ` - ${variant}` : ''}`)
      setShowPacks(false)
    }
  }

  return (
    <div className={cn('space-y-3', className)}>
      {/* Message Packs */}
      <div className="flex gap-2 flex-wrap">
        <Button
          variant="outline"
          size="sm"
          onClick={() => handlePackSelect('Follow-up')}
          disabled={generatingAI === 'FOLLOW_UP'}
          className="text-sm"
        >
          {generatingAI === 'followup' ? (
            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5 mr-1.5" />
          )}
          Follow-up
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => handlePackSelect('Renewal')}
          disabled={generatingAI === 'RENEWAL'}
          className="text-sm"
        >
          Renewal
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => handlePackSelect('Documents')}
          disabled={generatingAI === 'DOCS'}
          className="text-sm"
        >
          Docs
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => handlePackSelect('Pricing')}
          disabled={generatingAI === 'PRICING'}
          className="text-sm"
        >
          Pricing
        </Button>
        
        {/* Autofill tokens */}
        <div className="flex items-center gap-1 ml-auto">
          <span className="text-xs text-muted-foreground">Insert:</span>
          {Object.keys(autofillTokens).map((token) => (
            <Badge
              key={token}
              variant="outline"
              className="text-xs cursor-pointer hover:bg-muted"
              onClick={() => handleTokenInsert(token)}
            >
              {`{${token}}`}
            </Badge>
          ))}
        </div>
      </div>

      {/* Composer */}
      <div className="flex gap-2">
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={3}
          className="resize-none"
          onKeyDown={(e) => {
            // Ctrl+Enter or Cmd+Enter to send
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
              e.preventDefault()
              if (value.trim() && !sending) {
                onSend()
              }
            }
            // Enter alone sends (Shift+Enter for new line)
            else if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              if (value.trim() && !sending) {
                onSend()
              }
            }
          }}
        />
        <div className="flex flex-col gap-2">
          <Button
            onClick={onSend}
            disabled={sending || !value.trim()}
            className="bg-green-600 hover:bg-green-700"
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
