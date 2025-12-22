/**
 * Seed Default Autoresponder Rules
 * 
 * Creates opinionated default automation rules for inbound messages
 * Run with: npx tsx src/scripts/seed-automation-rules.ts
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const defaultRules = [
  {
    key: 'new_whatsapp_welcome',
    name: 'New WhatsApp Enquiry – Instant Welcome + Qualify',
    trigger: 'INBOUND_MESSAGE',
    conditions: {
      channels: ['WHATSAPP'],
      matchStages: ['NEW'],
      cooldownMinutes: 60, // Once per hour per lead
    },
    actions: [
      {
        type: 'REQUALIFY_LEAD',
      },
      {
        type: 'SEND_AI_REPLY',
        channel: 'WHATSAPP',
        mode: 'QUALIFY',
      },
    ],
    isActive: true,
    enabled: true,
  },
  {
    key: 'existing_lead_pricing',
    name: 'Existing Lead – Price Inquiry Response',
    trigger: 'INBOUND_MESSAGE',
    conditions: {
      channels: ['WHATSAPP'],
      matchStages: ['CONTACTED', 'ENGAGED', 'QUALIFIED'],
      containsAny: ['price', 'how much', 'cost', 'fees', 'fee', 'pricing'],
      cooldownMinutes: 120, // Once per 2 hours
    },
    actions: [
      {
        type: 'SEND_AI_REPLY',
        channel: 'WHATSAPP',
        mode: 'PRICING',
      },
    ],
    isActive: true,
    enabled: true,
  },
  {
    key: 'renewal_keyword_detection',
    name: 'Renewal Keyword Detected – Renewal Script + Follow-up',
    trigger: 'INBOUND_MESSAGE',
    conditions: {
      channels: ['WHATSAPP'],
      containsAny: ['renew', 'renewal', 'extend', 'expired', 'expiring', 'expiry'],
      cooldownMinutes: 1440, // Once per day per lead
    },
    actions: [
      {
        type: 'SEND_AI_REPLY',
        channel: 'WHATSAPP',
        mode: 'RENEWAL',
      },
      {
        type: 'SET_NEXT_FOLLOWUP',
        daysFromNow: 1,
      },
    ],
    isActive: true,
    enabled: true,
  },
  {
    key: 'hot_lead_instant_reply',
    name: 'Hot Lead – Instant AI Reply',
    trigger: 'INBOUND_MESSAGE',
    conditions: {
      channels: ['WHATSAPP'],
      onlyHot: true, // aiScore >= 70
      workingHoursOnly: false, // Reply 24/7 for hot leads
      cooldownMinutes: 30, // More frequent for hot leads
    },
    actions: [
      {
        type: 'REQUALIFY_LEAD',
      },
      {
        type: 'SEND_AI_REPLY',
        channel: 'WHATSAPP',
        mode: 'FOLLOW_UP',
      },
    ],
    isActive: true,
    enabled: true,
  },
]

async function seedRules() {
  console.log('🌱 Seeding default automation rules...')

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

