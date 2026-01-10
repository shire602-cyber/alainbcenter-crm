/**
 * Reusable Feature Card Component
 * For marketing pages and feature showcases
 */

'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface FeatureCardProps {
  icon: LucideIcon
  title: string
  description: string
  color?: string
  bgColor?: string
  className?: string
}

export function FeatureCard({
  icon: Icon,
  title,
  description,
  color = 'text-blue-600',
  bgColor = 'bg-blue-50',
  className,
}: FeatureCardProps) {
  return (
    <Card className={cn('transition-all hover:shadow-lg', className)}>
      <CardHeader>
        <div className={cn('w-12 h-12 rounded-lg flex items-center justify-center mb-4', bgColor)}>
          <Icon className={cn('h-6 w-6', color)} />
        </div>
        <CardTitle className="text-xl">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <CardDescription className="text-base">{description}</CardDescription>
      </CardContent>
    </Card>
  )
}












