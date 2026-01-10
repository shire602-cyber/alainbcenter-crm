'use client'

import React from 'react'
import { AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface LeadErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

/**
 * ErrorBoundary for Lead Detail Page
 * Catches React errors (including #310) and shows fallback UI
 */
export class LeadErrorBoundary extends React.Component<
  { children: React.ReactNode },
  LeadErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): LeadErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[LEAD-ERROR-BOUNDARY] Caught error:', error)
    console.error('[LEAD-ERROR-BOUNDARY] Error info:', errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-screen bg-app p-6">
          <div className="max-w-md w-full text-center">
            <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-h2 font-semibold text-slate-900 mb-2">
              Something went wrong
            </h2>
            <p className="text-body text-slate-600 mb-6">
              {this.state.error?.message || 'An error occurred while loading this lead.'}
            </p>
            <div className="flex gap-3 justify-center">
              <Button
                onClick={() => {
                  this.setState({ hasError: false, error: null })
                  window.location.reload()
                }}
                variant="default"
              >
                Reload Page
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
      )
    }

    return this.props.children
  }
}

