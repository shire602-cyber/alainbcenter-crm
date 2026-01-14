'use client'

import { CheckCircle2, Circle } from 'lucide-react'
import { cn } from '@/lib/utils'

const STAGES = [
  { value: 'NEW', label: 'New' },
  { value: 'CONTACTED', label: 'Contacted' },
  { value: 'ENGAGED', label: 'Engaged' },
  { value: 'QUALIFIED', label: 'Qualified' },
  { value: 'PROPOSAL_SENT', label: 'Proposal' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'COMPLETED_WON', label: 'Won' },
  { value: 'LOST', label: 'Lost' },
]

interface PipelineProgressProps {
  currentStage: string
  onStageClick: (stage: string) => void
  className?: string
}

export function PipelineProgress({ currentStage, onStageClick, className }: PipelineProgressProps) {
  const currentIndex = STAGES.findIndex((s) => s.value === currentStage.toUpperCase())
  
  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-muted-foreground">Pipeline Stage</span>
        <span className="text-xs text-muted-foreground">Click to change</span>
      </div>
      
      {/* Progress bar */}
      <div className="relative">
        <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-muted -translate-y-1/2" />
        <div 
          className="absolute top-1/2 left-0 h-0.5 bg-primary transition-all duration-300 -translate-y-1/2"
          style={{ 
            width: currentIndex >= 0 
              ? `${(currentIndex / (STAGES.length - 1)) * 100}%` 
              : '0%' 
          }}
        />
        <div className="relative flex justify-between">
          {STAGES.map((stage, index) => {
            const isCompleted = currentIndex >= index
            const isCurrent = currentIndex === index
            // Allow all stages to be clicked - handleStageChange will handle special cases
            const isClickable = true
            
            return (
              <button
                key={stage.value}
                onClick={() => onStageClick(stage.value)}
                className={cn(
                  'flex flex-col items-center gap-1 group cursor-pointer',
                  'hover:opacity-80 transition-opacity'
                )}
              >
                <div
                  className={cn(
                    'relative z-10 w-6 h-6 rounded-full border-2 transition-all',
                    isCurrent
                      ? 'bg-primary border-primary text-primary-foreground'
                      : isCompleted
                        ? 'bg-primary border-primary text-primary-foreground'
                        : 'bg-background border-muted-foreground/30',
                    isClickable && 'group-hover:scale-110'
                  )}
                >
                  {isCompleted ? (
                    <CheckCircle2 className="h-full w-full p-0.5" />
                  ) : (
                    <Circle className="h-full w-full p-0.5" />
                  )}
                </div>
                <span
                  className={cn(
                    'text-xs font-medium whitespace-nowrap transition-colors',
                    isCurrent
                      ? 'text-primary'
                      : isCompleted
                        ? 'text-foreground'
                        : 'text-muted-foreground'
                  )}
                >
                  {stage.label}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}


















