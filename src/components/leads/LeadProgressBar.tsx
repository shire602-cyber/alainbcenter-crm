'use client'

/**
 * LEAD PROGRESS BAR
 * Horizontal progress bar showing lead journey
 * New → Engaged → Qualified → Proposal → Won
 */

import { CheckCircle2, Circle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useState } from 'react'
import { Select } from '@/components/ui/select'

const STAGES = [
  { value: 'NEW', label: 'New', position: 0 },
  { value: 'CONTACTED', label: 'Engaged', position: 1 },
  { value: 'QUALIFIED', label: 'Qualified', position: 2 },
  { value: 'PROPOSAL_SENT', label: 'Proposal', position: 3 },
  { value: 'COMPLETED_WON', label: 'Won', position: 4 },
]

interface LeadProgressBarProps {
  currentStage: string | null | undefined
  leadId: number
  onStageChange?: (stage: string) => Promise<void>
}

export function LeadProgressBar({ currentStage, leadId, onStageChange }: LeadProgressBarProps) {
  const [isChanging, setIsChanging] = useState(false)
  const currentPosition = STAGES.find(s => s.value === currentStage)?.position ?? 0

  async function handleStageChange(newStage: string) {
    if (isChanging || newStage === currentStage) return
    
    setIsChanging(true)
    try {
      if (onStageChange) {
        await onStageChange(newStage)
      } else {
        // Default: update via API
        await fetch(`/api/leads/${leadId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stage: newStage }),
        })
      }
    } catch (error) {
      console.error('Failed to update stage:', error)
    } finally {
      setIsChanging(false)
    }
  }

  return (
    <div className="w-full bg-slate-50 border-b border-slate-200">
      <div className="px-4 sm:px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          {/* Progress Steps */}
          <div className="flex-1 flex items-center gap-2 sm:gap-4">
            {STAGES.map((stage, idx) => {
              const isActive = stage.position <= currentPosition
              const isCurrent = stage.value === currentStage
              
              return (
                <div key={stage.value} className="flex items-center flex-1">
                  <button
                    onClick={() => handleStageChange(stage.value)}
                    disabled={isChanging}
                    className={cn(
                      "flex items-center gap-2 flex-1 group transition-all",
                      isChanging && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    <div className={cn(
                      "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all",
                      isActive
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "bg-slate-200 text-slate-400",
                      isCurrent && "ring-2 ring-primary ring-offset-2 ring-offset-white"
                    )}>
                      {isActive ? (
                        <CheckCircle2 className="h-4 w-4" />
                      ) : (
                        <Circle className="h-4 w-4" />
                      )}
                    </div>
                    <span className={cn(
                      "text-xs font-medium hidden sm:block transition-colors",
                      isActive
                        ? "text-slate-900"
                        : "text-slate-500",
                      isCurrent && "font-semibold"
                    )}>
                      {stage.label}
                    </span>
                  </button>
                  {idx < STAGES.length - 1 && (
                    <div className={cn(
                      "flex-shrink-0 h-0.5 w-4 sm:w-8 transition-colors",
                      idx < currentPosition
                        ? "bg-primary"
                        : "bg-slate-200"
                    )} />
                  )}
                </div>
              )
            })}
          </div>

          {/* Manual Override Dropdown */}
          <div className="flex-shrink-0">
            <Select
              value={currentStage || 'NEW'}
              onChange={(e) => handleStageChange(e.target.value)}
              disabled={isChanging}
              className="w-32 h-8 text-xs"
            >
              {STAGES.map((stage) => (
                <option key={stage.value} value={stage.value}>
                  {stage.label}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </div>
    </div>
  )
}

