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
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, description: 'Today at a glance' },
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
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-900 overflow-hidden flex-shrink-0 px-2 py-2 shadow-lg transition-all duration-300 group-hover:shadow-xl group-hover:scale-[1.03]">
                <img 
                  src="/implse-ai-icon.svg" 
                  alt="IMPLSE AI" 
                  className="w-full h-full object-contain"
                  onError={(e) => {
                    // Fallback to icon if image fails
                    const target = e.target as HTMLImageElement
                    target.style.display = 'none'
                    const parent = target.parentElement
                    if (parent && !parent.querySelector('.logo-fallback')) {
                      const fallback = document.createElement('div')
                      fallback.className = 'logo-fallback flex items-center justify-center w-full h-full'
                      fallback.innerHTML = '<svg class="h-6 w-6 text-white" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M 22 28 L 32 12 L 42 28 M 28 22 L 36 22" stroke="white" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>'
                      parent.appendChild(fallback)
                    }
                  }}
                />
              </div>
              <div className="flex-1 min-w-0">
                  <h1 className="text-subhead truncate">IMPLSE AI</h1>
                  <p className="text-caption truncate">AI Business CRM</p>
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
                        "group flex gap-x-3 rounded-xl px-4 py-2.5 text-body font-semibold leading-normal transition-all duration-300 relative",
                        isActive
                          ? "bg-slate-900 text-white shadow-lg scale-[1.02]"
                          : "text-slate-700 hover:bg-slate-100 hover:text-slate-900 hover:shadow-sm"
                      )}
                      title={item.description}
                    >
                      <div className="relative">
                        <item.icon
                          className={cn(
                            "h-4 w-4 shrink-0",
                            isActive ? "text-white" : "text-slate-500 group-hover:text-slate-900"
                          )}
                          aria-hidden="true"
                        />
                        {showUnrepliedDot && (
                          <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-red-500 animate-pulse"></span>
                        )}
                      </div>
                      <div className="flex-1">
                        <div>{item.name}</div>
                        {item.description && (
                          <div className={cn(
                            "text-caption mt-0.5",
                            isActive ? "text-white/80" : "text-slate-500"
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
                        "group flex gap-x-3 rounded-lg px-3 py-2 text-body font-semibold leading-normal transition-all duration-300",
                        isActive
                          ? "bg-slate-900 text-white shadow-md"
                          : "text-slate-700 hover:bg-slate-100 hover:text-slate-900 hover:shadow-sm"
                      )}
                      title={item.description}
                    >
                      <item.icon
                        className={cn(
                          "h-4 w-4 shrink-0",
                          isActive ? "text-white" : "text-slate-500 group-hover:text-slate-900"
                        )}
                        aria-hidden="true"
                      />
                      <div className="flex-1">
                        <div>{item.name}</div>
                        {item.description && (
                          <div className={cn(
                            "text-caption mt-0.5",
                            isActive ? "text-white/80" : "text-slate-500"
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
                    <p className="text-caption font-bold text-slate-500 uppercase tracking-wider">
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
                            "group flex gap-x-2 rounded-lg p-2.5 text-body font-semibold leading-5 transition-all duration-300",
                            isActive
                              ? "bg-slate-900 text-white shadow-md"
                              : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 hover:shadow-sm"
                          )}
                          title={item.description}
                        >
                          <item.icon
                            className={cn(
                              "h-4 w-4 shrink-0",
                              isActive ? "text-white" : "text-slate-500 group-hover:text-slate-900"
                            )}
                            aria-hidden="true"
                          />
                          <div className="flex-1">
                            <div>{item.name}</div>
                            {item.description && (
                              <div className={cn(
                                "text-xs mt-0.5 font-medium",
                                isActive ? "text-white/80" : "text-slate-500"
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



