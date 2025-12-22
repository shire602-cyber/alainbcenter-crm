/**
 * POST /api/admin/automation/seed-inbound
 * 
 * Seed default inbound message automation rules
 * Admin only
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'

const defaultRules = [
  {
    key: 'new_whatsapp_welcome',
    name: 'New WhatsApp Enquiry – Instant Welcome + Qualify',
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
      cooldownMinutes: 120,
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
      cooldownMinutes: 1440,
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
      onlyHot: true,
      workingHoursOnly: false,
      cooldownMinutes: 30,
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
      const existing = await prisma.automationRule.findUnique({
        where: { key: ruleData.key },
      })

      if (existing) {
        console.log(`⏭️  Rule "${ruleData.name}" already exists, skipping...`)
        continue
      }

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

export async function POST(req: NextRequest) {
  try {
    await requireAdminApi()

    await seedRules()

    return NextResponse.json({
      ok: true,
      message: 'Default automation rules seeded successfully',
    })
  } catch (error: any) {
    console.error('Error seeding automation rules:', error)
    return NextResponse.json(
      {
        ok: false,
        error: error.message || 'Failed to seed automation rules',
      },
      { status: 500 }
    )
  }
}







