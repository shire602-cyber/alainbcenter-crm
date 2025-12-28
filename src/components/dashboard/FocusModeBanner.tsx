'use client'

/**
 * FOCUS MODE BANNER
 * 
 * Shows when user enters focus mode from "Your Focus Now" card.
 * Dims background and shows banner: "🎯 Focus Mode — One step away from done"
 */

import { useEffect, useState } from 'react'
import { X, Target } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

interface FocusModeBannerProps {
  onExit?: () => void
}

export function FocusModeBanner({ onExit }: FocusModeBannerProps) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // Check if we're in focus mode
    const isFocusMode = sessionStorage.getItem('focusMode') === 'true'
    if (isFocusMode) {
      setVisible(true)
    }
  }, [])

  function handleExit() {
    sessionStorage.removeItem('focusMode')
    sessionStorage.removeItem('focusItemId')
    setVisible(false)
    if (onExit) onExit()
  }

  if (!visible) return null

  return (
    <div className="fixed inset-0 z-50 pointer-events-none">
      {/* Dimmed background */}
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm pointer-events-auto" />
      
      {/* Banner */}
      <div className={cn(
        "absolute top-4 left-1/2 -translate-x-1/2 z-50",
        "bg-gradient-to-r from-blue-600 to-indigo-600 text-white",
        "rounded-xl px-6 py-3 shadow-xl",
        "flex items-center gap-3",
        "animate-in slide-in-from-top-4 fade-in duration-300",
        "pointer-events-auto"
      )}>
        <Target className="h-5 w-5" />
        <span className="font-semibold text-sm">
          🎯 Focus Mode — One step away from done
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleExit}
          className="h-6 w-6 p-0 text-white hover:bg-white/20 ml-2"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

