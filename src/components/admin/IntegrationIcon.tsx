'use client'

import {
  MessageSquare,
  Mail,
  Facebook,
  Instagram,
  Brain,
} from 'lucide-react'

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  MessageSquare,
  Mail,
  Facebook,
  Instagram,
  Brain,
}

export function IntegrationIcon({ iconName, isEnabled }: { iconName: string; isEnabled: boolean }) {
  const Icon = iconMap[iconName] || MessageSquare
  return (
    <Icon className={`h-5 w-5 ${isEnabled ? 'text-green-600' : 'text-muted-foreground'}`} />
  )
}

