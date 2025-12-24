'use client'

import { useEffect, useState, KeyboardEvent } from 'react'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import LogoutButton from '@/components/LogoutButton'
import { DarkModeToggle } from '@/components/layout/DarkModeToggle'
import { useSidebar } from '@/components/layout/SidebarContext'
import { Bell, Search, Plus, Menu, MessageSquare } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export function TopNavClient() {
  const [user, setUser] = useState<{ name?: string; email?: string; role?: string } | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [unrepliedCount, setUnrepliedCount] = useState(0)
  const [notificationCount, setNotificationCount] = useState(0)
  const { toggle, isOpen } = useSidebar()
  const router = useRouter()

  useEffect(() => {
    // Fetch user data on client side
    fetch('/api/auth/me')
      .then(res => res.json())
      .then(data => setUser(data.user))
      .catch(() => {})

    // Fetch unreplied message count
    const fetchUnrepliedCount = () => {
      fetch('/api/inbox/unreplied-count')
        .then(res => res.json())
        .then(data => setUnrepliedCount(data.count || 0))
        .catch(() => setUnrepliedCount(0))
    }

    // Fetch notification count
    const fetchNotificationCount = () => {
      fetch('/api/notifications/count')
        .then(res => res.json())
        .then(data => setNotificationCount(data.count || 0))
        .catch(() => setNotificationCount(0))
    }

    fetchUnrepliedCount()
    fetchNotificationCount()
    // Poll every 30 seconds for updates
    const interval = setInterval(() => {
      fetchUnrepliedCount()
      fetchNotificationCount()
    }, 30000)
    return () => clearInterval(interval)
  }, [])

  const handleSearch = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && searchQuery.trim()) {
      // Navigate to leads page with search query
      router.push(`/leads?search=${encodeURIComponent(searchQuery.trim())}`)
    }
  }

  // Keyboard shortcut: Ctrl+K or Cmd+K to focus search
  useEffect(() => {
    if (typeof window === 'undefined') return
    
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        const searchInput = document.querySelector('input[type="search"]') as HTMLInputElement
        searchInput?.focus()
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <div className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-x-4 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 px-4 sm:px-6 lg:px-8 shadow-sm">
      {/* Sidebar Toggle Button */}
      <Button
        variant="ghost"
        size="icon"
        onClick={toggle}
        className="lg:hidden"
        title={isOpen ? "Close sidebar" : "Open sidebar"}
      >
        <Menu className="h-5 w-5" />
      </Button>
      
      <div className="flex flex-1 gap-x-4 self-stretch lg:gap-x-6">
        <div className="relative flex flex-1 items-center max-w-2xl">
          <Search className="pointer-events-none absolute left-3 h-5 w-5 text-muted-foreground" />
          <input
            type="search"
            placeholder="Search leads, contacts, or anything... (Ctrl+K)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleSearch}
            className="block h-10 w-full rounded-lg border border-border bg-secondary/50 py-1.5 pl-10 pr-20 text-sm text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary focus:border-primary sm:text-sm transition-all duration-200 hover:bg-secondary"
          />
          <div className="absolute right-2 flex items-center gap-1">
            <kbd className="hidden md:inline-flex h-5 select-none items-center gap-1 rounded border border-border bg-background px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
              <span className="text-xs">⌘</span>K
            </kbd>
          </div>
        </div>
        <div className="flex items-center gap-x-3 lg:gap-x-4">
          <DarkModeToggle />
          <Link href="/notifications">
            <Button variant="ghost" size="icon" className="relative" title="Notifications">
              <Bell className="h-5 w-5" />
              {notificationCount > 0 && (
                <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-destructive animate-pulse"></span>
              )}
            </Button>
          </Link>
          
          <Link href="/inbox">
            <Button variant="ghost" size="icon" className="relative" title="Inbox">
              <MessageSquare className="h-5 w-5" />
              {unrepliedCount > 0 && (
                <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-destructive animate-pulse"></span>
              )}
            </Button>
          </Link>

          <Link href="/leads?action=create">
            <Button>
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">New Lead</span>
            </Button>
          </Link>

          <div className="hidden lg:block lg:h-6 lg:w-px lg:bg-border" />

          <div className="flex items-center gap-x-3">
            <div className="hidden text-right lg:block">
              <p className="text-sm font-medium text-foreground">{user?.name || 'User'}</p>
              <p className="text-xs text-muted-foreground">{user?.email || ''}</p>
              {user?.role && (
                <p className="text-xs font-medium text-primary mt-0.5">
                  {user.role.toUpperCase()}
                </p>
              )}
            </div>
            <Avatar fallback={user?.name || 'U'} size="md" />
            <LogoutButton />
          </div>
        </div>
      </div>
    </div>
  )
}

