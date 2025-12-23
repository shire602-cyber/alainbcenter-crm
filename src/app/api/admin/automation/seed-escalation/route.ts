/**
 * POST /api/admin/automation/seed-escalation
 * 
 * Seed escalation automation rules (Phase 4)
 * - No reply SLA breach → Create agent task
 * - Overdue follow-ups → Create agent task
 * - Stale leads → Create agent task
 * Admin only
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'

const escalationRules = [
  {
    key: 'escalate_no_reply_sla',
    name: 'Escalate: No Reply SLA Breach',
    trigger: 'NO_REPLY_SLA',
    conditions: {
      slaMinutes: 15, // 15 minutes SLA
      escalateAfterMinutes: 60, // Escalate if no reply after 60 minutes
    },
    actions: [
      {
        type: 'CREATE_AGENT_TASK',
        reason: 'no_reply_sla',
        priority: 'URGENT',
      },
    ],
    isActive: true,
    enabled: true,
  },
  {
    key: 'escalate_overdue_followup',
    name: 'Escalate: Overdue Follow-up',
    trigger: 'FOLLOWUP_OVERDUE',
    conditions: {
      hoursOverdue: 24, // Escalate if overdue by 24+ hours
    },
    actions: [
      {
        type: 'CREATE_AGENT_TASK',
        reason: 'overdue_followup',
        priority: 'HIGH',
      },
    ],
    isActive: true,
    enabled: true,
  },
  {
    key: 'escalate_stale_lead',
    name: 'Escalate: Stale Lead',
    trigger: 'NO_ACTIVITY',
    conditions: {
      daysWithoutMessage: 7, // Lead inactive for 7+ days
    },
    actions: [
      {
        type: 'CREATE_AGENT_TASK',
        reason: 'stale_lead',
        priority: 'NORMAL',
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
  console.log('🌱 Seeding escalation automation rules...')

  for (const ruleData of escalationRules) {
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
      message: 'Escalation automation rules seeded successfully',
    })
  } catch (error: any) {
    console.error('Error seeding escalation automation rules:', error)
    return NextResponse.json(
      {
        ok: false,
        error: error.message || 'Failed to seed escalation automation rules',
      },
      { status: 500 }
    )
  }
}
