/**
 * POST /api/admin/automation/seed-info-followup
 * 
 * Seed default info/quotation follow-up automation rules (Phase 3)
 * Admin only
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'

const defaultRules = [
  {
    key: 'followup_after_info_shared_2d',
    name: 'Follow-up After Info Shared – 2 Days',
    trigger: 'INFO_SHARED',
    conditions: {
      daysAfter: 2,
    },
    actions: [
      {
        type: 'SEND_AI_REPLY',
        channel: 'WHATSAPP',
        mode: 'FOLLOW_UP',
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
    key: 'followup_after_quotation_3d',
    name: 'Follow-up After Quotation Sent – 3 Days',
    trigger: 'INFO_SHARED',
    conditions: {
      daysAfter: 3,
      infoType: 'quotation', // Only for quotations
    },
    actions: [
      {
        type: 'SEND_AI_REPLY',
        channel: 'WHATSAPP',
        mode: 'PRICING',
      },
      {
        type: 'CREATE_TASK',
        title: 'Follow up on quotation - check if customer has questions',
        taskType: 'FOLLOW_UP',
        daysFromNow: 0,
      },
      {
        type: 'SET_NEXT_FOLLOWUP',
        daysFromNow: 2,
      },
    ],
    isActive: true,
    enabled: true,
  },
  {
    key: 'followup_after_document_shared_1d',
    name: 'Follow-up After Document Shared – 1 Day',
    trigger: 'INFO_SHARED',
    conditions: {
      daysAfter: 1,
      infoType: 'document', // Only for documents
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
  },
]

async function seedRules() {
  console.log('🌱 Seeding info/quotation follow-up automation rules...')

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
      message: 'Info/quotation follow-up automation rules seeded successfully',
    })
  } catch (error: any) {
    console.error('Error seeding info follow-up automation rules:', error)
    return NextResponse.json(
      {
        ok: false,
        error: error.message || 'Failed to seed info follow-up automation rules',
      },
      { status: 500 }
    )
  }
}
