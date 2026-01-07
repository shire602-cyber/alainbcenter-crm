/**
 * Migration utilities for existing renewal logic to new Renewal model
 * Migrates data from ExpiryItem and other sources to the new first-class Renewal model
 */

import { prisma } from '@/lib/prisma'

/**
 * Migrate ExpiryItem to Renewal
 * Creates Renewal records from existing ExpiryItems that have renewal status
 */
export async function migrateExpiryItemsToRenewals() {
  console.log('🔄 Starting migration of ExpiryItems to Renewals...')

  // Find all ExpiryItems that are linked to leads and have renewal status
  const expiryItems = await prisma.expiryItem.findMany({
    where: {
      leadId: { not: null },
      renewalStatus: { not: 'NOT_RENEWING' },
    },
    include: {
      lead: {
        select: { id: true },
      },
    },
  })

  console.log(`Found ${expiryItems.length} expiry items to migrate`)

  let migrated = 0
  let skipped = 0
  const errors: string[] = []

  for (const item of expiryItems) {
    try {
      if (!item.leadId || !item.lead) {
        skipped++
        continue
      }

      // Map ExpiryItem type to RenewalType
      const typeMap: Record<string, 'TRADE_LICENSE' | 'EMIRATES_ID' | 'RESIDENCY' | 'VISIT_VISA'> = {
        'TRADE_LICENSE_EXPIRY': 'TRADE_LICENSE',
        'EMIRATES_ID_EXPIRY': 'EMIRATES_ID',
        'VISA_EXPIRY': 'RESIDENCY',
        'RESIDENCY_EXPIRY': 'RESIDENCY',
        'VISIT_VISA_EXPIRY': 'VISIT_VISA',
      }

      const renewalType = typeMap[item.type] || 'TRADE_LICENSE' // Default fallback

      // Map renewalStatus to RenewalStatus
      const statusMap: Record<string, 'ACTIVE' | 'CONTACTED' | 'IN_PROGRESS' | 'RENEWED' | 'EXPIRED' | 'LOST'> = {
        'NOT_STARTED': 'ACTIVE',
        'IN_PROGRESS': 'IN_PROGRESS',
        'RENEWED': 'RENEWED',
        'NOT_RENEWING': 'LOST',
      }

      const renewalStatus = statusMap[item.renewalStatus] || 'ACTIVE'

      // Check if renewal already exists for this lead + type + expiryDate
      const existing = await prisma.renewal.findFirst({
        where: {
          leadId: item.leadId,
          type: renewalType,
          expiryDate: item.expiryDate,
        },
      })

      if (existing) {
        skipped++
        continue
      }

      // Create new Renewal
      await prisma.renewal.create({
        data: {
          leadId: item.leadId,
          type: renewalType,
          expiryDate: item.expiryDate,
          status: renewalStatus,
          assignedUserId: item.assignedUserId,
          lastContactedAt: item.lastReminderSentAt,
          notes: item.notes,
        },
      })

      migrated++
    } catch (error: any) {
      errors.push(`Failed to migrate ExpiryItem ${item.id}: ${error.message}`)
      console.error(`Error migrating ExpiryItem ${item.id}:`, error)
    }
  }

  console.log(`✅ Migration complete: ${migrated} migrated, ${skipped} skipped, ${errors.length} errors`)

  if (errors.length > 0) {
    console.error('Migration errors:', errors)
  }

  return {
    migrated,
    skipped,
    errors,
  }
}

/**
 * Migrate RenewalItem (from Phase B) to Renewal
 * If both systems exist, migrate RenewalItem data to Renewal
 */
export async function migrateRenewalItemsToRenewals() {
  console.log('🔄 Starting migration of RenewalItems to Renewals...')

  try {
    // Check if RenewalItem model exists
    const renewalItems = await prisma.renewalItem.findMany({
      include: {
        lead: {
          select: { id: true },
        },
      },
    })

    if (renewalItems.length === 0) {
      console.log('No RenewalItems found to migrate')
      return { migrated: 0, skipped: 0, errors: [] }
    }

    console.log(`Found ${renewalItems.length} renewal items to migrate`)

    let migrated = 0
    let skipped = 0
    const errors: string[] = []

    for (const item of renewalItems) {
      try {
        // Map RenewalServiceType to RenewalType
        const typeMap: Record<string, 'TRADE_LICENSE' | 'EMIRATES_ID' | 'RESIDENCY' | 'VISIT_VISA'> = {
          'TRADE_LICENSE': 'TRADE_LICENSE',
          'EMIRATES_ID': 'EMIRATES_ID',
          'RESIDENCY': 'RESIDENCY',
          'VISIT_VISA': 'VISIT_VISA',
        }

        const renewalType = typeMap[item.serviceType] || 'TRADE_LICENSE'

        // Map RenewalStatus to RenewalStatus (same enum names, but different values)
        const statusMap: Record<string, 'ACTIVE' | 'CONTACTED' | 'IN_PROGRESS' | 'RENEWED' | 'EXPIRED' | 'LOST'> = {
          'UPCOMING': 'ACTIVE',
          'ACTION_REQUIRED': 'ACTIVE',
          'URGENT': 'ACTIVE',
          'CONTACTED': 'CONTACTED',
          'QUOTED': 'IN_PROGRESS',
          'IN_PROGRESS': 'IN_PROGRESS',
          'RENEWED': 'RENEWED',
          'EXPIRED': 'EXPIRED',
          'LOST': 'LOST',
        }

        const renewalStatus = statusMap[item.status] || 'ACTIVE'

        // Check if renewal already exists
        const existing = await prisma.renewal.findFirst({
          where: {
            leadId: item.leadId,
            type: renewalType,
            expiryDate: item.expiresAt,
          },
        })

        if (existing) {
          skipped++
          continue
        }

        // Create new Renewal
        await prisma.renewal.create({
          data: {
            leadId: item.leadId,
            type: renewalType,
            expiryDate: item.expiresAt,
            status: renewalStatus,
            estimatedValue: item.expectedValue,
            assignedUserId: item.assignedToUserId,
            lastContactedAt: item.lastContactedAt,
            nextFollowUpAt: item.nextActionAt,
            notes: item.notes,
          },
        })

        migrated++
      } catch (error: any) {
        errors.push(`Failed to migrate RenewalItem ${item.id}: ${error.message}`)
        console.error(`Error migrating RenewalItem ${item.id}:`, error)
      }
    }

    console.log(`✅ Migration complete: ${migrated} migrated, ${skipped} skipped, ${errors.length} errors`)

    return {
      migrated,
      skipped,
      errors,
    }
  } catch (error: any) {
    // RenewalItem model might not exist yet
    console.log('RenewalItem model not found, skipping migration')
    return { migrated: 0, skipped: 0, errors: [] }
  }
}

