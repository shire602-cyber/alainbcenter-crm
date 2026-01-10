'use client'

import * as React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { backdropVariants, slideFromBottomVariants, slideVariants } from '@/lib/animations'

interface SheetContextValue {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const SheetContext = React.createContext<SheetContextValue | undefined>(undefined)

interface SheetProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  children: React.ReactNode
}

export function Sheet({ open: controlledOpen, onOpenChange, children }: SheetProps) {
  const [internalOpen, setInternalOpen] = React.useState(false)
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen
  const handleOpenChange = onOpenChange || setInternalOpen

  React.useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  return (
    <SheetContext.Provider value={{ open, onOpenChange: handleOpenChange }}>
      {children}
    </SheetContext.Provider>
  )
}

interface SheetTriggerProps {
  asChild?: boolean
  children: React.ReactNode
  className?: string
}

export function SheetTrigger({ asChild, children, className }: SheetTriggerProps) {
  const context = React.useContext(SheetContext)
  if (!context) throw new Error('SheetTrigger must be used within Sheet')

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children, {
      onClick: () => context.onOpenChange(true),
    } as any)
  }

  return (
    <button 
      onClick={() => context.onOpenChange(true)}
      className={className}
    >
      {children}
    </button>
  )
}

interface SheetContentProps {
  children: React.ReactNode
  className?: string
  side?: 'top' | 'bottom' | 'left' | 'right'
}

export function SheetContent({ children, className, side = 'bottom' }: SheetContentProps) {
  const context = React.useContext(SheetContext)
  if (!context) throw new Error('SheetContent must be used within Sheet')

  const sideClasses = {
    top: 'top-0 left-0 right-0 rounded-b-2xl',
    bottom: 'bottom-0 left-0 right-0 rounded-t-2xl',
    left: 'top-0 left-0 bottom-0 rounded-r-2xl',
    right: 'top-0 right-0 bottom-0 rounded-l-2xl',
  }

  const slideVariantsBySide = {
    top: { hidden: { y: '-100%', opacity: 0 }, visible: { y: 0, opacity: 1 }, exit: { y: '-100%', opacity: 0 } },
    bottom: slideFromBottomVariants,
    left: { hidden: { x: '-100%', opacity: 0 }, visible: { x: 0, opacity: 1 }, exit: { x: '-100%', opacity: 0 } },
    right: slideVariants,
  }

  return (
    <AnimatePresence>
      {context.open && (
        <>
          <motion.div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
            variants={backdropVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={() => context.onOpenChange(false)}
          />
          <motion.div
            className={cn(
              "fixed z-50 bg-white shadow-2xl",
              sideClasses[side],
              side === 'bottom' && "max-h-[90vh] overflow-y-auto",
              side === 'top' && "max-h-[90vh] overflow-y-auto",
              side === 'left' && "w-80 max-w-[90vw] overflow-y-auto",
              side === 'right' && "w-80 max-w-[90vw] overflow-y-auto",
              className
            )}
            variants={slideVariantsBySide[side]}
            initial="hidden"
            animate="visible"
            exit="exit"
            transition={{ duration: 0.3, ease: 'easeOut' }}
            onClick={(e) => e.stopPropagation()}
          >
            <Button
              variant="ghost"
              size="sm"
              className="absolute top-4 right-4 rounded-lg z-10"
              onClick={() => context.onOpenChange(false)}
              aria-label="Close sheet"
            >
              <X className="h-4 w-4" />
            </Button>
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

interface SheetHeaderProps {
  children: React.ReactNode
  className?: string
}

export function SheetHeader({ children, className }: SheetHeaderProps) {
  return (
    <div className={cn("p-6 pb-4 border-b border-slate-200", className)}>
      {children}
    </div>
  )
}

interface SheetTitleProps {
  children: React.ReactNode
  className?: string
}

export function SheetTitle({ children, className }: SheetTitleProps) {
  return (
    <h2 className={cn("text-lg font-semibold text-slate-900", className)}>
      {children}
    </h2>
  )
}

interface SheetDescriptionProps {
  children: React.ReactNode
  className?: string
}

export function SheetDescription({ children, className }: SheetDescriptionProps) {
  return (
    <p className={cn("text-sm text-slate-600 mt-1", className)}>
      {children}
    </p>
  )
}

