'use client'

import * as React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Spinner } from './spinner'
import { backdropVariants, fadeVariants } from '@/lib/animations'

export interface LoadingOverlayProps {
  isLoading: boolean
  message?: string
  className?: string
}

const LoadingOverlay: React.FC<LoadingOverlayProps> = ({
  isLoading,
  message,
  className,
}) => {
  // Prevent body scroll when loading
  React.useEffect(() => {
    if (isLoading) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isLoading])

  return (
    <AnimatePresence>
      {isLoading && (
        <motion.div
          className={cn(
            'fixed inset-0 z-50 flex items-center justify-center',
            className
          )}
          variants={backdropVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/20 backdrop-blur-sm"
            variants={backdropVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
          />

          {/* Content */}
          <motion.div
            className="relative flex flex-col items-center gap-4 p-8 bg-white rounded-2xl shadow-xl border border-slate-200"
            variants={fadeVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <Spinner size="lg" variant="circle" />
            {message && (
              <p className="text-body text-slate-700 font-medium">{message}</p>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export { LoadingOverlay }

