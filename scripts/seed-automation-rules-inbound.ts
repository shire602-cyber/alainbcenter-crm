/**
 * Seed Inbound Automation Rules
 * 
 * Creates default automation rules for inbound message handling
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const DEFAULT_RULES = [
  {
    key: 'new_whatsapp_welcome',
    name: 'New WhatsApp Enquiry - Welcome',
    trigger: 'INBOUND_MESSAGE',
    conditions: {
      channels: ['WHATSAPP'],
      matchStages: ['NEW'],
      cooldownMinutes: 60,
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
    schedule: null, // Event-driven, not scheduled
  },
  {
    key: 'existing_lead_pricing',
    name: 'Price Inquiry Response',
    trigger: 'INBOUND_MESSAGE',
    conditions: {
      channels: ['WHATSAPP'],
      matchStages: ['CONTACTED', 'ENGAGED', 'QUALIFIED'],
      containsAny: ['price', 'how much', 'cost', 'fees', 'pricing', 'quotation', 'quote'],
      cooldownMinutes: 120,
    },
    actions: [
      {
        type: 'SEND_AI_REPLY',
        channel: 'WHATSAPP',
        mode: 'PRICING',
      },
    ],
    schedule: null,
  },
  {
    key: 'renewal_keyword_detection',
    name: 'Renewal Detection & Response',
    trigger: 'INBOUND_MESSAGE',
    conditions: {
      channels: ['WHATSAPP'],
      containsAny: ['renew', 'renewal', 'expire', 'expiring', 'expiry', 'extend', 'extension'],
      cooldownMinutes: 180,
    },
    actions: [
      {
        type: 'SEND_AI_REPLY',
        channel: 'WHATSAPP',
        mode: 'RENEWAL',
      },
      {
        type: 'CREATE_TASK',
        title: 'Follow up on renewal inquiry',
        taskType: 'RENEWAL',
        daysFromNow: 1,
      },
    ],
    schedule: null,
  },
  {
    key: 'no_reply_reminder',
    name: 'No Reply Follow-up',
    trigger: 'NO_REPLY_SLA',
    conditions: {
      hoursWithoutReply: 48,
      cooldownDays: 1,
    },
    actions: [
      {
        type: 'CREATE_TASK',
        title: 'Follow up - no reply in 48h',
        taskType: 'FOLLOW_UP',
        daysFromNow: 0,
      },
      {
        type: 'SET_PRIORITY',
        priority: 'HIGH',
      },
    ],
    schedule: 'daily',
  },
  {
    key: 'expiry_90_reminder',
    name: 'Expiry 90 Days Reminder',
    trigger: 'EXPIRY_WINDOW',
    conditions: {
      expiryType: null, // All expiry types
      daysBefore: 90,
      cooldownDays: 30,
    },
    actions: [
      {
        type: 'SEND_WHATSAPP',
        template: 'Hi {name}, this is Alain Business Center. Your {service} expires in approximately 90 days. We\'re here to help you renew smoothly. Would you like to schedule a consultation?',
      },
      {
        type: 'CREATE_TASK',
        title: 'Follow up on 90-day expiry reminder',
        taskType: 'RENEWAL',
        daysFromNow: 3,
      },
      {
        type: 'SET_NEXT_FOLLOWUP',
        daysFromNow: 3,
      },
    ],
    schedule: 'daily',
  },
  {
    key: 'expiry_30_urgent',
    name: 'Expiry 30 Days - Urgent',
    trigger: 'EXPIRY_WINDOW',
    conditions: {
      expiryType: null,
      daysBefore: 30,
      cooldownDays: 7,
    },
    actions: [
      {
        type: 'SEND_WHATSAPP',
        template: 'Hi {name}, URGENT: Your {service} expires in 30 days. Let\'s renew it now to avoid any interruptions. Reply to this message or call us.',
      },
      {
        type: 'SET_PRIORITY',
        priority: 'URGENT',
      },
      {
        type: 'CREATE_TASK',
        title: 'URGENT: Renewal due in 30 days',
        taskType: 'RENEWAL',
        daysFromNow: 0,
      },
    ],
    schedule: 'daily',
  },
]

async function main() {
  console.log('🌱 Seeding inbound automation rules...')

  for (const ruleData of DEFAULT_RULES) {
    try {
      // Check if rule with this key already exists
      const existing = ruleData.key
        ? await prisma.automationRule.findUnique({
            where: { key: ruleData.key },
          })
        : null

      if (existing) {
        // Update existing rule
        await prisma.automationRule.update({
          where: { id: existing.id },
          data: {
            name: ruleData.name,
            trigger: ruleData.trigger,
            conditions: JSON.stringify(ruleData.conditions),
            actions: JSON.stringify(ruleData.actions),
            schedule: ruleData.schedule,
            isActive: true,
            enabled: true,
          },
        })
        console.log(`  ✅ Updated: ${ruleData.name}`)
      } else {
        // Create new rule
        await prisma.automationRule.create({
          data: {
            key: ruleData.key || null,
            name: ruleData.name,
            trigger: ruleData.trigger,
            conditions: JSON.stringify(ruleData.conditions),
            actions: JSON.stringify(ruleData.actions),
            schedule: ruleData.schedule || 'daily',
            isActive: true,
            enabled: true,
          },
        })
        console.log(`  ✅ Created: ${ruleData.name}`)
      }
    } catch (error: any) {
      console.error(`  ❌ Failed: ${ruleData.name}:`, error.message)
    }
  }

  console.log('✅ Inbound automation rules seeding complete!')
  console.log('\n📋 Default Rules Created:')
  DEFAULT_RULES.forEach((r) => {
    console.log(`  - ${r.name} (${r.trigger})`)
  })
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())

















