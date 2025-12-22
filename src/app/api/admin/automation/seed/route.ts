import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'

// POST /api/admin/automation/seed
// Create default automation rules
export async function POST(req: NextRequest) {
  try {
    await requireAdminApi()

    const defaultRules = [
      {
        key: 'followup_due',
        name: 'Follow-up Due',
        enabled: true,
        channel: 'whatsapp',
        schedule: 'daily',
        template:
          'Hi {{name}}, this is {{company}}. Just following up on your {{service}} request. Are you available for a quick call today?',
      },
      {
        key: 'expiry_90',
        name: 'Expiry 90 Days Reminder',
        enabled: true,
        channel: 'whatsapp',
        schedule: 'daily',
        template:
          'Hi {{name}}, reminder: your UAE {{service}} may be due for renewal soon (about {{daysToExpiry}} days left). Would you like us to handle it for you?',
      },
      {
        key: 'overdue',
        name: 'Overdue Escalation',
        enabled: true,
        channel: 'whatsapp',
        schedule: 'daily',
        template:
          'Hi {{name}}, your {{service}} appears overdue. We can help fix it urgently. Reply 1) YES 2) Need price 3) Call me',
      },
    ]

    const created = []
    for (const ruleData of defaultRules) {
      const existing = await prisma.automationRule.findUnique({
        where: { key: ruleData.key },
      })

      if (existing) {
        // Update existing
        await prisma.automationRule.update({
          where: { key: ruleData.key },
          data: {
            name: ruleData.name,
            enabled: ruleData.enabled,
            channel: ruleData.channel,
            schedule: ruleData.schedule,
            template: ruleData.template,
          },
        })
        created.push({ key: ruleData.key, action: 'updated' })
      } else {
        // Create new
        await prisma.automationRule.create({
          data: ruleData,
        })
        created.push({ key: ruleData.key, action: 'created' })
      }
    }

    return NextResponse.json({
      ok: true,
      message: 'Default rules created successfully',
      created,
    })
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error.message || 'Failed to seed rules' },
      { status: error.statusCode || 500 }
    )
  }
}






















