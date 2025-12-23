/**
 * Seed Comprehensive AI Autopilot Rules
 * 
 * Creates a complete AI autopilot system that:
 * 1. Greets new customers automatically
 * 2. Understands what they want
 * 3. Collects basic information progressively
 * 4. Follows up appropriately
 * 
 * Run with: npx tsx src/scripts/seed-comprehensive-autopilot.ts
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const comprehensiveRules = [
  {
    key: 'auto_greeting_new_customer',
    name: 'Auto-Greeting: New Customer Welcome',
    description: 'Automatically greets new customers and introduces the service',
    trigger: 'INBOUND_MESSAGE',
    conditions: {
      channels: ['WHATSAPP', 'INSTAGRAM', 'FACEBOOK', 'WEBCHAT'],
      matchStages: ['NEW'],
      cooldownMinutes: 60, // Once per hour
    },
    actions: [
      {
        type: 'SEND_AI_REPLY',
        channel: 'WHATSAPP',
        mode: 'QUALIFY',
      },
      {
        type: 'REQUALIFY_LEAD',
      },
    ],
    isActive: true,
    enabled: true,
    priority: 1,
  },
  {
    key: 'auto_understand_customer_needs',
    name: 'Auto-Understanding: Analyze Customer Intent',
    description: 'Analyzes customer messages to understand their needs and intent',
    trigger: 'INBOUND_MESSAGE',
    conditions: {
      channels: ['WHATSAPP', 'INSTAGRAM', 'FACEBOOK', 'WEBCHAT'],
      matchStages: ['NEW', 'CONTACTED'],
      cooldownMinutes: 30,
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
    priority: 2,
  },
  {
    key: 'auto_collect_basic_info',
    name: 'Auto-Collection: Gather Basic Information',
    description: 'Progressively collects basic information (name, service needed, timeline, etc.)',
    trigger: 'INBOUND_MESSAGE',
    conditions: {
      channels: ['WHATSAPP', 'INSTAGRAM', 'FACEBOOK', 'WEBCHAT'],
      matchStages: ['NEW', 'CONTACTED'],
      // Only trigger if lead is missing basic info
      requiresMissingInfo: true,
      cooldownMinutes: 45,
    },
    actions: [
      {
        type: 'SEND_AI_REPLY',
        channel: 'WHATSAPP',
        mode: 'QUALIFY',
      },
    ],
    isActive: true,
    enabled: true,
    priority: 3,
  },
  {
    key: 'auto_followup_engagement',
    name: 'Auto-Follow-up: Keep Engagement',
    description: 'Automatically follows up to keep the conversation going',
    trigger: 'INBOUND_MESSAGE',
    conditions: {
      channels: ['WHATSAPP', 'INSTAGRAM', 'FACEBOOK', 'WEBCHAT'],
      matchStages: ['CONTACTED', 'ENGAGED'],
      cooldownMinutes: 120,
    },
    actions: [
      {
        type: 'SEND_AI_REPLY',
        channel: 'WHATSAPP',
        mode: 'FOLLOW_UP',
      },
    ],
    isActive: true,
    enabled: true,
    priority: 4,
  },
  {
    key: 'auto_book_call_qualified',
    name: 'Auto-Book Call: Qualified Leads',
    description: 'Suggests booking a call for qualified leads',
    trigger: 'INBOUND_MESSAGE',
    conditions: {
      channels: ['WHATSAPP', 'INSTAGRAM', 'FACEBOOK', 'WEBCHAT'],
      matchStages: ['QUALIFIED'],
      onlyHot: true, // Only for hot leads (aiScore >= 70)
      cooldownMinutes: 180,
    },
    actions: [
      {
        type: 'SEND_AI_REPLY',
        channel: 'WHATSAPP',
        mode: 'BOOK_CALL',
      },
    ],
    isActive: true,
    enabled: true,
    priority: 5,
  },
  {
    key: 'auto_remind_followup',
    name: 'Auto-Reminder: Follow-up Reminders',
    description: 'Sends reminders for pending follow-ups',
    trigger: 'INBOUND_MESSAGE',
    conditions: {
      channels: ['WHATSAPP', 'INSTAGRAM', 'FACEBOOK', 'WEBCHAT'],
      matchStages: ['CONTACTED', 'ENGAGED', 'QUALIFIED'],
      // Only if there's a pending follow-up
      hasPendingFollowup: true,
      cooldownMinutes: 240,
    },
    actions: [
      {
        type: 'SEND_AI_REPLY',
        channel: 'WHATSAPP',
        mode: 'REMIND',
      },
    ],
    isActive: true,
    enabled: true,
    priority: 6,
  },
]

async function seedComprehensiveAutopilot() {
  console.log('🌱 Seeding comprehensive AI autopilot rules...')

  for (const rule of comprehensiveRules) {
    try {
      const existing = await prisma.automationRule.findUnique({
        where: { key: rule.key },
      })

      if (existing) {
        // Update existing rule
        await prisma.automationRule.update({
          where: { key: rule.key },
          data: {
            name: rule.name,
            description: rule.description || null,
            trigger: rule.trigger,
            conditions: JSON.stringify(rule.conditions),
            actions: JSON.stringify(rule.actions),
            isActive: rule.isActive,
            enabled: rule.enabled,
            priority: rule.priority || null,
          },
        })
        console.log(`✅ Updated rule: ${rule.name}`)
      } else {
        // Create new rule
        await prisma.automationRule.create({
          data: {
            key: rule.key,
            name: rule.name,
            description: rule.description || null,
            trigger: rule.trigger,
            conditions: JSON.stringify(rule.conditions),
            actions: JSON.stringify(rule.actions),
            isActive: rule.isActive,
            enabled: rule.enabled,
            priority: rule.priority || null,
          },
        })
        console.log(`✅ Created rule: ${rule.name}`)
      }
    } catch (error: any) {
      console.error(`❌ Error seeding rule ${rule.key}:`, error.message)
    }
  }

  console.log('✨ Comprehensive autopilot rules seeded successfully!')
}

seedComprehensiveAutopilot()
  .catch((error) => {
    console.error('Error:', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

