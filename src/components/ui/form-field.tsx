'use client'

import * as React from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { shakeVariants } from '@/lib/animations'
import { Label } from './label'
import { Input } from './input'
import { Textarea } from './textarea'

export interface FormFieldProps {
  label: string
  error?: string
  success?: boolean
  required?: boolean
  hint?: string
  children?: React.ReactNode
  className?: string
}

export function FormField({
  label,
  error,
  success,
  required,
  hint,
  children,
  className,
}: FormFieldProps) {
  const fieldId = React.useId()
  const errorId = `${fieldId}-error`
  const hintId = `${fieldId}-hint`

  const childrenWithProps = React.Children.map(children, (child) => {
    if (React.isValidElement(child)) {
      return React.cloneElement(child as React.ReactElement<any>, {
        id: fieldId,
        'aria-invalid': !!error,
        'aria-describedby': error ? errorId : hint ? hintId : undefined,
        'aria-required': required,
      })
    }
    return child
  })

  return (
    <motion.div
      className={cn('space-y-2', className)}
      variants={error ? shakeVariants : undefined}
      animate={error ? 'shake' : undefined}
    >
      <Label htmlFor={fieldId} className="text-body font-semibold">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </Label>
      {hint && (
        <p id={hintId} className="text-caption text-slate-500">
          {hint}
        </p>
      )}
      {childrenWithProps}
      {error && (
        <motion.p
          id={errorId}
          className="text-caption text-red-600 flex items-center gap-1"
          role="alert"
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
        >
          <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
          {error}
        </motion.p>
      )}
      {success && !error && (
        <p className="text-caption text-green-600 flex items-center gap-1">
          <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
              clipRule="evenodd"
            />
          </svg>
          Looks good!
        </p>
      )}
    </motion.div>
  )
}

export function FormFieldInput(props: React.ComponentProps<typeof Input> & { label: string; error?: string; success?: boolean; required?: boolean; hint?: string }) {
  const { label, error, success, required, hint, ...inputProps } = props
  return (
    <FormField label={label} error={error} success={success} required={required} hint={hint}>
      <Input {...inputProps} />
    </FormField>
  )
}

export function FormFieldTextarea(props: React.ComponentProps<typeof Textarea> & { label: string; error?: string; success?: boolean; required?: boolean; hint?: string }) {
  const { label, error, success, required, hint, ...textareaProps } = props
  return (
    <FormField label={label} error={error} success={success} required={required} hint={hint}>
      <Textarea {...textareaProps} />
    </FormField>
  )
}

