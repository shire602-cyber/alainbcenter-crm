'use client'

import Link from 'next/link'
import { Plus } from 'lucide-react'
import { Button } from './button'
import { cn } from '@/lib/utils'

export function FloatingActionButton({ href = '/leads' }: { href?: string }) {
  return (
    <Link
      href={href}
      className={cn(
        "fixed bottom-8 right-8 z-50 lg:hidden",
        "flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-strong",
        "transition-all duration-200 hover:scale-110 hover:shadow-xl active:scale-95"
      )}
    >
      <Plus className="h-6 w-6" />
    </Link>
  )
}

