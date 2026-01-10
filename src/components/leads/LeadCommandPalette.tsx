'use client'

/**
 * LEAD COMMAND PALETTE (Cmd+K)
 * 
 * Scoped to the current lead with quick actions:
 * - Assign owner
 * - Run playbook: Request docs
 * - Create task
 * - Snooze lead
 * - Open quote flow
 */

import { useState, useEffect, useCallback } from 'react'
import { Search, User, FileText, Calendar, Zap, MessageSquare } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/ui/toast'

interface LeadCommandPaletteProps {
  leadId: number
  lead?: {
    stage?: string | null
    serviceType?: {
      name?: string
    } | null
  } | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onComposerFocus?: () => void
}

interface Command {
  id: string
  label: string
  description: string
  icon: React.ReactNode
  action: () => void
  keywords: string[]
}

export function LeadCommandPalette({
  leadId,
  lead,
  open,
  onOpenChange,
  onComposerFocus,
}: LeadCommandPaletteProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const router = useRouter()
  const { showToast } = useToast()

  const commands: Command[] = [
    {
      id: 'assign',
      label: 'Assign Owner',
      description: 'Assign this lead to a team member',
      icon: <User className="h-4 w-4" />,
      action: () => {
        router.push(`/leads/${leadId}?action=assign`)
        onOpenChange(false)
      },
      keywords: ['assign', 'owner', 'team'],
    },
    {
      id: 'playbook-request-docs',
      label: 'Run Playbook: Request Documents',
      description: 'Send document request template',
      icon: <FileText className="h-4 w-4" />,
      action: async () => {
        try {
          const res = await fetch(`/api/leads/${leadId}/playbooks/run`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ playbookKey: 'request_docs', channel: 'whatsapp' }),
          })
          const data = await res.json()
          if (data.ok) {
            showToast('Playbook executed successfully', 'success')
            router.refresh()
          } else {
            showToast(data.error || 'Failed to execute playbook', 'error')
          }
        } catch (error: any) {
          showToast('Failed to execute playbook', 'error')
        }
        onOpenChange(false)
      },
      keywords: ['playbook', 'request', 'docs', 'documents'],
    },
    {
      id: 'create-task',
      label: 'Create Task',
      description: 'Create a new task for this lead',
      action: () => {
        router.push(`/leads/${leadId}?action=task`)
        onOpenChange(false)
      },
      icon: <Calendar className="h-4 w-4" />,
      keywords: ['task', 'todo', 'create'],
    },
    {
      id: 'snooze',
      label: 'Snooze Lead',
      description: 'Snooze this lead for later',
      icon: <Zap className="h-4 w-4" />,
      action: () => {
        router.push(`/leads/${leadId}?action=snooze`)
        onOpenChange(false)
      },
      keywords: ['snooze', 'later', 'pause'],
    },
    {
      id: 'quote',
      label: 'Open Quote Flow',
      description: 'Create or view quote for this lead',
      icon: <MessageSquare className="h-4 w-4" />,
      action: () => {
        router.push(`/leads/${leadId}?action=quote`)
        onOpenChange(false)
      },
      keywords: ['quote', 'pricing', 'proposal'],
    },
  ]

  const filteredCommands = commands.filter(cmd =>
    cmd.keywords.some(kw => kw.toLowerCase().includes(searchQuery.toLowerCase())) ||
    cmd.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
    cmd.description.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const handleSelect = useCallback((command: Command) => {
    command.action()
  }, [])

  // Keyboard navigation
  useEffect(() => {
    if (!open) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex(prev => Math.min(prev + 1, filteredCommands.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex(prev => Math.max(prev - 1, 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (filteredCommands[selectedIndex]) {
          handleSelect(filteredCommands[selectedIndex])
        }
      } else if (e.key === 'Escape') {
        onOpenChange(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, filteredCommands, selectedIndex, handleSelect, onOpenChange])

  // Reset selection when search changes
  useEffect(() => {
    setSelectedIndex(0)
  }, [searchQuery])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] p-0">
        <DialogHeader className="px-4 pt-4 pb-2">
          <DialogTitle className="text-lg font-semibold">Command Palette</DialogTitle>
        </DialogHeader>
        
        <div className="px-4 pb-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Type a command or search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-lg border border-slate-200 bg-card focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              autoFocus
            />
          </div>
        </div>

        <div className="max-h-[300px] overflow-y-auto px-2 pb-4">
          {filteredCommands.length === 0 ? (
            <div className="px-4 py-8 text-center text-muted-foreground">
              No commands found
            </div>
          ) : (
            <div className="space-y-1">
              {filteredCommands.map((command, idx) => (
                <button
                  key={command.id}
                  onClick={() => handleSelect(command)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors",
                    idx === selectedIndex
                      ? "bg-blue-50 text-blue-700"
                      : "hover:bg-slate-50:bg-slate-800 text-slate-900"
                  )}
                >
                  <div className="text-slate-500">
                    {command.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{command.label}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {command.description}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

