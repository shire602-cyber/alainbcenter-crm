'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { motion, AnimatePresence } from 'framer-motion'
import { scaleVariants } from '@/lib/animations'

interface PopoverContextValue {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const PopoverContext = React.createContext<PopoverContextValue | undefined>(undefined)

interface PopoverProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  children: React.ReactNode
}

export function Popover({ open: controlledOpen, onOpenChange, children }: PopoverProps) {
  const [internalOpen, setInternalOpen] = React.useState(false)
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen
  const handleOpenChange = onOpenChange || setInternalOpen

  return (
    <PopoverContext.Provider value={{ open, onOpenChange: handleOpenChange }}>
      {children}
    </PopoverContext.Provider>
  )
}

interface PopoverTriggerProps {
  asChild?: boolean
  children: React.ReactNode
  className?: string
}

export function PopoverTrigger({ asChild, children, className }: PopoverTriggerProps) {
  const context = React.useContext(PopoverContext)
  if (!context) throw new Error('PopoverTrigger must be used within Popover')

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children, {
      onClick: () => context.onOpenChange(!context.open),
    } as any)
  }

  return (
    <button
      onClick={() => context.onOpenChange(!context.open)}
      className={className}
      aria-expanded={context.open}
      aria-haspopup="true"
    >
      {children}
    </button>
  )
}

interface PopoverContentProps {
  children: React.ReactNode
  className?: string
  align?: 'start' | 'center' | 'end'
}

export function PopoverContent({ children, className, align = 'start' }: PopoverContentProps) {
  const context = React.useContext(PopoverContext)
  if (!context) throw new Error('PopoverContent must be used within Popover')

  const contentRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (context.open && contentRef.current) {
      const firstFocusable = contentRef.current.querySelector(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      ) as HTMLElement
      firstFocusable?.focus()
    }
  }, [context.open])

  React.useEffect(() => {
    if (!context.open) return

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        context.onOpenChange(false)
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [context.open, context.onOpenChange])

  const alignClasses = {
    start: 'left-0',
    center: 'left-1/2 -translate-x-1/2',
    end: 'right-0',
  }

  return (
    <AnimatePresence>
      {context.open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => context.onOpenChange(false)}
          />
          <motion.div
            ref={contentRef}
            className={cn(
              'absolute z-50 mt-2 rounded-xl border border-slate-200 bg-white p-4 shadow-xl',
              alignClasses[align],
              className
            )}
            variants={scaleVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={(e) => e.stopPropagation()}
          >
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

