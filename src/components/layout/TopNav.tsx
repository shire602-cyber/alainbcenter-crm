'use client'

import { getCurrentUser } from '@/lib/auth-server'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import LogoutButton from '@/components/LogoutButton'
import { Bell, Search, Plus } from 'lucide-react'
import Link from 'next/link'

export async function TopNav() {
  const user = await getCurrentUser()

  return (
    <div className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-x-4 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 px-4 sm:px-6 lg:px-8 shadow-sm">
      <div className="flex flex-1 gap-x-4 self-stretch lg:gap-x-6">
        <div className="relative flex flex-1 items-center">
          <Search className="pointer-events-none absolute left-3 h-5 w-5 text-muted-foreground" />
          <input
            type="search"
            placeholder="Search leads, contacts, or anything..."
            className="block h-10 w-full rounded-lg border-0 bg-secondary py-1.5 pl-10 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary sm:text-sm transition-all duration-200"
          />
        </div>
        <div className="flex items-center gap-x-4 lg:gap-x-6">
          <Button variant="ghost" size="icon" className="relative">
            <Bell className="h-5 w-5" />
            <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-destructive"></span>
          </Button>
          
          <Link href="/leads">
            <Button className="gap-2 shadow-md">
              <Plus className="h-4 w-4" />
              New Lead
            </Button>
          </Link>

          <div className="hidden lg:block lg:h-6 lg:w-px lg:bg-border" />

          <div className="flex items-center gap-x-3">
            <div className="hidden text-right lg:block">
              <p className="text-sm font-medium text-foreground">{user?.name}</p>
              <p className="text-xs text-muted-foreground">{user?.email}</p>
            </div>
            <Avatar fallback={user?.name || 'U'} size="md" />
            <LogoutButton />
          </div>
        </div>
      </div>
    </div>
  )
}

