'use client'

import { createContext, useContext, useState, useCallback, ReactNode, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, CheckCircle2, AlertCircle, Info, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { slideFromRightVariants, staggerContainer } from '@/lib/animations'
import { Progress } from './progress'

type ToastType = 'success' | 'error' | 'info' | 'warning'

interface Toast {
  id: string
  message: string
  type: ToastType
  duration?: number
  createdAt: number
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType, duration?: number) => void
}

type ToastPosition = 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left'

const ToastContext = createContext<ToastContextType | undefined>(undefined)

interface ToastProviderProps {
  children: ReactNode
  position?: ToastPosition
  maxVisible?: number
}

export function ToastProvider({ 
  children, 
  position = 'top-right',
  maxVisible = 4 
}: ToastProviderProps) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const timersRef = useRef<Map<string, NodeJS.Timeout>>(new Map())
  const pausedRef = useRef<Set<string>>(new Set())

  const showToast = useCallback((message: string, type: ToastType = 'info', duration: number = 5000) => {
    const id = Math.random().toString(36).substring(2, 11)
    const newToast: Toast = { id, message, type, duration, createdAt: Date.now() }
    
    setToasts((prev) => {
      const updated = [...prev, newToast]
      // Keep only maxVisible toasts
      return updated.slice(-maxVisible)
    })
    
    // Auto-dismiss timer
    const timer = setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id))
      timersRef.current.delete(id)
    }, duration)
    
    timersRef.current.set(id, timer)
  }, [maxVisible])

  const removeToast = useCallback((id: string) => {
    const timer = timersRef.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timersRef.current.delete(id)
    }
    pausedRef.current.delete(id)
    setToasts((prev) => prev.filter((toast) => toast.id !== id))
  }, [])

  const pauseToast = useCallback((id: string) => {
    const timer = timersRef.current.get(id)
    if (timer && !pausedRef.current.has(id)) {
      clearTimeout(timer)
      timersRef.current.delete(id)
      pausedRef.current.add(id)
    }
  }, [])

  const resumeToast = useCallback((id: string, remaining: number) => {
    if (pausedRef.current.has(id)) {
      pausedRef.current.delete(id)
      const timer = setTimeout(() => {
        removeToast(id)
      }, remaining)
      timersRef.current.set(id, timer)
    }
  }, [removeToast])

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      timersRef.current.forEach((timer) => clearTimeout(timer))
      timersRef.current.clear()
    }
  }, [])

  const positionClasses = {
    'top-right': 'top-20 right-4',
    'top-left': 'top-20 left-4',
    'bottom-right': 'bottom-4 right-4',
    'bottom-left': 'bottom-4 left-4',
  }

  const icons = {
    success: CheckCircle2,
    error: AlertCircle,
    info: Info,
    warning: AlertTriangle,
  }

  const colors = {
    success: {
      bg: 'bg-green-50',
      border: 'border-green-200',
      text: 'text-green-800',
      icon: 'text-green-600',
    },
    error: {
      bg: 'bg-red-50',
      border: 'border-red-200',
      text: 'text-red-800',
      icon: 'text-red-600',
    },
    info: {
      bg: 'bg-blue-50',
      border: 'border-blue-200',
      text: 'text-blue-800',
      icon: 'text-blue-600',
    },
    warning: {
      bg: 'bg-amber-50',
      border: 'border-amber-200',
      text: 'text-amber-800',
      icon: 'text-amber-600',
    },
  }

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <AnimatePresence mode="popLayout">
        <motion.div
          className={cn(
            'fixed z-50 flex flex-col gap-2 max-w-md',
            positionClasses[position]
          )}
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
        >
          {toasts.map((toast, index) => {
            const Icon = icons[toast.type]
            const color = colors[toast.type]
            const elapsed = Date.now() - toast.createdAt
            const remaining = Math.max(0, (toast.duration || 5000) - elapsed)
            const progress = ((toast.duration || 5000) - remaining) / (toast.duration || 5000) * 100

            return (
              <motion.div
                key={toast.id}
                layout
                variants={slideFromRightVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                drag="x"
                dragConstraints={{ left: 0, right: 300 }}
                dragElastic={0.2}
                onDragEnd={(_, info) => {
                  if (info.offset.x > 100) {
                    removeToast(toast.id)
                  }
                }}
                onHoverStart={() => pauseToast(toast.id)}
                onHoverEnd={() => resumeToast(toast.id, remaining)}
                className={cn(
                  'flex flex-col gap-2 p-4 rounded-xl border shadow-lg min-w-[320px] max-w-md cursor-pointer',
                  color.bg,
                  color.border,
                  color.text
                )}
              >
                <div className="flex items-start gap-3">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                  >
                    <Icon className={cn('h-5 w-5 flex-shrink-0 mt-0.5', color.icon)} />
                  </motion.div>
                  <p className="flex-1 text-body font-medium">{toast.message}</p>
                  <button
                    onClick={() => removeToast(toast.id)}
                    className="flex-shrink-0 text-current opacity-70 hover:opacity-100 transition-opacity"
                    aria-label="Close toast"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                {/* Progress bar */}
                <Progress
                  value={progress}
                  variant={toast.type === 'success' ? 'success' : toast.type === 'error' ? 'error' : toast.type === 'warning' ? 'warning' : 'default'}
                  className="h-1"
                />
              </motion.div>
            )
          })}
        </motion.div>
      </AnimatePresence>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) {
    // Fallback if used outside provider
    return {
      showToast: (message: string, type?: ToastType, duration?: number) => {
        console.log(`[Toast ${type || 'info'}]:`, message)
      },
    }
  }
  return context
}
















