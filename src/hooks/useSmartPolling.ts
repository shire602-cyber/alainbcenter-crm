/**
 * SMART POLLING HOOK
 * 
 * Polling with:
 * - Visibility-aware pause (stops when tab hidden)
 * - Exponential backoff on errors
 * - Manual refresh capability
 * - Configurable interval
 */

import { useEffect, useRef, useState, useCallback } from 'react'

interface UseSmartPollingOptions {
  fetcher: () => Promise<void> | void
  intervalMs: number
  enabled?: boolean
  pauseWhenHidden?: boolean
  onErrorBackoff?: boolean
}

export function useSmartPolling({
  fetcher,
  intervalMs,
  enabled = true,
  pauseWhenHidden = true,
  onErrorBackoff = true,
}: UseSmartPollingOptions) {
  const [isPolling, setIsPolling] = useState(false)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const backoffRef = useRef<number>(intervalMs)
  const errorCountRef = useRef<number>(0)

  const executeFetch = useCallback(async () => {
    try {
      setIsPolling(true)
      await fetcher()
      // Reset backoff on success
      if (onErrorBackoff && errorCountRef.current > 0) {
        errorCountRef.current = 0
        backoffRef.current = intervalMs
      }
    } catch (error) {
      console.error('Polling error:', error)
      if (onErrorBackoff) {
        errorCountRef.current += 1
        // Exponential backoff: 15s → 30s → 60s
        backoffRef.current = Math.min(intervalMs * Math.pow(2, errorCountRef.current), intervalMs * 4)
      }
    } finally {
      setIsPolling(false)
    }
  }, [fetcher, intervalMs, onErrorBackoff])

  const manualRefresh = useCallback(() => {
    // Reset backoff on manual refresh
    if (onErrorBackoff) {
      errorCountRef.current = 0
      backoffRef.current = intervalMs
    }
    executeFetch()
  }, [executeFetch, intervalMs, onErrorBackoff])

  useEffect(() => {
    if (!enabled) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      return
    }

    // Initial fetch
    executeFetch()

    // Set up polling
    const setupPolling = () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }

      intervalRef.current = setInterval(() => {
        // Check visibility if pauseWhenHidden is enabled
        if (pauseWhenHidden && typeof document !== 'undefined' && document.hidden) {
          return // Skip polling when tab is hidden
        }

        executeFetch()
      }, backoffRef.current)
    }

    setupPolling()

    // Handle visibility changes
    if (pauseWhenHidden && typeof document !== 'undefined') {
      const handleVisibilityChange = () => {
        if (document.hidden) {
          // Pause polling when tab is hidden
          if (intervalRef.current) {
            clearInterval(intervalRef.current)
            intervalRef.current = null
          }
        } else {
          // Resume polling when tab becomes visible
          if (enabled && !intervalRef.current) {
            executeFetch() // Immediate fetch on visibility
            setupPolling()
          }
        }
      }

      document.addEventListener('visibilitychange', handleVisibilityChange)

      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current)
        }
        document.removeEventListener('visibilitychange', handleVisibilityChange)
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [enabled, pauseWhenHidden, executeFetch])

  return {
    isPolling,
    manualRefresh,
  }
}











