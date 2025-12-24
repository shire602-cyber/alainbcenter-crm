import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

/**
 * DELETE /api/leads/[id]/reminders/[reminderId]
 * Delete a reminder
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; reminderId: string }> }
) {
  try {
    await getCurrentUser()
    const { reminderId } = await params
    const reminderIdNum = parseInt(reminderId)

    await prisma.reminder.delete({
      where: { id: reminderIdNum },
    })

    return NextResponse.json({ ok: true })
  } catch (error: any) {
    console.error('Delete reminder error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

