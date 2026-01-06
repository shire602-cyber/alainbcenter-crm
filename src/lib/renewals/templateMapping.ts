/**
 * RENEWAL TEMPLATE VARIABLE MAPPING
 * 
 * Single source of truth for mapping renewal data to template variables.
 * All renewal template sends MUST use this function.
 */

import { prisma } from '../prisma'

/**
 * Reminder schedule offsets (days before expiry)
 * R1 = 30 days, R2 = 14 days, R3 = 7 days
 */
export const REMINDER_OFFSETS_DAYS = [30, 14, 7] as const

/**
 * Format date for template variables
 * Format: "06 Jan 2026" (locale-safe, consistent)
 */
function formatExpiryDate(date: Date): string {
  const day = date.getDate().toString().padStart(2, '0')
  const monthNames = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
  ]
  const month = monthNames[date.getMonth()]
  const year = date.getFullYear()
  return `${day} ${month} ${year}`
}

/**
 * Build template variables for renewal reminder
 * 
 * Template variable mapping:
 * - {{1}} = customer_name
 * - {{2}} = service_type (what's expiring)
 * - {{3}} = formatted_expiry_date (e.g., "06 Jan 2026")
 * 
 * @param renewalId - Renewal ID
 * @returns Template variables as array: [name, serviceType, formattedExpiry]
 */
export async function buildRenewalTemplateVars(
  renewalId: number
): Promise<{
  vars: string[] // ["John Doe", "Visa Renewal", "06 Jan 2026"]
  customerName: string
  serviceType: string
  formattedExpiry: string
}> {
  const renewal = await prisma.renewal.findUnique({
    where: { id: renewalId },
    include: {
      contact: true,
    },
  })

  if (!renewal) {
    throw new Error(`Renewal ${renewalId} not found`)
  }

  const customerName = renewal.contact.fullName || 'Valued Customer'
  const serviceType = renewal.serviceType || 'Service'
  const formattedExpiry = formatExpiryDate(renewal.expiryDate)

  return {
    vars: [customerName, serviceType, formattedExpiry],
    customerName,
    serviceType,
    formattedExpiry,
  }
}

