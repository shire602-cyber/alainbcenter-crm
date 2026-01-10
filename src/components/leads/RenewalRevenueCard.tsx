'use client'

/**
 * Renewal Revenue Card
 * 
 * Displays renewal probability, estimated value, and projected revenue
 * with actions to draft renewal messages, create tasks, and mark won/lost
 */

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { 
  DollarSign, 
  Target, 
  Sparkles, 
  CheckCircle, 
  XCircle,
  TrendingUp,
  Edit2
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/ui/toast'

interface RenewalRevenueCardProps {
  leadId: number
  estimatedRenewalValue?: string | null
  renewalProbability?: number | null
  renewalNotes?: string | null
  expiryItems?: Array<{ id: number; type: string; expiryDate: string }>
  onDraftRenewalMessage?: () => void
  onRefresh?: () => void
  className?: string
}

export function RenewalRevenueCard({
  leadId,
  estimatedRenewalValue,
  renewalProbability,
  renewalNotes,
  expiryItems = [],
  onDraftRenewalMessage,
  onRefresh,
  className,
}: RenewalRevenueCardProps) {
  const [editingValue, setEditingValue] = useState(false)
  const [valueInput, setValueInput] = useState(estimatedRenewalValue || '')
  const [showWonModal, setShowWonModal] = useState(false)
  const [showLostModal, setShowLostModal] = useState(false)
  const [lostReason, setLostReason] = useState('')
  const [saving, setSaving] = useState(false)
  const { showToast } = useToast()

  const estimatedValue = estimatedRenewalValue ? parseFloat(estimatedRenewalValue) : null
  const probability = renewalProbability !== null && renewalProbability !== undefined ? renewalProbability : 0
  const projectedRevenue = estimatedValue ? Math.round((estimatedValue * probability) / 100) : null

  const probabilityColor = probability >= 75 ? 'green' : probability >= 40 ? 'amber' : 'red'

  async function handleUpdateValue() {
    try {
      setSaving(true)
      const res = await fetch(`/api/leads/${leadId}/renewal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_value',
          estimatedRenewalValue: valueInput || null,
        }),
      })

      if (res.ok) {
        setEditingValue(false)
        showToast('Renewal value updated', 'success')
        onRefresh?.()
      } else {
        const error = await res.json()
        showToast(`Failed to update value: ${error.error}`, 'error')
      }
    } catch (error) {
      showToast('Error updating value', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleMarkWon() {
    try {
      setSaving(true)
      const res = await fetch(`/api/leads/${leadId}/renewal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'mark_won',
          estimatedRenewalValue: valueInput || estimatedRenewalValue,
        }),
      })

      if (res.ok) {
        setShowWonModal(false)
        showToast('Renewal marked as won', 'success')
        onRefresh?.()
      } else {
        const error = await res.json()
        showToast(`Failed to mark won: ${error.error}`, 'error')
      }
    } catch (error) {
      showToast('Error marking won', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleMarkLost() {
    if (!lostReason.trim()) {
      showToast('Please provide a reason', 'error')
      return
    }

    try {
      setSaving(true)
      const res = await fetch(`/api/leads/${leadId}/renewal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'mark_lost',
          reason: lostReason,
        }),
      })

      if (res.ok) {
        setShowLostModal(false)
        setLostReason('')
        showToast('Renewal marked as lost', 'success')
        onRefresh?.()
      } else {
        const error = await res.json()
        showToast(`Failed to mark lost: ${error.error}`, 'error')
      }
    } catch (error) {
      showToast('Error marking lost', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleCreateRenewalTask() {
    const nearestExpiry = expiryItems?.[0]
    if (!nearestExpiry) {
      showToast('No expiry items found', 'error')
      return
    }

    const expiryDate = new Date(nearestExpiry.expiryDate)
    const daysUntil = Math.ceil((expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    const dueDate = new Date()
    dueDate.setDate(dueDate.getDate() + Math.max(0, daysUntil - 30))

    try {
      const res = await fetch(`/api/leads/${leadId}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `Renewal: ${nearestExpiry.type.replace(/_/g, ' ')}`,
          type: 'RENEWAL_OUTREACH',
          dueAt: dueDate.toISOString(),
          expiryItemId: nearestExpiry.id,
        }),
      })

      if (res.ok) {
        showToast('Renewal task created', 'success')
        onRefresh?.()
      } else {
        const error = await res.json()
        showToast(`Failed to create task: ${error.error}`, 'error')
      }
    } catch (error) {
      showToast('Error creating task', 'error')
    }
  }

  return (
    <>
      <Card className={cn('rounded-2xl glass-soft shadow-sidebar', className)}>
        <CardHeader className="pb-3 sticky top-16 bg-card/95 backdrop-blur z-10">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold text-section-header flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Renewal Revenue
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Estimated Renewal Value */}
          <div>
            <Label className="text-xs text-muted-foreground mb-1">Estimated Renewal Amount</Label>
            {editingValue ? (
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={valueInput}
                  onChange={(e) => setValueInput(e.target.value)}
                  placeholder="0"
                  className="text-lg font-semibold"
                  autoFocus
                />
                <Button
                  size="sm"
                  onClick={handleUpdateValue}
                  disabled={saving}
                >
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setEditingValue(false)
                    setValueInput(estimatedRenewalValue || '')
                  }}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <p className="text-2xl font-bold text-foreground">
                  {estimatedValue
                    ? new Intl.NumberFormat('en-AE', {
                        style: 'currency',
                        currency: 'AED',
                        minimumFractionDigits: 0,
                      }).format(estimatedValue)
                    : 'Not set'}
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditingValue(true)}
                >
                  <Edit2 className="h-3 w-3" />
                </Button>
              </div>
            )}
          </div>

          {/* Renewal Probability */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <Label className="text-xs text-muted-foreground">Renewal Probability</Label>
              <Badge
                variant={probabilityColor === 'green' ? 'default' : probabilityColor === 'amber' ? 'secondary' : 'outline'}
                className={cn(
                  probabilityColor === 'green' && 'bg-green-500',
                  probabilityColor === 'amber' && 'bg-amber-500',
                  probabilityColor === 'red' && 'bg-red-500 text-white'
                )}
              >
                {probability}%
              </Badge>
            </div>
            <div className="w-full bg-muted rounded-full h-2">
              <div
                className={cn(
                  'h-2 rounded-full transition-all duration-500',
                  probabilityColor === 'green' && 'bg-green-500',
                  probabilityColor === 'amber' && 'bg-amber-500',
                  probabilityColor === 'red' && 'bg-red-500'
                )}
                style={{ width: `${probability}%` }}
              />
            </div>
            {renewalNotes && (
              <p className="text-xs text-muted-foreground mt-1">{renewalNotes}</p>
            )}
          </div>

          {/* Projected Revenue */}
          {projectedRevenue && (
            <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="h-4 w-4 text-blue-600" />
                <Label className="text-xs text-muted-foreground">Projected Revenue</Label>
              </div>
              <p className="text-xl font-bold text-blue-700">
                {new Intl.NumberFormat('en-AE', {
                  style: 'currency',
                  currency: 'AED',
                  minimumFractionDigits: 0,
                }).format(projectedRevenue)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {probability}% × {estimatedValue?.toLocaleString()} AED
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-col gap-2 pt-2 border-t">
            <Button
              variant="outline"
              size="sm"
              className="w-full text-xs"
              onClick={onDraftRenewalMessage}
            >
              <Sparkles className="h-3 w-3 mr-1" />
              Draft Renewal WhatsApp
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="w-full text-xs"
              onClick={handleCreateRenewalTask}
            >
              <Target className="h-3 w-3 mr-1" />
              Create Renewal Task
            </Button>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 text-xs text-green-600 hover:text-green-700"
                onClick={() => setShowWonModal(true)}
              >
                <CheckCircle className="h-3 w-3 mr-1" />
                Mark Won
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1 text-xs text-red-600 hover:text-red-700"
                onClick={() => setShowLostModal(true)}
              >
                <XCircle className="h-3 w-3 mr-1" />
                Mark Lost
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Mark Won Modal */}
      <Dialog open={showWonModal} onOpenChange={setShowWonModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark Renewal as Won</DialogTitle>
            <DialogDescription>
              This will mark the renewal as confirmed and update the lead stage to WON.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Estimated Renewal Amount (AED)</Label>
              <Input
                type="number"
                value={valueInput}
                onChange={(e) => setValueInput(e.target.value)}
                placeholder="Enter amount"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowWonModal(false)}>
                Cancel
              </Button>
              <Button onClick={handleMarkWon} disabled={saving}>
                Confirm
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Mark Lost Modal */}
      <Dialog open={showLostModal} onOpenChange={setShowLostModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark Renewal as Lost</DialogTitle>
            <DialogDescription>
              Please provide a reason why this renewal was lost.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Reason *</Label>
              <Textarea
                value={lostReason}
                onChange={(e) => setLostReason(e.target.value)}
                placeholder="e.g., Moved to other provider, No longer in UAE, etc."
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowLostModal(false)}>
                Cancel
              </Button>
              <Button onClick={handleMarkLost} disabled={saving || !lostReason.trim()}>
                Confirm
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}









