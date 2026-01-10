'use client'

import * as React from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { rotateVariants } from '@/lib/animations'

export interface SpinnerProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'dots' | 'bars' | 'circle'
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const Spinner = React.forwardRef<HTMLDivElement, SpinnerProps>(
  ({ variant = 'circle', size = 'md', className, ...props }, ref) => {
    const sizeClasses = {
      sm: 'h-4 w-4',
      md: 'h-6 w-6',
      lg: 'h-8 w-8',
    }

    if (variant === 'circle') {
      return (
        <div
          ref={ref}
          className={cn('flex items-center justify-center', className)}
          {...props}
        >
          <motion.div
            className={cn(
              'border-2 border-slate-200 border-t-slate-900 rounded-full',
              sizeClasses[size]
            )}
            variants={rotateVariants}
            animate="rotate"
          />
        </div>
      )
    }

    if (variant === 'dots') {
      return (
        <div
          ref={ref}
          className={cn('flex items-center justify-center gap-1', className)}
          {...props}
        >
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className={cn(
                'bg-slate-900 rounded-full',
                size === 'sm' && 'h-1.5 w-1.5',
                size === 'md' && 'h-2 w-2',
                size === 'lg' && 'h-2.5 w-2.5'
              )}
              animate={{
                y: [0, -8, 0],
                opacity: [0.5, 1, 0.5],
              }}
              transition={{
                duration: 0.6,
                repeat: Infinity,
                delay: i * 0.2,
                ease: 'easeInOut',
              }}
            />
          ))}
        </div>
      )
    }

    if (variant === 'bars') {
      return (
        <div
          ref={ref}
          className={cn('flex items-center justify-center gap-1', className)}
          {...props}
        >
          {[0, 1, 2, 3].map((i) => (
            <motion.div
              key={i}
              className={cn(
                'bg-slate-900 rounded-sm',
                size === 'sm' && 'h-3 w-1',
                size === 'md' && 'h-4 w-1.5',
                size === 'lg' && 'h-5 w-2'
              )}
              animate={{
                scaleY: [1, 1.5, 1],
                opacity: [0.5, 1, 0.5],
              }}
              transition={{
                duration: 0.8,
                repeat: Infinity,
                delay: i * 0.1,
                ease: 'easeInOut',
              }}
            />
          ))}
        </div>
      )
    }

    return null
  }
)
Spinner.displayName = 'Spinner'

export { Spinner }

