'use client'

import * as React from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AccordionContextValue {
  value: string[]
  toggleItem: (itemValue: string) => void
}

const AccordionContext = React.createContext<AccordionContextValue | undefined>(undefined)
const AccordionItemContext = React.createContext<{ value: string } | undefined>(undefined)

interface AccordionProps {
  type?: 'single' | 'multiple'
  defaultValue?: string | string[]
  value?: string | string[]
  onValueChange?: (value: string | string[]) => void
  children: React.ReactNode
  className?: string
}

export function Accordion({ 
  type = 'multiple', 
  defaultValue, 
  value: controlledValue,
  onValueChange,
  children,
  className 
}: AccordionProps) {
  const [internalValue, setInternalValue] = React.useState<string[]>(
    defaultValue 
      ? Array.isArray(defaultValue) ? defaultValue : [defaultValue]
      : []
  )
  
  const value = controlledValue 
    ? (Array.isArray(controlledValue) ? controlledValue : [controlledValue])
    : internalValue

  const handleValueChange = React.useCallback((newValue: string[]) => {
    if (type === 'single') {
      const singleValue = newValue.length > 0 ? newValue[0] : ''
      if (onValueChange) {
        onValueChange(singleValue)
      } else {
        setInternalValue(singleValue ? [singleValue] : [])
      }
    } else {
      if (onValueChange) {
        onValueChange(newValue)
      } else {
        setInternalValue(newValue)
      }
    }
  }, [type, onValueChange])

  const toggleItem = React.useCallback((itemValue: string) => {
    const isOpen = value.includes(itemValue)
    if (type === 'single') {
      handleValueChange(isOpen ? [] : [itemValue])
    } else {
      handleValueChange(
        isOpen 
          ? value.filter(v => v !== itemValue)
          : [...value, itemValue]
      )
    }
  }, [value, type, handleValueChange])

  return (
    <AccordionContext.Provider value={{ value, toggleItem }}>
      <div className={cn('space-y-2', className)}>
        {children}
      </div>
    </AccordionContext.Provider>
  )
}

interface AccordionItemProps {
  value: string
  children: React.ReactNode
  className?: string
}

export function AccordionItem({ value, children, className }: AccordionItemProps) {
  const context = React.useContext(AccordionContext)
  if (!context) throw new Error('AccordionItem must be used within Accordion')

  return (
    <AccordionItemContext.Provider value={{ value }}>
      <div className={cn('border border-slate-200 rounded-lg overflow-hidden', className)}>
        {children}
      </div>
    </AccordionItemContext.Provider>
  )
}

interface AccordionTriggerProps {
  children: React.ReactNode
  className?: string
}

export function AccordionTrigger({ children, className }: AccordionTriggerProps) {
  const context = React.useContext(AccordionContext)
  if (!context) throw new Error('AccordionTrigger must be used within AccordionItem')
  
  const itemContext = React.useContext(AccordionItemContext)
  if (!itemContext) throw new Error('AccordionTrigger must be used within AccordionItem')
  
  const isOpen = context.value.includes(itemContext.value)

  return (
    <button
      onClick={() => context.toggleItem(itemContext.value)}
      className={cn(
        'w-full flex items-center justify-between p-4 text-left hover:bg-slate-50:bg-slate-900/50 transition-colors',
        className
      )}
    >
      <span className="text-sm font-medium text-slate-900">
        {children}
      </span>
      <ChevronDown className={cn(
        'h-4 w-4 text-slate-500 transition-transform',
        isOpen && 'rotate-180'
      )} />
    </button>
  )
}

interface AccordionContentProps {
  children: React.ReactNode
  className?: string
}

export function AccordionContent({ children, className }: AccordionContentProps) {
  const context = React.useContext(AccordionContext)
  if (!context) throw new Error('AccordionContent must be used within AccordionItem')
  
  const itemContext = React.useContext(AccordionItemContext)
  if (!itemContext) throw new Error('AccordionContent must be used within AccordionItem')
  
  const isOpen = context.value.includes(itemContext.value)

  if (!isOpen) return null

  return (
    <div className={cn('p-4 pt-0', className)}>
      {children}
    </div>
  )
}
