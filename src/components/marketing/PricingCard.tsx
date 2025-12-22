/**
 * Pricing Card Component
 * For showcasing pricing tiers
 */

'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import Link from 'next/link'

interface PricingFeature {
  text: string
  included: boolean
}

interface PricingCardProps {
  name: string
  price: string
  period?: string
  description: string
  features: PricingFeature[]
  ctaText: string
  ctaLink: string
  popular?: boolean
  className?: string
}

export function PricingCard({
  name,
  price,
  period = '/month',
  description,
  features,
  ctaText,
  ctaLink,
  popular = false,
  className,
}: PricingCardProps) {
  return (
    <Card
      className={cn(
        'relative transition-all hover:shadow-xl',
        popular && 'ring-2 ring-blue-500 shadow-lg',
        className
      )}
    >
      {popular && (
        <div className="absolute -top-4 left-1/2 -translate-x-1/2">
          <Badge className="bg-blue-600 text-white px-4 py-1">Most Popular</Badge>
        </div>
      )}
      <CardHeader className={cn('text-center', popular && 'pt-8')}>
        <CardTitle className="text-2xl mb-2">{name}</CardTitle>
        <div className="flex items-baseline justify-center gap-2 mb-4">
          <span className="text-5xl font-bold">{price}</span>
          <span className="text-gray-600 dark:text-gray-400">{period}</span>
        </div>
        <CardDescription className="text-base">{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <ul className="space-y-3">
          {features.map((feature, idx) => (
            <li key={idx} className="flex items-start gap-3">
              {feature.included ? (
                <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
              ) : (
                <div className="h-5 w-5 rounded-full border-2 border-gray-300 dark:border-gray-600 flex-shrink-0 mt-0.5" />
              )}
              <span className={cn('text-sm', !feature.included && 'text-gray-400 dark:text-gray-600')}>
                {feature.text}
              </span>
            </li>
          ))}
        </ul>
        <Link href={ctaLink} className="block">
          <Button
            className={cn('w-full', popular && 'bg-blue-600 hover:bg-blue-700')}
            variant={popular ? 'default' : 'outline'}
            size="lg"
          >
            {ctaText}
          </Button>
        </Link>
      </CardContent>
    </Card>
  )
}












