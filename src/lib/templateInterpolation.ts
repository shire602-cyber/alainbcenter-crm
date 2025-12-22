/**
 * Template Interpolation Helper
 * 
 * Replaces tokens in message templates with actual lead/contact data
 */

import { Lead, Contact, ExpiryItem, ServiceType } from '@prisma/client'
import { format } from 'date-fns'

export interface InterpolationContext {
  lead: Lead & {
    contact?: Contact
    serviceType?: ServiceType | null
    expiryItems?: ExpiryItem[]
  }
  contact?: Contact
}

/**
 * Interpolate template string with lead/contact data
 * 
 * Supported tokens:
 * - {name} - Contact full name
 * - {phone} - Contact phone
 * - {email} - Contact email
 * - {service} - Service type name
 * - {expiry_date} - Nearest expiry date
 * - {expiry_days} - Days until nearest expiry
 * - {company} - Company name
 * - {sponsor} - Sponsor name
 * - {nationality} - Contact nationality
 */
export function interpolateTemplate(
  template: string,
  context: InterpolationContext
): string {
  const { lead, contact } = context
  const actualContact = contact || lead.contact

  if (!actualContact) {
    return template
  }

  // Find nearest expiry
  let nearestExpiry: ExpiryItem | null = null
  if (lead.expiryItems && lead.expiryItems.length > 0) {
    const now = new Date()
    const upcoming = lead.expiryItems
      .filter((e) => new Date(e.expiryDate) >= now)
      .sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime())
    
    nearestExpiry = upcoming[0] || null
  }

  // Calculate days until expiry
  const expiryDays = nearestExpiry
    ? Math.ceil((new Date(nearestExpiry.expiryDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
    : null

  // Replacement map
  const replacements: Record<string, string> = {
    name: actualContact.fullName || 'there',
    phone: actualContact.phone || '',
    email: actualContact.email || '',
    service: lead.serviceType?.name || lead.serviceTypeEnum || 'service',
    expiry_date: nearestExpiry
      ? format(new Date(nearestExpiry.expiryDate), 'MMMM dd, yyyy')
      : '',
    expiry_days: expiryDays !== null ? expiryDays.toString() : '',
    company: actualContact.companyName || '',
    sponsor: actualContact.localSponsorName || '',
    nationality: actualContact.nationality || '',
  }

  // Replace tokens (case-insensitive)
  let result = template
  for (const [key, value] of Object.entries(replacements)) {
    const regex = new RegExp(`\\{${key}\\}`, 'gi')
    result = result.replace(regex, value)
  }

  return result
}

















