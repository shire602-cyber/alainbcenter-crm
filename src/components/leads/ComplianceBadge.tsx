'use client'

import { Badge } from '@/components/ui/badge'
import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

type ComplianceStatus = 'GOOD' | 'WARNING' | 'CRITICAL'

interface ComplianceBadgeProps {
  status: ComplianceStatus
  className?: string
  showIcon?: boolean
}

export function ComplianceBadge({ status, className, showIcon = true }: ComplianceBadgeProps) {
  const variants: Record<ComplianceStatus, { icon: typeof CheckCircle2; variant: 'default' | 'secondary' | 'destructive'; colors: string }> = {
    GOOD: {
      icon: CheckCircle2,
      variant: 'default',
      colors: 'bg-green-100 text-green-800 border-green-300'
    },
    WARNING: {
      icon: AlertTriangle,
      variant: 'default',
      colors: 'bg-yellow-100 text-yellow-800 border-yellow-300'
    },
    CRITICAL: {
      icon: XCircle,
      variant: 'destructive',
      colors: 'bg-red-100 text-red-800 border-red-300'
    }
  }

  const config = variants[status]
  const Icon = config.icon

  return (
    <Badge
      variant={config.variant}
      className={cn(
        'inline-flex items-center gap-1.5 font-medium border',
        config.colors,
        className
      )}
    >
      {showIcon && <Icon className="h-3 w-3" />}
      <span>{status}</span>
    </Badge>
  )
}






