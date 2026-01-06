'use client'

import { useEffect } from 'react'
import { AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MainLayout } from '@/components/layout/MainLayout'

/**
 * Error boundary for /leads/[id] route
 * Shows friendly error UI when React errors occur
 */
export default function LeadDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log error for debugging
    console.error('[LEAD-ERROR] Lead detail page error:', error)
  }, [error])

  return (
    <MainLayout>
      <div className="flex flex-col items-center justify-center h-screen bg-app p-6">
        <div className="max-w-md w-full text-center">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-h2 font-semibold text-slate-900 dark:text-slate-100 mb-2">
            Something went wrong
          </h2>
          <p className="text-body text-slate-600 dark:text-slate-400 mb-6">
            {error.message || 'An error occurred while loading this lead.'}
          </p>
          <div className="flex gap-3 justify-center">
            <Button
              onClick={() => reset()}
              variant="default"
            >
              Try Again
            </Button>
            <Button
              onClick={() => window.history.back()}
              variant="outline"
            >
              Go Back
            </Button>
          </div>
        </div>
      </div>
    </MainLayout>
  )
}










