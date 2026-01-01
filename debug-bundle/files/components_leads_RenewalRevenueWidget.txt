'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Calendar, Target, DollarSign, Sparkles } from 'lucide-react'
import { format, differenceInDays, parseISO } from 'date-fns'
import { cn } from '@/lib/utils'

interface RenewalRevenueWidgetProps {
  expiryDate: string
  estimatedValue?: string | null
  aiScore?: number | null
  onCreateTask?: () => void
  onDraftMessage?: () => void
  className?: string
}

export function RenewalRevenueWidget({
  expiryDate,
  estimatedValue,
  aiScore,
  onCreateTask,
  onDraftMessage,
  className,
}: RenewalRevenueWidgetProps) {
  const daysToExpiry = differenceInDays(parseISO(expiryDate), new Date())
  const estimatedAmount = estimatedValue ? parseFloat(estimatedValue) : null
  const probability = aiScore != null ? aiScore / 100 : 0.5
  const projectedRevenue = estimatedAmount ? estimatedAmount * probability : null

  return (
    <Card className={cn('rounded-xl shadow-sm border-2 border-blue-200 dark:border-blue-800', className)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
          <DollarSign className="h-4 w-4" />
          Renewal Revenue
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {estimatedAmount ? (
          <div>
            <p className="text-xs text-muted-foreground mb-1">Estimated Renewal</p>
            <p className="text-2xl font-bold text-foreground">
              {new Intl.NumberFormat('en-AE', { style: 'currency', currency: 'AED', minimumFractionDigits: 0 }).format(estimatedAmount)}
            </p>
          </div>
        ) : (
          <div>
            <p className="text-xs text-muted-foreground mb-1">Estimated Renewal</p>
            <p className="text-sm text-muted-foreground">Not set</p>
          </div>
        )}
        <div>
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-muted-foreground">AI Probability</p>
            <Badge variant={probability >= 0.7 ? 'default' : probability >= 0.4 ? 'secondary' : 'outline'}>
              {Math.round(probability * 100)}%
            </Badge>
          </div>
          <div className="w-full bg-muted rounded-full h-2">
            <div
              className={cn('h-2 rounded-full transition-all duration-500', probability >= 0.7 ? 'bg-green-500' : probability >= 0.4 ? 'bg-amber-500' : 'bg-red-500')}
              style={{ width: `${probability * 100}%` }}
            />
          </div>
        </div>
        {projectedRevenue && (
          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <p className="text-xs text-muted-foreground mb-1">Projected Revenue</p>
            <p className="text-xl font-bold text-blue-700 dark:text-blue-300">
              {new Intl.NumberFormat('en-AE', { style: 'currency', currency: 'AED', minimumFractionDigits: 0 }).format(projectedRevenue)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {Math.round(probability * 100)}% × {estimatedAmount?.toLocaleString()} AED
            </p>
          </div>
        )}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Calendar className="h-3 w-3" />
          <span>Expires {format(parseISO(expiryDate), 'MMM dd, yyyy')} ({daysToExpiry}d)</span>
        </div>
        <div className="flex gap-2 pt-2 border-t">
          <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={onCreateTask}>
            <Target className="h-3 w-3 mr-1" />
            Create Task
          </Button>
          <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={onDraftMessage}>
            <Sparkles className="h-3 w-3 mr-1" />
            Draft Message
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}