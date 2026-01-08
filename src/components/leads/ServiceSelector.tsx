'use client'

import { Select } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CANONICAL_SERVICES, SERVICE_DISPLAY_NAMES } from '@/lib/services/normalizeService'

interface ServiceSelectorProps {
  value: string | null | undefined
  onChange: (service: string) => void
  serviceOtherDescription?: string | null
  onOtherDescriptionChange?: (description: string) => void
  className?: string
}

export function ServiceSelector({
  value,
  onChange,
  serviceOtherDescription,
  onOtherDescriptionChange,
  className,
}: ServiceSelectorProps) {
  const isOther = value === 'OTHER' || (!value && serviceOtherDescription)

  const handleServiceChange = (newValue: string) => {
    if (newValue === '') {
      onChange('')
      if (onOtherDescriptionChange) {
        onOtherDescriptionChange('')
      }
    } else {
      onChange(newValue)
      // Clear other description if not OTHER
      if (newValue !== 'OTHER' && onOtherDescriptionChange) {
        onOtherDescriptionChange('')
      }
    }
  }

  return (
    <div className={className}>
      <Select
        value={value || ''}
        onChange={(e) => handleServiceChange(e.target.value)}
        className="w-full"
      >
        <option value="">Not specified</option>
        {CANONICAL_SERVICES.filter(s => s !== 'OTHER').map(service => (
          <option key={service} value={service}>
            {SERVICE_DISPLAY_NAMES[service]}
          </option>
        ))}
        <option value="OTHER">Other</option>
      </Select>
      
      {/* Show other description input only when service is OTHER */}
      {isOther && onOtherDescriptionChange && (
        <div className="mt-2">
          <Label className="text-xs text-muted-foreground mb-1.5 block">
            Please specify
          </Label>
          <Input
            value={serviceOtherDescription || ''}
            onChange={(e) => onOtherDescriptionChange(e.target.value)}
            placeholder="Describe the service..."
            className="w-full"
          />
        </div>
      )}
    </div>
  )
}

