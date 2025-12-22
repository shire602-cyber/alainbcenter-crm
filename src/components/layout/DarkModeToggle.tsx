'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Moon, Sun } from 'lucide-react'
import { cn } from '@/lib/utils'

export function DarkModeToggle() {
  const [mounted, setMounted] = useState(false)
  const [isDark, setIsDark] = useState(false)

  useEffect(() => {
    setMounted(true)
    
    // Get theme from localStorage or system preference
    const stored = localStorage.getItem('theme')
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const shouldBeDark = stored ? stored === 'dark' : prefersDark
    
    setIsDark(shouldBeDark)
    updateTheme(shouldBeDark)

    // Listen for system theme changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = (e: MediaQueryListEvent) => {
      if (!localStorage.getItem('theme')) {
        setIsDark(e.matches)
        updateTheme(e.matches)
      }
    }

    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  const updateTheme = (dark: boolean) => {
    const root = document.documentElement
    
    if (dark) {
      root.classList.add('dark')
      root.style.colorScheme = 'dark'
    } else {
      root.classList.remove('dark')
      root.style.colorScheme = 'light'
    }
  }

  const toggleDarkMode = () => {
    const newIsDark = !isDark
    setIsDark(newIsDark)
    updateTheme(newIsDark)
    localStorage.setItem('theme', newIsDark ? 'dark' : 'light')
  }

  // Prevent flash of wrong theme
  if (!mounted) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="gap-2"
        disabled
      >
        <Moon className="h-4 w-4" />
        <span className="hidden sm:inline">Dark</span>
      </Button>
    )
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggleDarkMode}
      className={cn(
        "gap-2 transition-all duration-200",
        "hover:bg-secondary",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      )}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {isDark ? (
        <>
          <Sun className="h-4 w-4 transition-transform duration-200 hover:rotate-12" />
          <span className="hidden sm:inline">Light</span>
        </>
      ) : (
        <>
          <Moon className="h-4 w-4 transition-transform duration-200 hover:-rotate-12" />
          <span className="hidden sm:inline">Dark</span>
        </>
      )}
    </Button>
  )
}

