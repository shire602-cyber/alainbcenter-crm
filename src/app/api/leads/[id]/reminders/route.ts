import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/leads/[id]/reminders
 * Get all reminders for a lead
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await getCurrentUser()
    const { id } = await params
    const leadId = parseInt(id)

    const reminders = await prisma.reminder.findMany({
      where: { leadId },
      orderBy: { scheduledAt: 'asc' },
    })

    return NextResponse.json({ reminders })
  } catch (error: any) {
    console.error('Get reminders error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/leads/[id]/reminders
 * Create a new reminder
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await getCurrentUser()
    const { id } = await params
    const leadId = parseInt(id)

    const body = await req.json()
    const { type, scheduledAt, channel, message, templateKey } = body

    if (!type || !scheduledAt) {
      return NextResponse.json(
        { error: 'Type and scheduledAt are required' },
        { status: 400 }
      )
    }

    const reminder = await prisma.reminder.create({
      data: {
        leadId,
        type,
        scheduledAt: new Date(scheduledAt),
        channel: channel || 'WHATSAPP',
        message: message || null,
        templateKey: templateKey || null,
        sent: false,
      },
    })

    return NextResponse.json({ reminder })
  } catch (error: any) {
    console.error('Create reminder error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

