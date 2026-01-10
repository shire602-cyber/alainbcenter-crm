'use client'

import * as React from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Input } from './input'

export interface FloatingLabelInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string
  error?: string
  success?: boolean
}

const FloatingLabelInput = React.forwardRef<HTMLInputElement, FloatingLabelInputProps>(
  ({ className, label, error, success, value, onFocus, onBlur, ...props }, ref) => {
    const [isFocused, setIsFocused] = React.useState(false)
    const [hasValue, setHasValue] = React.useState(!!value)

    React.useEffect(() => {
      setHasValue(!!value)
    }, [value])

    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(true)
      onFocus?.(e)
    }

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(false)
      onBlur?.(e)
    }

    const isFloating = isFocused || hasValue

    return (
      <div className="relative">
        <Input
          ref={ref}
          className={cn(
            'peer pt-6 pb-2',
            error && 'border-red-300 focus-visible:ring-red-500/20',
            success && 'border-green-300 focus-visible:ring-green-500/20',
            className
          )}
          value={value}
          onFocus={handleFocus}
          onBlur={handleBlur}
          aria-invalid={!!error}
          aria-describedby={error ? `${props.id}-error` : undefined}
          {...props}
        />
        <motion.label
          htmlFor={props.id}
          className={cn(
            'absolute left-3 pointer-events-none transition-colors duration-200',
            isFloating
              ? 'top-2 text-caption text-slate-600 font-medium'
              : 'top-1/2 -translate-y-1/2 text-body text-slate-500',
            error && 'text-red-600',
            success && 'text-green-600'
          )}
          animate={{
            top: isFloating ? 8 : '50%',
            fontSize: isFloating ? 12 : 14,
          }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
        >
          {label}
          {props.required && <span className="text-red-500 ml-1">*</span>}
        </motion.label>
        {error && (
          <p
            id={`${props.id}-error`}
            className="text-caption text-red-600 mt-1 ml-3"
            role="alert"
          >
            {error}
          </p>
        )}
        {success && !error && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-green-600">
            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
          </div>
        )}
      </div>
    )
  }
)
FloatingLabelInput.displayName = 'FloatingLabelInput'

export { FloatingLabelInput }

