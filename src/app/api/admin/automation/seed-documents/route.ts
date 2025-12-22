/**
 * POST /api/admin/automation/seed-documents
 * 
 * Seed default document & compliance automation rules
 * Admin only
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'

const defaultRules = [
  {
    key: 'missing_docs_on_qualified',
    name: 'Missing Mandatory Docs – When Stage = QUALIFIED',
    trigger: 'STAGE_CHANGE',
    conditions: {
      toStage: 'QUALIFIED',
      missingMandatoryDocs: true,
    },
    actions: [
      {
        type: 'CREATE_TASK',
        title: 'Collect missing documents for {lead.contact.fullName}',
        taskType: 'DOCUMENT_REQUEST',
        daysFromNow: 0,
      },
      {
        type: 'SEND_AI_REPLY',
        channel: 'WHATSAPP',
        mode: 'DOCS',
      },
    ],
    isActive: true,
    enabled: true,
  },
  {
    key: 'document_expiry_30d',
    name: 'Document Expiry – 30 Days Reminder',
    trigger: 'EXPIRY_WINDOW',
    conditions: {
      documentExpiryInDays: 30,
      documentTypes: ['EID', 'VISA_PAGE', 'COMPANY_LICENSE'],
    },
    actions: [
      {
        type: 'CREATE_TASK',
        title: 'Document expiring in 30 days',
        taskType: 'DOCUMENT_REQUEST',
        daysFromNow: 0,
      },
      {
        type: 'SEND_AI_REPLY',
        channel: 'WHATSAPP',
        mode: 'DOCS',
      },
    ],
    isActive: true,
    enabled: true,
  },
  {
    key: 'document_expiry_7d',
    name: 'Document Expiry – 7 Days Urgent Reminder',
    trigger: 'EXPIRY_WINDOW',
    conditions: {
      documentExpiryInDays: 7,
      documentTypes: ['EID', 'VISA_PAGE', 'COMPANY_LICENSE'],
    },
    actions: [
      {
        type: 'CREATE_TASK',
        title: 'URGENT: Document expiring in 7 days',
        taskType: 'DOCUMENT_REQUEST',
        daysFromNow: 0,
      },
      {
        type: 'SEND_AI_REPLY',
        channel: 'WHATSAPP',
        mode: 'DOCS',
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
  console.log('🌱 Seeding document automation rules...')

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
      message: 'Document automation rules seeded successfully',
    })
  } catch (error: any) {
    console.error('Error seeding document automation rules:', error)
    return NextResponse.json(
      {
        ok: false,
        error: error.message || 'Failed to seed document automation rules',
      },
      { status: 500 }
    )
  }
}











