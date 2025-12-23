/**
 * Script to apply migration and seed automation rules
 * 
 * Usage:
 *   DATABASE_URL="postgresql://..." npx tsx scripts/apply-migration-and-seed.ts
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('🚀 Starting migration and seeding...\n')

  // Step 1: Apply Migration
  console.log('📦 Step 1: Applying database migration...')
  try {
    // Check if migration is already applied
    const tableInfo = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'Lead' 
      AND column_name IN ('infoSharedAt', 'quotationSentAt', 'lastInfoSharedType')
    `

    const existingColumns = tableInfo.map((row) => row.column_name)
    const allColumnsExist = 
      existingColumns.includes('infoSharedAt') &&
      existingColumns.includes('quotationSentAt') &&
      existingColumns.includes('lastInfoSharedType')

    if (allColumnsExist) {
      console.log('✅ Migration already applied')
    } else {
      // Apply migration
      await prisma.$executeRaw`
        ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "infoSharedAt" TIMESTAMP
      `
      await prisma.$executeRaw`
        ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "quotationSentAt" TIMESTAMP
      `
      await prisma.$executeRaw`
        ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "lastInfoSharedType" TEXT
      `
      await prisma.$executeRaw`
        CREATE INDEX IF NOT EXISTS "Lead_infoSharedAt_idx" ON "Lead"("infoSharedAt")
      `
      console.log('✅ Migration applied successfully')
    }
  } catch (error: any) {
    console.error('❌ Migration error:', error.message)
    throw error
  }

  // Step 2: Seed Info/Quotation Follow-up Rules
  console.log('\n📦 Step 2: Seeding info/quotation follow-up rules...')
  try {
    const existingInfoRules = await prisma.automationRule.findMany({
      where: {
        trigger: 'INFO_SHARED',
        name: {
          in: [
            'Follow-up 2 days after info shared',
            'Follow-up 3 days after quotation',
            'Follow-up 1 day after document',
          ],
        },
      },
    })

    if (existingInfoRules.length >= 3) {
      console.log('✅ Info follow-up rules already seeded')
    } else {
      const rules = [
        {
          name: 'Follow-up 2 days after info shared',
          trigger: 'INFO_SHARED',
          conditions: JSON.stringify({ daysAfter: 2, infoType: 'details' }),
          actions: JSON.stringify([{ type: 'SEND_AI_REPLY', channel: 'whatsapp' }]),
          isActive: true,
          enabled: true,
        },
        {
          name: 'Follow-up 3 days after quotation',
          trigger: 'INFO_SHARED',
          conditions: JSON.stringify({ daysAfter: 3, infoType: 'quotation' }),
          actions: JSON.stringify([{ type: 'SEND_AI_REPLY', channel: 'whatsapp' }]),
          isActive: true,
          enabled: true,
        },
        {
          name: 'Follow-up 1 day after document',
          trigger: 'INFO_SHARED',
          conditions: JSON.stringify({ daysAfter: 1, infoType: 'document' }),
          actions: JSON.stringify([{ type: 'SEND_AI_REPLY', channel: 'whatsapp' }]),
          isActive: true,
          enabled: true,
        },
      ]

      for (const rule of rules) {
        await prisma.automationRule.upsert({
          where: {
            name: rule.name,
          },
          create: rule,
          update: rule,
        })
      }
      console.log('✅ Info follow-up rules seeded successfully')
    }
  } catch (error: any) {
    console.error('❌ Error seeding info follow-up rules:', error.message)
    throw error
  }

  // Step 3: Seed Escalation Rules
  console.log('\n📦 Step 3: Seeding escalation rules...')
  try {
    const existingEscalationRules = await prisma.automationRule.findMany({
      where: {
        trigger: {
          in: ['NO_REPLY_SLA', 'FOLLOWUP_OVERDUE'],
        },
        name: {
          in: [
            'SLA Breach - Create Agent Task',
            'Overdue Follow-up - Create Agent Task',
            'Stale Lead - Create Agent Task',
          ],
        },
      },
    })

    if (existingEscalationRules.length >= 3) {
      console.log('✅ Escalation rules already seeded')
    } else {
      const rules = [
        {
          name: 'SLA Breach - Create Agent Task',
          trigger: 'NO_REPLY_SLA',
          conditions: JSON.stringify({ slaMinutes: 15, escalateAfterMinutes: 60 }),
          actions: JSON.stringify([{ type: 'CREATE_AGENT_TASK', reason: 'sla_breach' }]),
          isActive: true,
          enabled: true,
        },
        {
          name: 'Overdue Follow-up - Create Agent Task',
          trigger: 'FOLLOWUP_OVERDUE',
          conditions: JSON.stringify({ hoursOverdue: 24 }),
          actions: JSON.stringify([{ type: 'CREATE_AGENT_TASK', reason: 'overdue_followup' }]),
          isActive: true,
          enabled: true,
        },
        {
          name: 'Stale Lead - Create Agent Task',
          trigger: 'NO_ACTIVITY',
          conditions: JSON.stringify({ daysInactive: 7 }),
          actions: JSON.stringify([{ type: 'CREATE_AGENT_TASK', reason: 'stale_lead' }]),
          isActive: true,
          enabled: true,
        },
      ]

      for (const rule of rules) {
        await prisma.automationRule.upsert({
          where: {
            name: rule.name,
          },
          create: rule,
          update: rule,
        })
      }
      console.log('✅ Escalation rules seeded successfully')
    }
  } catch (error: any) {
    console.error('❌ Error seeding escalation rules:', error.message)
    throw error
  }

  console.log('\n🎉 Migration and seeding complete!')
}

main()
  .catch((error) => {
    console.error('❌ Fatal error:', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
