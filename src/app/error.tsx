'use client'

import React, { useEffect } from 'react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Application error:', error)
  }, [error])

  const errorMessage = error.message || 'An unexpected error occurred'

  return (
    <div className="flex min-h-screen items-center justify-center p-4 bg-background">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-lg">
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
              <svg
                className="h-5 w-5 text-destructive"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <h2 className="text-2xl font-semibold text-foreground">Something went wrong</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            An error occurred while loading this page
          </p>
          {errorMessage && (
            <div className="rounded-lg bg-destructive/10 p-3">
              <p className="text-sm text-destructive">{errorMessage}</p>
            </div>
          )}
          <div className="flex gap-2">
            <button
              onClick={reset}
              className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-md hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 transition-all"
            >
              Try again
            </button>
            <button
              onClick={() => (window.location.href = '/login')}
              className="flex-1 rounded-lg border-2 border-border bg-background px-4 py-2 text-sm font-medium text-foreground shadow-sm hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 transition-all"
            >
              Go to Login
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}