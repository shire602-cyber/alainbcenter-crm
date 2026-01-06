/**
 * Populate Renewal table from existing ExpiryItem data
 * 
 * One-time migration script to create Renewal records from ExpiryItem
 * Run this after the Renewal table is created
 */

import { prisma } from '@/lib/prisma'
import { parseReminderSchedule, calculateNextReminderAt } from './service'

export interface PopulateOptions {
  dryRun?: boolean
  limit?: number
  serviceTypeFilter?: string[]
}

/**
 * Populate Renewal table from ExpiryItem records
 */
export async function populateRenewalsFromExpiryItems(
  options: PopulateOptions = {}
): Promise<{
  processed: number
  created: number
  skipped: number
  errors: string[]
}> {
  const { dryRun = false, limit = 1000, serviceTypeFilter } = options

  const results = {
    processed: 0,
    created: 0,
    skipped: 0,
    errors: [] as string[],
  }

  console.log(`[RENEWAL-POPULATE] Starting population from ExpiryItem (dryRun=${dryRun}, limit=${limit})`)

  // Build where clause
  const whereClause: any = {
    expiryDate: {
      gt: new Date(), // Only future expiries
    },
    // Include all expiry items, not just those with reminders enabled
    // We'll respect remindersEnabled when creating the renewal
  }

  // Filter by service type if provided
  if (serviceTypeFilter && serviceTypeFilter.length > 0) {
    whereClause.type = {
      in: serviceTypeFilter,
    }
  }

  // Find expiry items that should become renewals
  const expiryItems = await prisma.expiryItem.findMany({
    where: whereClause,
    include: {
      contact: {
        select: {
          id: true,
          fullName: true,
          phone: true,
        },
      },
      lead: {
        select: {
          id: true,
        },
      },
    },
    take: limit,
    orderBy: {
      expiryDate: 'asc',
    },
  })

  console.log(`[RENEWAL-POPULATE] Found ${expiryItems.length} expiry items to process`)

  for (const expiryItem of expiryItems) {
    results.processed++

    try {
      // Check if renewal already exists for this expiry item
      const existingRenewal = await prisma.renewal.findFirst({
        where: {
          contactId: expiryItem.contactId,
          expiryDate: expiryItem.expiryDate,
          serviceType: expiryItem.type,
        },
      })

      if (existingRenewal) {
        console.log(`[RENEWAL-POPULATE] Skipping expiry item ${expiryItem.id} - renewal already exists (${existingRenewal.id})`)
        results.skipped++
        continue
      }

      // Map expiry type to service type
      const serviceType = mapExpiryTypeToServiceType(expiryItem.type)

      // Parse reminder schedule
      const reminderSchedule = parseReminderSchedule(expiryItem.reminderScheduleDays || '[30,14,7,1]')

      // Calculate next reminder date
      const nextReminderAt = calculateNextReminderAt(
        expiryItem.expiryDate,
        reminderSchedule,
        expiryItem.lastReminderSentAt
      )

      if (dryRun) {
        console.log(`[RENEWAL-POPULATE] DRY RUN - Would create renewal for expiry item ${expiryItem.id}`)
        console.log(`  Contact: ${expiryItem.contact.fullName} (${expiryItem.contact.phone})`)
        console.log(`  Service: ${serviceType}`)
        console.log(`  Expiry: ${expiryItem.expiryDate.toISOString()}`)
        console.log(`  Next Reminder: ${nextReminderAt?.toISOString() || 'None'}`)
        results.created++
        continue
      }

      // Create renewal
      const renewal = await prisma.renewal.create({
        data: {
          contactId: expiryItem.contactId,
          leadId: expiryItem.leadId,
          serviceType,
          expiryDate: expiryItem.expiryDate,
          status: 'PENDING',
          lastNotifiedAt: expiryItem.lastReminderSentAt,
          nextReminderAt,
          reminderSchedule: JSON.stringify(reminderSchedule),
          remindersEnabled: expiryItem.remindersEnabled,
        },
      })

      console.log(`✅ [RENEWAL-POPULATE] Created renewal ${renewal.id} from expiry item ${expiryItem.id}`)
      results.created++
    } catch (error: any) {
      const errorMsg = `Expiry item ${expiryItem.id}: ${error.message || 'Unknown error'}`
      results.errors.push(errorMsg)
      console.error(`❌ [RENEWAL-POPULATE] ${errorMsg}`, error)
    }
  }

  console.log(`[RENEWAL-POPULATE] Completed: ${results.created} created, ${results.skipped} skipped, ${results.errors.length} errors`)
  return results
}

/**
 * Map ExpiryItem type to Renewal serviceType
 */
function mapExpiryTypeToServiceType(expiryType: string): string {
  // Map expiry types to service types
  const typeMap: Record<string, string> = {
    'VISA_EXPIRY': 'VISA_RENEWAL',
    'EMIRATES_ID_EXPIRY': 'EMIRATES_ID_RENEWAL',
    'PASSPORT_EXPIRY': 'PASSPORT_RENEWAL',
    'TRADE_LICENSE_EXPIRY': 'TRADE_LICENSE_RENEWAL',
    'ESTABLISHMENT_CARD_EXPIRY': 'ESTABLISHMENT_CARD_RENEWAL',
    'INSURANCE_EXPIRY': 'INSURANCE_RENEWAL',
    'MEDICAL_FITNESS_EXPIRY': 'MEDICAL_RENEWAL',
  }

  // Try exact match
  if (typeMap[expiryType]) {
    return typeMap[expiryType]
  }

  // Try case-insensitive match
  const upperType = expiryType.toUpperCase()
  for (const [key, value] of Object.entries(typeMap)) {
    if (key.toUpperCase() === upperType) {
      return value
    }
  }

  // Default: use the expiry type as-is with _RENEWAL suffix
  return expiryType.replace(/_EXPIRY$/, '_RENEWAL') || 'RENEWAL'
}

