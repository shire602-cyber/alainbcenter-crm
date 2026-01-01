'use client'

/**
 * Forecast Card Component
 * Shows deal probability, expected revenue, and reasons
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { TrendingUp, DollarSign, Info, RefreshCw, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface ForecastCardProps {
  leadId: number
  dealProbability: number | null
  expectedRevenueAED: number | null
  forecastReasonJson: string | null
  className?: string
}

export function ForecastCard({
  leadId,
  dealProbability,
  expectedRevenueAED,
  forecastReasonJson,
  className,
}: ForecastCardProps) {
  const [recomputing, setRecomputing] = useState(false)

  const reasons: string[] = forecastReasonJson
    ? (() => {
        try {
          return JSON.parse(forecastReasonJson)
        } catch {
          return []
        }
      })()
    : []

  const getProbabilityColor = (prob: number) => {
    if (prob >= 70) return 'text-green-600 bg-green-50 border-green-200'
    if (prob >= 50) return 'text-yellow-600 bg-yellow-50 border-yellow-200'
    if (prob >= 30) return 'text-orange-600 bg-orange-50 border-orange-200'
    return 'text-red-600 bg-red-50 border-red-200'
  }

  const getProbabilityLabel = (prob: number) => {
    if (prob >= 70) return 'High'
    if (prob >= 50) return 'Medium'
    if (prob >= 30) return 'Low'
    return 'Very Low'
  }

  async function handleRecompute() {
    setRecomputing(true)
    try {
      const res = await fetch(`/api/leads/${leadId}/forecast/recompute`, {
        method: 'POST',
      })
      if (res.ok) {
        // Reload page or trigger parent refresh
        window.location.reload()
      }
    } catch (err) {
      console.error('Failed to recompute forecast:', err)
    } finally {
      setRecomputing(false)
    }
  }

  if (dealProbability === null) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              <span>Deal Forecast</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRecompute}
              disabled={recomputing}
            >
              {recomputing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Forecast not computed yet</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-sm font-medium flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            <span>Deal Forecast</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRecompute}
            disabled={recomputing}
          >
            {recomputing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Probability */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Deal Probability</span>
            <Badge
              variant="outline"
              className={cn('text-sm font-semibold', getProbabilityColor(dealProbability))}
            >
              {dealProbability}% - {getProbabilityLabel(dealProbability)}
            </Badge>
          </div>
          <Progress value={dealProbability} className="h-2" />
        </div>

        {/* Expected Revenue */}
        {expectedRevenueAED !== null && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
            <DollarSign className="h-5 w-5 text-green-600" />
            <div className="flex-1">
              <div className="text-xs text-muted-foreground">Expected Revenue</div>
              <div className="text-lg font-semibold">{expectedRevenueAED.toLocaleString()} AED</div>
            </div>
          </div>
        )}

        {/* Reasons */}
        {reasons.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Info className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">Why this probability?</span>
            </div>
            <div className="space-y-1">
              {reasons.slice(0, 6).map((reason, idx) => (
                <div
                  key={idx}
                  className="text-xs text-muted-foreground p-2 rounded bg-muted/30"
                >
                  • {reason}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

