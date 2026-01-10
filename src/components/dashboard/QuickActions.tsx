'use client'

import { useState } from 'react'
import { Plus, X, MessageSquare, UserPlus, Calendar, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import Link from 'next/link'

const actions = [
  { icon: UserPlus, label: 'New Lead', href: '/leads?action=create', color: 'bg-blue-500 hover:bg-blue-600' },
  { icon: MessageSquare, label: 'Send Message', href: '/inbox', color: 'bg-green-500 hover:bg-green-600' },
  { icon: Calendar, label: 'Create Task', href: '/leads', color: 'bg-purple-500 hover:bg-purple-600' },
  { icon: FileText, label: 'View Reports', href: '/reports', color: 'bg-orange-500 hover:bg-orange-600' },
]

export function QuickActions() {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {/* Actions Menu */}
      {isOpen && (
        <div className="absolute bottom-16 right-0 mb-2 flex flex-col gap-2 animate-in fade-in slide-in-from-bottom-2 duration-200">
          {actions.map((action) => {
            const Icon = action.icon
            return (
              <Link
                key={action.label}
                href={action.href}
                className={cn(
                  "flex items-center gap-3 px-4 py-2.5 rounded-xl text-white text-sm font-medium shadow-lg transition-all hover:scale-105",
                  action.color
                )}
                onClick={() => setIsOpen(false)}
              >
                <Icon className="h-4 w-4" />
                <span>{action.label}</span>
              </Link>
            )
          })}
        </div>
      )}

      {/* Toggle Button */}
      <Button
        onClick={() => setIsOpen(!isOpen)}
        size="lg"
        className={cn(
          "h-14 w-14 rounded-full shadow-lg transition-all duration-200",
          isOpen 
            ? "bg-slate-900 hover:bg-slate-800:bg-slate-200" 
            : "bg-primary hover:bg-primary/90"
        )}
      >
        {isOpen ? (
          <X className="h-6 w-6 text-white" />
        ) : (
          <Plus className="h-6 w-6 text-white" />
        )}
      </Button>
    </div>
  )
}

