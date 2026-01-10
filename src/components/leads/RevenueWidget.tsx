'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Calendar,
  AlertTriangle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { format, differenceInDays, parseISO } from 'date-fns'

interface RevenueWidgetProps {
  leadId: number
  expiryItems?: Array<{ expiryDate: string; type: string }>
  serviceType?: string
  className?: string
}

export function RevenueWidget({ leadId, expiryItems = [], serviceType, className }: RevenueWidgetProps) {
  // Calculate renewal revenue potential
  const upcomingExpiries = expiryItems.filter((item) => {
    const daysUntilExpiry = differenceInDays(parseISO(item.expiryDate), new Date())
    return daysUntilExpiry >= 0 && daysUntilExpiry <= 90
  })

  // Mock renewal value based on service type
  const getRenewalValue = (type: string) => {
    if (type.includes('BUSINESS')) return 5000
    if (type.includes('VISA')) return 2000
    if (type.includes('EID')) return 500
    return 1000
  }

  const totalRenewalValue = upcomingExpiries.reduce((sum, item) => {
    return sum + getRenewalValue(item.type)
  }, 0)

  // Try to fetch AI-calculated renewal probability from lead
  const [renewalProbability, setRenewalProbability] = useState<number>(0)
  
  useEffect(() => {
    async function fetchRenewalScore() {
      try {
        const res = await fetch(`/api/leads/${leadId}/renewal-score`, {
          method: 'POST',
        })
        if (res.ok) {
          const data = await res.json()
          if (data.score?.probability !== undefined) {
            setRenewalProbability(data.score.probability)
            return
          }
        }
      } catch (err) {
        console.warn('Failed to fetch renewal score:', err)
      }
      // Fallback: calculate heuristically
      setRenewalProbability(upcomingExpiries.length > 0 ? 75 : 0)
    }
    
    if (upcomingExpiries.length > 0) {
      fetchRenewalScore()
    }
  }, [leadId, upcomingExpiries.length])
  
  const projectedRevenue = Math.round((totalRenewalValue * renewalProbability) / 100)

  const nextExpiry = upcomingExpiries.length > 0
    ? upcomingExpiries.sort((a, b) => 
        differenceInDays(parseISO(a.expiryDate), new Date()) - 
        differenceInDays(parseISO(b.expiryDate), new Date())
      )[0]
    : null

  if (!nextExpiry && upcomingExpiries.length === 0) {
    return null
  }

  return (
    <Card className={cn('rounded-2xl shadow-sm border-2 border-blue-200', className)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-green-600" />
          Renewal Revenue
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Projected Revenue */}
        <div>
          <p className="text-xs text-muted-foreground mb-1">Projected Renewal Value</p>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-green-600">
              AED {projectedRevenue.toLocaleString()}
            </span>
            <Badge variant="outline" className="text-xs">
              {renewalProbability}% prob
            </Badge>
          </div>
        </div>

        {/* Renewal Items */}
        {nextExpiry && (
          <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
            <div className="flex items-start gap-2">
              <Calendar className="h-4 w-4 text-blue-600 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-blue-900">
                  Next Renewal
                </p>
                <p className="text-xs text-blue-700 mt-0.5">
                  {nextExpiry.type.replace(/_/g, ' ')} - {format(parseISO(nextExpiry.expiryDate), 'MMM dd, yyyy')}
                </p>
                <p className="text-xs text-blue-600 mt-1 font-medium">
                  AED {getRenewalValue(nextExpiry.type).toLocaleString()} potential
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Churn Risk */}
        {upcomingExpiries.length > 0 && (
          <div className="pt-3 border-t">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Renewal Churn Risk</span>
              <Badge
                variant={renewalProbability >= 70 ? 'default' : renewalProbability >= 50 ? 'secondary' : 'destructive'}
                className="text-xs"
              >
                {renewalProbability >= 70 ? 'Low' : renewalProbability >= 50 ? 'Medium' : 'High'}
              </Badge>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

