'use client'

/**
 * Extracted Data Panel with Confidence Flags
 * Shows data extracted from messages with confidence indicators
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CheckCircle2, AlertCircle, HelpCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ExtractedField {
  key: string
  label: string
  value: any
  confidence: 'high' | 'medium' | 'low' | 'unknown'
  source?: string
}

interface ExtractedDataPanelProps {
  dataJson?: string | null
  serviceTypeEnum?: string | null
  nationality?: string | null
  businessActivityRaw?: string | null
  expiryDate?: Date | string | null
}

export function ExtractedDataPanel({ dataJson, serviceTypeEnum, nationality, businessActivityRaw, expiryDate }: ExtractedDataPanelProps) {
  const fields: ExtractedField[] = []

  // Parse dataJson
  let parsedData: any = {}
  if (dataJson) {
    try {
      parsedData = typeof dataJson === 'string' ? JSON.parse(dataJson) : dataJson
    } catch (e) {
      console.warn('Failed to parse dataJson:', e)
    }
  }

  // Service Type
  if (serviceTypeEnum) {
    fields.push({
      key: 'service',
      label: 'Service',
      value: serviceTypeEnum.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      confidence: 'high',
      source: 'Auto-extracted',
    })
  }

  // Nationality
  if (nationality || parsedData.nationality) {
    fields.push({
      key: 'nationality',
      label: 'Nationality',
      value: nationality || parsedData.nationality,
      confidence: parsedData.nationality ? 'high' : 'medium',
      source: 'Auto-extracted',
    })
  }

  // Expiry dates
  if (parsedData.expiries && Array.isArray(parsedData.expiries) && parsedData.expiries.length > 0) {
    parsedData.expiries.forEach((expiry: any, idx: number) => {
      fields.push({
        key: `expiry_${idx}`,
        label: expiry.type || 'Expiry',
        value: expiry.date ? new Date(expiry.date).toLocaleDateString() : expiry.text,
        confidence: expiry.date ? 'high' : 'medium',
        source: 'Auto-extracted',
      })
    })
  }

  // Business setup fields
  if (parsedData.mainland || parsedData.freezone) {
    fields.push({
      key: 'license_type',
      label: 'License Type',
      value: parsedData.mainland ? 'Mainland' : 'Freezone',
      confidence: 'high',
      source: 'Auto-extracted',
    })
  }

  // STEP 4: Show businessActivityRaw if available (immediate display)
  if (businessActivityRaw) {
    fields.push({
      key: 'business_activity_raw',
      label: 'Business Activity',
      value: businessActivityRaw,
      confidence: 'high',
      source: 'Auto-extracted (immediate)',
    })
  } else if (parsedData.business_activity) {
    fields.push({
      key: 'business_activity',
      label: 'Business Activity',
      value: parsedData.business_activity,
      confidence: 'high',
      source: 'Auto-extracted',
    })
  }

  // STEP 4: Show expiryDate if available (immediate display)
  if (expiryDate) {
    const dateStr = typeof expiryDate === 'string' ? expiryDate : expiryDate.toISOString().split('T')[0]
    fields.push({
      key: 'expiry_date',
      label: 'Expiry Date',
      value: new Date(dateStr).toLocaleDateString(),
      confidence: 'high',
      source: 'Auto-extracted (immediate)',
    })
  }

  // Location (for visas)
  if (parsedData.location) {
    fields.push({
      key: 'location',
      label: 'Location',
      value: parsedData.location === 'inside' ? 'Inside UAE' : 'Outside UAE',
      confidence: 'high',
      source: 'Auto-extracted',
    })
  }

  // Counts (partners, visas, etc.)
  if (parsedData.counts) {
    Object.entries(parsedData.counts).forEach(([key, value]) => {
      if (value && typeof value === 'number' && value > 0) {
        fields.push({
          key: `count_${key}`,
          label: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
          value: value,
          confidence: 'high',
          source: 'Auto-extracted',
        })
      }
    })
  }

  if (fields.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Extracted Data</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No data extracted yet</p>
        </CardContent>
      </Card>
    )
  }

  const getConfidenceIcon = (confidence: string) => {
    switch (confidence) {
      case 'high':
        return <CheckCircle2 className="h-4 w-4 text-green-600" />
      case 'medium':
        return <AlertCircle className="h-4 w-4 text-yellow-600" />
      case 'low':
        return <HelpCircle className="h-4 w-4 text-orange-600" />
      default:
        return <HelpCircle className="h-4 w-4 text-gray-400" />
    }
  }

  const getConfidenceBadge = (confidence: string) => {
    switch (confidence) {
      case 'high':
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">High</Badge>
      case 'medium':
        return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">Medium</Badge>
      case 'low':
        return <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">Low</Badge>
      default:
        return <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-200">Unknown</Badge>
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <span>Extracted Data</span>
          <Badge variant="secondary" className="text-xs">
            {fields.length} fields
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {fields.map((field) => (
          <div key={field.key} className="flex items-start justify-between gap-2 p-2 rounded-lg bg-muted/50">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                {getConfidenceIcon(field.confidence)}
                <span className="text-xs font-medium text-muted-foreground">{field.label}</span>
              </div>
              <div className="text-sm font-medium">{String(field.value)}</div>
              {field.source && (
                <div className="text-xs text-muted-foreground mt-1">{field.source}</div>
              )}
            </div>
            <div className="flex-shrink-0">
              {getConfidenceBadge(field.confidence)}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

