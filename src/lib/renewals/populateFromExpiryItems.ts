/**
 * Populate Renewal table from existing ExpiryItem data
 * 
 * One-time migration script to create Renewal records from ExpiryItem
 * Run this after the Renewal table is created
 */

import { prisma } from '@/lib/prisma'

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
      // New Renewal model: only has leadId, type (enum), expiryDate
      if (!expiryItem.leadId) {
        results.skipped++
        continue
      }

      const existingRenewal = await prisma.renewal.findFirst({
        where: {
          leadId: expiryItem.leadId,
          expiryDate: expiryItem.expiryDate,
          type: mapExpiryTypeToRenewalType(expiryItem.type),
        },
      })

      if (existingRenewal) {
        console.log(`[RENEWAL-POPULATE] Skipping expiry item ${expiryItem.id} - renewal already exists (${existingRenewal.id})`)
        results.skipped++
        continue
      }

      // Map expiry type to RenewalType enum
      const renewalType = mapExpiryTypeToRenewalType(expiryItem.type)

      // Map renewalStatus to RenewalStatus enum
      const statusMap: Record<string, 'ACTIVE' | 'CONTACTED' | 'IN_PROGRESS' | 'RENEWED' | 'EXPIRED' | 'LOST'> = {
        'NOT_STARTED': 'ACTIVE',
        'IN_PROGRESS': 'IN_PROGRESS',
        'RENEWED': 'RENEWED',
        'NOT_RENEWING': 'LOST',
      }
      const renewalStatus = statusMap[expiryItem.renewalStatus] || 'ACTIVE'

      if (dryRun) {
        console.log(`[RENEWAL-POPULATE] DRY RUN - Would create renewal for expiry item ${expiryItem.id}`)
        console.log(`  Lead: ${expiryItem.lead?.id || 'None'}`)
        console.log(`  Type: ${renewalType}`)
        console.log(`  Expiry: ${expiryItem.expiryDate.toISOString()}`)
        console.log(`  Status: ${renewalStatus}`)
        results.created++
        continue
      }

      // Create renewal with new model structure
      const renewal = await prisma.renewal.create({
        data: {
          leadId: expiryItem.leadId!,
          type: renewalType,
          expiryDate: expiryItem.expiryDate,
          status: renewalStatus,
          assignedUserId: expiryItem.assignedUserId || undefined,
          lastContactedAt: expiryItem.lastReminderSentAt || undefined,
          notes: expiryItem.notes || undefined,
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
 * Map ExpiryItem type to RenewalType enum
 */
function mapExpiryTypeToRenewalType(expiryType: string): 'TRADE_LICENSE' | 'EMIRATES_ID' | 'RESIDENCY' | 'VISIT_VISA' {
  const typeMap: Record<string, 'TRADE_LICENSE' | 'EMIRATES_ID' | 'RESIDENCY' | 'VISIT_VISA'> = {
    'TRADE_LICENSE_EXPIRY': 'TRADE_LICENSE',
    'ESTABLISHMENT_CARD_EXPIRY': 'TRADE_LICENSE',
    'EMIRATES_ID_EXPIRY': 'EMIRATES_ID',
    'VISA_EXPIRY': 'RESIDENCY',
    'RESIDENCY_EXPIRY': 'RESIDENCY',
    'VISIT_VISA_EXPIRY': 'VISIT_VISA',
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

  // Default: assume trade license
  return 'TRADE_LICENSE'
}

