/**
 * Accessibility utilities
 * Keyboard navigation, focus management, ARIA helpers
 */

/**
 * Check if user prefers reduced motion
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Focus trap - traps focus within an element
 */
export function createFocusTrap(element: HTMLElement) {
  const focusableElements = element.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  )
  const firstFocusable = focusableElements[0] as HTMLElement
  const lastFocusable = focusableElements[focusableElements.length - 1] as HTMLElement

  const handleTab = (e: KeyboardEvent) => {
    if (e.key !== 'Tab') return

    if (e.shiftKey) {
      // Shift + Tab
      if (document.activeElement === firstFocusable) {
        lastFocusable?.focus()
        e.preventDefault()
      }
    } else {
      // Tab
      if (document.activeElement === lastFocusable) {
        firstFocusable?.focus()
        e.preventDefault()
      }
    }
  }

  element.addEventListener('keydown', handleTab)
  firstFocusable?.focus()

  return () => {
    element.removeEventListener('keydown', handleTab)
  }
}

/**
 * Keyboard shortcuts handler
 */
export function useKeyboardShortcut(
  key: string,
  handler: () => void,
  modifiers?: { ctrl?: boolean; shift?: boolean; alt?: boolean; meta?: boolean }
) {
  if (typeof window === 'undefined') return () => {}

  const handleKeyDown = (e: KeyboardEvent) => {
    const keyMatches = e.key.toLowerCase() === key.toLowerCase()
    const ctrlMatches = !modifiers?.ctrl || e.ctrlKey
    const shiftMatches = !modifiers?.shift || e.shiftKey
    const altMatches = !modifiers?.alt || e.altKey
    const metaMatches = !modifiers?.meta || e.metaKey

    if (keyMatches && ctrlMatches && shiftMatches && altMatches && metaMatches) {
      e.preventDefault()
      handler()
    }
  }

  window.addEventListener('keydown', handleKeyDown)
  return () => window.removeEventListener('keydown', handleKeyDown)
}

/**
 * ARIA live region helper for announcements
 */
export function announceToScreenReader(message: string, priority: 'polite' | 'assertive' = 'polite') {
  if (typeof document === 'undefined') return

  const liveRegion = document.getElementById('aria-live-region') || createLiveRegion()
  liveRegion.setAttribute('aria-live', priority)
  liveRegion.textContent = message

  // Clear after a delay to allow re-announcement of the same message
  setTimeout(() => {
    liveRegion.textContent = ''
  }, 1000)
}

function createLiveRegion(): HTMLElement {
  const region = document.createElement('div')
  region.id = 'aria-live-region'
  region.setAttribute('aria-live', 'polite')
  region.setAttribute('aria-atomic', 'true')
  region.className = 'sr-only'
  region.style.cssText = 'position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border-width: 0;'
  document.body.appendChild(region)
  return region
}

/**
 * Generate unique ID for ARIA attributes
 */
let idCounter = 0
export function generateAriaId(prefix = 'aria'): string {
  return `${prefix}-${++idCounter}-${Date.now()}`
}

/**
 * Skip to content link handler
 */
export function createSkipToContentLink(targetId: string): void {
  if (typeof document === 'undefined') return

  // Remove existing skip link if any
  const existing = document.getElementById('skip-to-content')
  if (existing) existing.remove()

  const link = document.createElement('a')
  link.id = 'skip-to-content'
  link.href = `#${targetId}`
  link.textContent = 'Skip to main content'
  link.className = 'sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-blue-600 focus:text-white focus:rounded-lg'
  link.style.cssText = 'position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border-width: 0;'
  
  document.body.insertBefore(link, document.body.firstChild)
}

