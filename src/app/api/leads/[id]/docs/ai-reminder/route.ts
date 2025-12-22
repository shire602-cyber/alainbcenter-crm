/**
 * POST /api/leads/[id]/docs/ai-reminder
 * 
 * Generate AI-powered document reminder message
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAuthApi } from '@/lib/authApi'
import { generateDocsReminderMessage } from '@/lib/aiDocsReminder'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuthApi()
    const resolvedParams = await params
    const leadId = parseInt(resolvedParams.id)

    if (isNaN(leadId)) {
      return NextResponse.json(
        { ok: false, error: 'Invalid lead ID' },
        { status: 400 }
      )
    }

    const body = await req.json()
    const { channel } = body

    if (!channel || (channel !== 'WHATSAPP' && channel !== 'EMAIL')) {
      return NextResponse.json(
        { ok: false, error: 'Channel must be WHATSAPP or EMAIL' },
        { status: 400 }
      )
    }

    const draft = await generateDocsReminderMessage({
      leadId,
      channel,
    })

    return NextResponse.json({
      ok: true,
      draft,
      channel,
    })
  } catch (error: any) {
    console.error('Error generating docs reminder:', error)
    return NextResponse.json(
      {
        ok: false,
        error: error.message || 'Failed to generate reminder',
      },
      { status: 500 }
    )
  }
}












