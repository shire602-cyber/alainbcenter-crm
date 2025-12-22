/**
 * Seed Renewal Automation Rules
 * 
 * Creates default automation rules for renewal reminders (90D, 30D, overdue)
 * Run with: npx tsx src/scripts/seed-renewal-automation-rules.ts
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const defaultRules = [
  {
    key: 'renewal_90d_soft_reminder',
    name: 'Visa/EID/License Renewal – 90D Soft Reminder',
    trigger: 'EXPIRY_WINDOW',
    conditions: {
      expiryType: ['VISA_EXPIRY', 'EMIRATES_ID_EXPIRY', 'TRADE_LICENSE_EXPIRY', 'ESTABLISHMENT_CARD_EXPIRY'],
      daysBefore: 90,
    },
    actions: [
      {
        type: 'SEND_AI_REPLY',
        channel: 'WHATSAPP',
        mode: 'RENEWAL',
      },
      {
        type: 'CREATE_TASK',
        title: 'Renewal outreach - 90 days',
        type: 'RENEWAL_OUTREACH',
        daysFromNow: 0,
      },
      {
        type: 'SET_NEXT_FOLLOWUP',
        daysFromNow: 7,
      },
    ],
    isActive: true,
    enabled: true,
  },
  {
    key: 'renewal_30d_strong_reminder',
    name: 'Visa/EID/License Renewal – 30D Strong Reminder',
    trigger: 'EXPIRY_WINDOW',
    conditions: {
      expiryType: ['VISA_EXPIRY', 'EMIRATES_ID_EXPIRY', 'TRADE_LICENSE_EXPIRY', 'ESTABLISHMENT_CARD_EXPIRY'],
      daysBefore: 30,
    },
    actions: [
      {
        type: 'SEND_AI_REPLY',
        channel: 'WHATSAPP',
        mode: 'RENEWAL',
      },
      {
        type: 'CREATE_TASK',
        title: 'Renewal outreach - 30 days (urgent)',
        type: 'RENEWAL_OUTREACH',
        daysFromNow: 0,
      },
      {
        type: 'SET_NEXT_FOLLOWUP',
        daysFromNow: 3,
      },
    ],
    isActive: true,
    enabled: true,
  },
  {
    key: 'renewal_overdue_escalation',
    name: 'Overdue Renewal – Escalation',
    trigger: 'EXPIRY_WINDOW',
    conditions: {
      expiryType: ['VISA_EXPIRY', 'EMIRATES_ID_EXPIRY', 'TRADE_LICENSE_EXPIRY', 'ESTABLISHMENT_CARD_EXPIRY'],
      daysBefore: -1, // Expired
    },
    actions: [
      {
        type: 'SEND_AI_REPLY',
        channel: 'WHATSAPP',
        mode: 'RENEWAL',
      },
      {
        type: 'CREATE_TASK',
        title: 'Overdue renewal - Manager review needed',
        type: 'RENEWAL_INTERNAL',
        daysFromNow: 0,
      },
      {
        type: 'SET_PRIORITY',
        priority: 'URGENT',
      },
    ],
    isActive: true,
    enabled: true,
  },
]

async function seedRules() {
  console.log('🌱 Seeding renewal automation rules...')

  for (const ruleData of defaultRules) {
    try {
      // Check if rule already exists
      const existing = await prisma.automationRule.findUnique({
        where: { key: ruleData.key },
      })

      if (existing) {
        console.log(`⏭️  Rule "${ruleData.name}" already exists, skipping...`)
        continue
      }

      // Create rule
      const rule = await prisma.automationRule.create({
        data: {
          key: ruleData.key,
          name: ruleData.name,
          trigger: ruleData.trigger,
          conditions: JSON.stringify(ruleData.conditions),
          actions: JSON.stringify(ruleData.actions),
          isActive: ruleData.isActive,
          enabled: ruleData.enabled,
        },
      })

      console.log(`✅ Created rule: "${ruleData.name}" (ID: ${rule.id})`)
    } catch (error: any) {
      console.error(`❌ Failed to create rule "${ruleData.name}":`, error.message)
    }
  }

  console.log('✨ Seeding complete!')
}

// Run if called directly
if (require.main === module) {
  seedRules()
    .catch((error) => {
      console.error('Fatal error:', error)
      process.exit(1)
    })
    .finally(async () => {
      await prisma.$disconnect()
    })
}

export { seedRules }



/**
 * Seed Renewal Automation Rules
 * 
 * Creates default automation rules for renewal reminders (90D, 30D, overdue)
 * Run with: npx tsx src/scripts/seed-renewal-automation-rules.ts
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const defaultRules = [
  {
    key: 'renewal_90d_soft_reminder',
    name: 'Visa/EID/License Renewal – 90D Soft Reminder',
    trigger: 'EXPIRY_WINDOW',
    conditions: {
      expiryType: ['VISA_EXPIRY', 'EMIRATES_ID_EXPIRY', 'TRADE_LICENSE_EXPIRY', 'ESTABLISHMENT_CARD_EXPIRY'],
      daysBefore: 90,
    },
    actions: [
      {
        type: 'SEND_AI_REPLY',
        channel: 'WHATSAPP',
        mode: 'RENEWAL',
      },
      {
        type: 'CREATE_TASK',
        title: 'Renewal outreach - 90 days',
        type: 'RENEWAL_OUTREACH',
        daysFromNow: 0,
      },
      {
        type: 'SET_NEXT_FOLLOWUP',
        daysFromNow: 7,
      },
    ],
    isActive: true,
    enabled: true,
  },
  {
    key: 'renewal_30d_strong_reminder',
    name: 'Visa/EID/License Renewal – 30D Strong Reminder',
    trigger: 'EXPIRY_WINDOW',
    conditions: {
      expiryType: ['VISA_EXPIRY', 'EMIRATES_ID_EXPIRY', 'TRADE_LICENSE_EXPIRY', 'ESTABLISHMENT_CARD_EXPIRY'],
      daysBefore: 30,
    },
    actions: [
      {
        type: 'SEND_AI_REPLY',
        channel: 'WHATSAPP',
        mode: 'RENEWAL',
      },
      {
        type: 'CREATE_TASK',
        title: 'Renewal outreach - 30 days (urgent)',
        type: 'RENEWAL_OUTREACH',
        daysFromNow: 0,
      },
      {
        type: 'SET_NEXT_FOLLOWUP',
        daysFromNow: 3,
      },
    ],
    isActive: true,
    enabled: true,
  },
  {
    key: 'renewal_overdue_escalation',
    name: 'Overdue Renewal – Escalation',
    trigger: 'EXPIRY_WINDOW',
    conditions: {
      expiryType: ['VISA_EXPIRY', 'EMIRATES_ID_EXPIRY', 'TRADE_LICENSE_EXPIRY', 'ESTABLISHMENT_CARD_EXPIRY'],
      daysBefore: -1, // Expired
    },
    actions: [
      {
        type: 'SEND_AI_REPLY',
        channel: 'WHATSAPP',
        mode: 'RENEWAL',
      },
      {
        type: 'CREATE_TASK',
        title: 'Overdue renewal - Manager review needed',
        type: 'RENEWAL_INTERNAL',
        daysFromNow: 0,
      },
      {
        type: 'SET_PRIORITY',
        priority: 'URGENT',
      },
    ],
    isActive: true,
    enabled: true,
  },
]

async function seedRules() {
  console.log('🌱 Seeding renewal automation rules...')

  for (const ruleData of defaultRules) {
    try {
      // Check if rule already exists
      const existing = await prisma.automationRule.findUnique({
        where: { key: ruleData.key },
      })

      if (existing) {
        console.log(`⏭️  Rule "${ruleData.name}" already exists, skipping...`)
        continue
      }

      // Create rule
      const rule = await prisma.automationRule.create({
        data: {
          key: ruleData.key,
          name: ruleData.name,
          trigger: ruleData.trigger,
          conditions: JSON.stringify(ruleData.conditions),
          actions: JSON.stringify(ruleData.actions),
          isActive: ruleData.isActive,
          enabled: ruleData.enabled,
        },
      })

      console.log(`✅ Created rule: "${ruleData.name}" (ID: ${rule.id})`)
    } catch (error: any) {
      console.error(`❌ Failed to create rule "${ruleData.name}":`, error.message)
    }
  }

  console.log('✨ Seeding complete!')
}

// Run if called directly
if (require.main === module) {
  seedRules()
    .catch((error) => {
      console.error('Fatal error:', error)
      process.exit(1)
    })
    .finally(async () => {
      await prisma.$disconnect()
    })
}

export { seedRules }















