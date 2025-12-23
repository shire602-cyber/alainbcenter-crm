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
  { name: 'Automation', href: '/automation', icon: Sparkles, description: 'Autopilot rules', adminOnly: true },
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
  const { isOpen, toggle } = useSidebar()

  useEffect(() => {
    fetch('/api/auth/me')
      .then(res => res.json())
      .then(data => setUserRole(data.user?.role || null))
      .catch(() => {})
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
            <div className="flex h-16 shrink-0 items-center justify-between">
            <div className="flex items-center gap-2 flex-1">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
                <FileText className="h-5 w-5 text-white" />
              </div>
              <div>
                  <h1 className="text-base font-semibold tracking-tight text-foreground">Alain CRM</h1>
                  <p className="text-xs text-muted-foreground font-normal">Business Center</p>
                </div>
              </div>
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
              
              {/* Divider */}
              <li className="my-2">
                <div className="h-px bg-border" />
              </li>
              
              {/* Secondary Navigation */}
              {secondaryNavigation.map((item) => {
                if (item.adminOnly && userRole?.toUpperCase() !== 'ADMIN' && userRole?.toUpperCase() !== 'MANAGER') {
                  return null
                }
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



