import { NextRequest, NextResponse } from 'next/server'
import { requireAdminOrManagerApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'
import { RenewalServiceType } from '@prisma/client'

const SERVICE_TYPE_MAP: Record<string, RenewalServiceType> = {
  TRADE_LICENSE_EXPIRY: 'TRADE_LICENSE',
  EMIRATES_ID_EXPIRY: 'EMIRATES_ID',
  VISA_EXPIRY: 'RESIDENCY',
  RESIDENCY_EXPIRY: 'RESIDENCY',
  VISIT_VISA_EXPIRY: 'VISIT_VISA',
}

const STATUS_MAP: Record<string, string> = {
  NOT_STARTED: 'UPCOMING',
  PENDING: 'UPCOMING',
  IN_PROGRESS: 'IN_PROGRESS',
  RENEWED: 'RENEWED',
  NOT_RENEWING: 'LOST',
}

export async function POST(req: NextRequest) {
  try {
    await requireAdminOrManagerApi()

    const body = await req.json().catch(() => ({}))
    const windowDays = typeof body?.windowDays === 'number' ? body.windowDays : 180
    const now = new Date()
    const futureDate = new Date(now)
    futureDate.setDate(futureDate.getDate() + windowDays)
    const pastDate = new Date(now)
    pastDate.setDate(pastDate.getDate() - 120)

    const expiryItems = await prisma.expiryItem.findMany({
      where: {
        expiryDate: {
          gte: pastDate,
          lte: futureDate,
        },
      },
      include: {
        lead: {
          select: { id: true, estimatedRenewalValue: true, renewalProbability: true },
        },
      },
    })

    let created = 0
    let updated = 0
    const errors: string[] = []

    for (const item of expiryItems) {
      try {
        if (!item.leadId) continue

        const serviceType = SERVICE_TYPE_MAP[item.type] || 'TRADE_LICENSE'
        const status = STATUS_MAP[item.renewalStatus] || 'UPCOMING'

        const existing = await prisma.renewalItem.findFirst({
          where: {
            leadId: item.leadId,
            serviceType,
            expiresAt: item.expiryDate,
          },
        })

        if (existing) {
          await prisma.renewalItem.update({
            where: { id: existing.id },
            data: {
              status,
              expectedValue: item.lead?.estimatedRenewalValue ?? existing.expectedValue,
              probability: item.lead?.renewalProbability ?? existing.probability,
              assignedToUserId: item.assignedUserId ?? existing.assignedToUserId,
              lastContactedAt: item.lastReminderSentAt ?? existing.lastContactedAt,
              notes: item.notes ?? existing.notes,
            },
          })
          updated += 1
        } else {
          await prisma.renewalItem.create({
            data: {
              leadId: item.leadId,
              contactId: item.contactId,
              serviceType,
              serviceName: item.type.replace(/_/g, ' '),
              expiresAt: item.expiryDate,
              status,
              expectedValue: item.lead?.estimatedRenewalValue ?? null,
              probability: item.lead?.renewalProbability ?? 70,
              assignedToUserId: item.assignedUserId,
              lastContactedAt: item.lastReminderSentAt,
              nextActionAt: null,
              notes: item.notes,
            },
          })
          created += 1
        }
      } catch (error: any) {
        errors.push(`ExpiryItem ${item.id}: ${error.message}`)
      }
    }

    return NextResponse.json({
      ok: true,
      scanned: expiryItems.length,
      created,
      updated,
      errors,
    })
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error.message || 'Failed to sync renewals' },
      { status: error.statusCode || 500 }
    )
  }
}
