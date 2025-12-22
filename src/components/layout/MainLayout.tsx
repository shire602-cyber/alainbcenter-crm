'use client'

import * as React from 'react'
import { Sidebar } from './Sidebar'
import { TopNavClient } from './TopNavClient'
import { SidebarProvider, useSidebar } from './SidebarContext'
import { cn } from '@/lib/utils'

function MainLayoutContent({ children }: { children: React.ReactNode }) {
  const { isOpen } = useSidebar()

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Sidebar />
      
      <div className={cn(
        "transition-all duration-300 bg-background",
        isOpen ? "lg:pl-72" : "lg:pl-16"
      )}>
        <TopNavClient />
        
        <main className="py-4 px-4 sm:px-6 lg:px-6 bg-background">
          <div className="mx-auto max-w-7xl">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}

export function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <MainLayoutContent>{children}</MainLayoutContent>
    </SidebarProvider>
  )
}
