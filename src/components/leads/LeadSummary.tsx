'use client'

/**
 * Lead Summary Component
 * Auto-generated summary of the lead with key information
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Sparkles, Loader2, RefreshCw, AlertCircle } from 'lucide-react'
import { useState, useEffect } from 'react'
import { format, differenceInDays, parseISO } from 'date-fns'

interface LeadSummaryProps {
  leadId: number
  lead: {
    contact?: {
      fullName?: string
      phone?: string
      email?: string
      nationality?: string
    }
    serviceType?: {
      name?: string
    }
    stage?: string
    pipelineStage?: string
    aiScore?: number
    createdAt: string
    messages?: any[]
    tasks?: any[]
    expiryItems?: any[]
    nextFollowUpAt?: string | null
  }
  className?: string
}

export function LeadSummary({ leadId, lead, className }: LeadSummaryProps) {
  const [summary, setSummary] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadSummary()
  }, [leadId])

  async function loadSummary() {
    try {
      setLoading(true)
      setError(null)
      
      const res = await fetch(`/api/leads/${leadId}/ai/summary`, {
        method: 'POST',
      })
      
      if (res.ok) {
        const data = await res.json()
        setSummary(data.summary || null)
      } else {
        setError('Failed to load summary')
      }
    } catch (err: any) {
      console.error('Failed to load summary:', err)
      setError(err.message || 'Failed to load summary')
    } finally {
      setLoading(false)
    }
  }

  // Fallback summary if AI summary not available
  const fallbackSummary = `
**Service:** ${lead.serviceType?.name || 'Not specified'}
**Stage:** ${lead.stage || lead.pipelineStage || 'New'}
**AI Score:** ${lead.aiScore || 'N/A'}/100

**Contact Information:**
- Phone: ${lead.contact?.phone || 'N/A'}
- Email: ${lead.contact?.email || 'N/A'}
- Nationality: ${lead.contact?.nationality || 'Not specified'}

**Activity:**
- ${lead.messages?.length || 0} messages exchanged
- ${lead.tasks?.filter((t: any) => t.status === 'OPEN').length || 0} open tasks
- ${lead.expiryItems?.length || 0} tracked expiry items

**Next Steps:**
${lead.nextFollowUpAt ? `- Follow-up scheduled for ${format(parseISO(lead.nextFollowUpAt), 'MMM dd, yyyy')}` : '- No follow-up scheduled'}
${lead.tasks && lead.tasks.filter((t: any) => t.status === 'OPEN').length > 0 ? `- ${lead.tasks.filter((t: any) => t.status === 'OPEN').length} pending tasks` : ''}
${lead.expiryItems && lead.expiryItems.length > 0 ? `- ${lead.expiryItems.length} expiry items to monitor` : ''}
  `.trim()

  const displaySummary = summary || fallbackSummary

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            Lead Summary
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={loadSummary}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {error ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <AlertCircle className="h-4 w-4 text-red-600" />
            <span>{error}</span>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed">
            {displaySummary}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

