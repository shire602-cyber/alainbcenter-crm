'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useSidebar } from './SidebarContext'
import {
  LayoutDashboard,
  Users,
  BarChart3,
  Settings,
  FileText,
  MessageSquare,
  MessageCircle,
  Plug2,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Shield,
  FolderOpen,
  Sparkles,
} from 'lucide-react'
import { Button } from '@/components/ui/button'

// Organized navigation structure matching Odoo-like CRM layout
const mainNavigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard, description: 'Today at a glance' },
  { name: 'Inbox', href: '/inbox', icon: MessageSquare, description: 'Omnichannel conversations' },
  { name: 'Leads', href: '/leads', icon: Users, description: 'All leads & contacts' },
  { name: 'Renewals', href: '/renewals', icon: RefreshCw, description: 'Expiry & renewals', adminOnly: false },
]

const secondaryNavigation = [
  { name: 'Reports', href: '/reports', icon: BarChart3, description: 'Analytics & KPIs' },
]

const adminNavigation = [
  { name: 'Integrations', href: '/admin/integrations', icon: Plug2, description: 'WhatsApp, Meta, Email' },
  { name: 'Users & Roles', href: '/admin/users', icon: Shield, description: 'Manage users' },
  { name: 'Services', href: '/admin/services', icon: FolderOpen, description: 'Service types' },
  { name: 'AI Training', href: '/admin/ai-training', icon: Sparkles, description: 'Train AI autopilot' },
  { name: 'Settings', href: '/settings/whatsapp', icon: Settings, description: 'WhatsApp & AI' },
]

export function Sidebar() {
  const pathname = usePathname()
  const [userRole, setUserRole] = useState<string | null>(null)
  const [unrepliedCount, setUnrepliedCount] = useState(0)
  const { isOpen, toggle } = useSidebar()

  useEffect(() => {
    fetch('/api/auth/me')
      .then(res => res.json())
      .then(data => setUserRole(data.user?.role || null))
      .catch(() => {})

    // Fetch unreplied message count
    const fetchUnrepliedCount = () => {
      fetch('/api/inbox/unreplied-count')
        .then(res => res.json())
        .then(data => setUnrepliedCount(data.count || 0))
        .catch(() => setUnrepliedCount(0))
    }

    fetchUnrepliedCount()
    // Poll every 30 seconds for updates
    const interval = setInterval(fetchUnrepliedCount, 30000)
    return () => clearInterval(interval)
  }, [])



  return (
    <>
      {/* Collapsed sidebar - just the toggle button */}
      {!isOpen && (
        <div className="hidden lg:fixed lg:inset-y-0 lg:z-50 lg:flex lg:w-16 lg:flex-col lg:items-center lg:border-r lg:border-border lg:bg-card">
          <div className="flex h-16 shrink-0 items-center justify-center w-full">
            <Button
              variant="ghost"
              size="sm"
              onClick={toggle}
              className="h-8 w-8 p-0 hover:bg-secondary"
              title="Open sidebar"
              aria-label="Open sidebar"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
      
      {/* Expanded sidebar */}
      {isOpen && (
        <div className="hidden lg:fixed lg:inset-y-0 lg:z-50 lg:flex lg:w-72 lg:flex-col transition-all duration-300">
          <div className="flex grow flex-col gap-y-2 overflow-y-auto border-r border-border bg-card pb-4 px-4">
            <div className="flex h-16 shrink-0 items-center justify-between border-b border-subtle mb-4">
            <Link href="/" className="flex items-center gap-3 flex-1 group">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 overflow-hidden flex-shrink-0 px-4 py-2 shadow-md transition-all duration-200 group-hover:shadow-lg group-hover:scale-[1.02]">
                <img 
                  src="/brand/alain-logo.webp" 
                  alt="Alain CRM" 
                  className="w-full h-full object-contain"
                  onError={(e) => {
                    // Fallback to icon if image fails
                    const target = e.target as HTMLImageElement
                    target.style.display = 'none'
                    const parent = target.parentElement
                    if (parent && !parent.querySelector('.logo-fallback')) {
                      const fallback = document.createElement('div')
                      fallback.className = 'logo-fallback'
                      fallback.innerHTML = '<svg class="h-5 w-5 text-white" fill="currentColor" viewBox="0 0 20 20"><path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z"/><path fill-rule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clip-rule="evenodd"/></svg>'
                      parent.appendChild(fallback)
                    }
                  }}
                />
              </div>
              <div className="flex-1 min-w-0">
                  <h1 className="text-h2 font-semibold text-slate-900 dark:text-slate-100 truncate">Alain CRM</h1>
                  <p className="text-xs text-muted-foreground font-normal truncate">AI Business CRM</p>
                </div>
              </Link>
          <Button
            variant="ghost"
            size="sm"
            onClick={toggle}
                className="h-8 w-8 p-0 hover:bg-secondary"
                title="Close sidebar"
                aria-label="Close sidebar"
              >
              <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>
          <nav className="flex flex-1 flex-col">
            <ul role="list" className="flex flex-1 flex-col gap-y-1">
              {/* Main Navigation */}
              {mainNavigation.map((item) => {
                // Filter based on adminOnly
                if (item.adminOnly && userRole?.toUpperCase() !== 'ADMIN' && userRole?.toUpperCase() !== 'MANAGER') {
                  return null
                }
                const isActive = pathname === item.href || (item.href !== '/' && pathname?.startsWith(item.href))
                const showUnrepliedDot = item.name === 'Inbox' && unrepliedCount > 0
                return (
                  <li key={item.name}>
                    <Link
                      href={item.href}
                      className={cn(
                        "group flex gap-x-3 rounded-xl px-4 py-2.5 text-sm font-semibold leading-normal transition-all duration-300 relative",
                        isActive
                          ? "bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg shadow-blue-500/30 scale-105"
                          : "text-foreground/70 hover:bg-gradient-to-r hover:from-blue-50 hover:to-purple-50 dark:hover:from-blue-950/30 dark:hover:to-purple-950/30 hover:text-blue-700 dark:hover:text-blue-300 hover:shadow-md"
                      )}
                      title={item.description}
                    >
                      <div className="relative">
                        <item.icon
                          className={cn(
                            "h-4 w-4 shrink-0",
                            isActive ? "text-primary-foreground" : "text-muted-foreground group-hover:text-foreground"
                          )}
                          aria-hidden="true"
                        />
                        {showUnrepliedDot && (
                          <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-destructive animate-pulse"></span>
                        )}
                      </div>
                      <div className="flex-1">
                        <div>{item.name}</div>
                        {item.description && (
                          <div className={cn(
                            "text-xs mt-0.5",
                            isActive ? "text-primary-foreground/70" : "text-muted-foreground"
                          )}>
                            {item.description}
                          </div>
                        )}
                      </div>
                    </Link>
                  </li>
                )
              })}
              
              {/* Divider */}
              <li className="my-2">
                <div className="h-px bg-border" />
              </li>
              
              {/* Secondary Navigation */}
              {secondaryNavigation.map((item) => {
                const isActive = pathname === item.href || (item.href !== '/' && pathname?.startsWith(item.href))
                return (
                  <li key={item.name}>
                    <Link
                      href={item.href}
                      className={cn(
                        "group flex gap-x-3 rounded-lg px-3 py-2 text-sm font-medium leading-normal transition-all duration-200",
                        isActive
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-foreground/70 hover:bg-secondary hover:text-foreground"
                      )}
                      title={item.description}
                    >
                      <item.icon
                        className={cn(
                          "h-4 w-4 shrink-0",
                          isActive ? "text-primary-foreground" : "text-muted-foreground group-hover:text-foreground"
                        )}
                        aria-hidden="true"
                      />
                      <div className="flex-1">
                        <div>{item.name}</div>
                        {item.description && (
                          <div className={cn(
                            "text-xs mt-0.5",
                            isActive ? "text-primary-foreground/70" : "text-muted-foreground"
                          )}>
                            {item.description}
                          </div>
                        )}
                      </div>
                    </Link>
                  </li>
                )
              })}
              
              {/* Admin Section (if user is admin) */}
              {(userRole?.toUpperCase() === 'ADMIN' || userRole?.toUpperCase() === 'MANAGER') && (
                <>
                  <li className="my-2">
                    <div className="h-px bg-border" />
                  </li>
                  <li className="px-3 py-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Administration
                    </p>
                  </li>
                  {adminNavigation.map((item) => {
                    const isActive = pathname === item.href || (item.href !== '/' && pathname?.startsWith(item.href))
                    return (
                      <li key={item.name}>
                        <Link
                          href={item.href}
                          className={cn(
                            "group flex gap-x-2 rounded-md p-2 text-sm font-medium leading-5 transition-colors",
                            isActive
                              ? "bg-primary text-primary-foreground shadow-md"
                              : "text-muted-foreground hover:bg-secondary hover:text-foreground hover:shadow-sm"
                          )}
                          title={item.description}
                        >
                          <item.icon
                            className={cn(
                              "h-4 w-4 shrink-0",
                              isActive ? "text-primary-foreground" : "text-muted-foreground group-hover:text-foreground"
                            )}
                            aria-hidden="true"
                          />
                          <div className="flex-1">
                            <div>{item.name}</div>
                            {item.description && (
                              <div className={cn(
                                "text-xs mt-0.5",
                                isActive ? "text-primary-foreground/70" : "text-muted-foreground"
                              )}>
                                {item.description}
                              </div>
                            )}
                          </div>
                        </Link>
                      </li>
                    )
                  })}
                </>
              )}
            </ul>
          </nav>
          </div>
        </div>
      )}
    </>
  )
}



