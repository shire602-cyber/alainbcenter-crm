import { NextRequest, NextResponse } from 'next/server'
import { requireAuthApi } from '@/lib/authApi'
import { runRenewalEngine } from '@/lib/renewals/engine'
import { prisma } from '@/lib/prisma'
import { sendTemplateMessage } from '@/lib/whatsapp'
import { normalizeToE164 } from '@/lib/phone'
import { isWithinBusinessHours } from '@/lib/renewals/engine'

/**
 * POST /api/renewals/engine/run
 * Actually send renewal follow-up messages
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthApi()

    // Check if user is ADMIN or MANAGER
    if (user.role !== 'ADMIN' && user.role !== 'MANAGER') {
      return NextResponse.json(
        { error: 'Unauthorized. Only ADMIN and MANAGER can run the engine.' },
        { status: 403 }
      )
    }

    // Check business hours
    if (!isWithinBusinessHours()) {
      return NextResponse.json(
        { 
          ok: false,
          error: 'Outside business hours. Messages can only be sent between 9am-9pm (Asia/Dubai).',
        },
        { status: 400 }
      )
    }

    const body = await req.json()

    const config = {
      windowDays: body.windowDays || 30,
      serviceTypes: body.serviceTypes || undefined,
      assignedToUserId: body.assignedToUserId || undefined,
      onlyNotContacted: body.onlyNotContacted || false,
      dryRun: false,
    }

    // Run engine to get candidates
    const engineResult = await runRenewalEngine(config)

    // Send messages for candidates that should be sent
    const sendResults = {
      sent: 0,
      failed: 0,
      skipped: engineResult.totals.skipCount,
    }
    const errors: string[] = [...engineResult.errors]

    const candidatesToSend = engineResult.candidates.filter(c => c.willSend)

    for (const candidate of candidatesToSend) {
      try {
        // Validate template exists
        if (!candidate.templateName) {
          sendResults.failed++
          errors.push(`No template for ${candidate.serviceType} / ${candidate.stage}`)
          continue
        }

        // Prepare template parameters (in order: name, service, expiryDate, daysRemaining)
        const templateParams = [
          candidate.variables.name,
          candidate.variables.service,
          candidate.variables.expiryDate,
          candidate.variables.daysRemaining,
        ]

        // Normalize phone
        let normalizedPhone: string
        try {
          normalizedPhone = normalizeToE164(candidate.phone)
        } catch (error: any) {
          sendResults.failed++
          errors.push(`Invalid phone number for lead ${candidate.leadId}: ${error.message}`)
          continue
        }

        // Send template message
        const sendResult = await sendTemplateMessage(
          normalizedPhone,
          candidate.templateName,
          'en_US',
          templateParams
        )

        // Log event and update renewal item
        await prisma.$transaction(async (tx) => {
          // Create event log
          await tx.renewalEventLog.create({
            data: {
              renewalItemId: candidate.renewalItemId,
              type: 'TEMPLATE_SENT',
              channel: 'WHATSAPP',
              payload: {
                stage: candidate.stage,
                templateName: candidate.templateName,
                messageId: sendResult.messageId,
              },
              createdByUserId: user.id,
            },
          })

          // Update renewal item
          const currentItem = await tx.renewalItem.findUnique({
            where: { id: candidate.renewalItemId },
            select: { status: true },
          })

          const newStatus = ['UPCOMING', 'ACTION_REQUIRED', 'URGENT', 'EXPIRED'].includes(
            currentItem?.status || ''
          )
            ? 'CONTACTED'
            : currentItem?.status

          await tx.renewalItem.update({
            where: { id: candidate.renewalItemId },
            data: {
              lastContactedAt: new Date(),
              lastTemplateName: candidate.templateName,
              status: newStatus || 'CONTACTED',
            },
          })
        })

        sendResults.sent++
      } catch (error: any) {
        sendResults.failed++
        errors.push(`Failed to send to ${candidate.leadName} (${candidate.renewalItemId}): ${error.message}`)
        
        // Log error event
        try {
          await prisma.renewalEventLog.create({
            data: {
              renewalItemId: candidate.renewalItemId,
              type: 'NOTE',
              channel: 'INTERNAL',
              payload: {
                note: `Failed to send template ${candidate.templateName}: ${error.message}`,
                error: true,
              },
              createdByUserId: user.id,
            },
          })
        } catch (logError) {
          // Ignore log errors
          console.error('Failed to log error event:', logError)
        }
      }
    }

    return NextResponse.json({
      ok: true,
      summary: {
        candidates: engineResult.candidates.length,
        sent: sendResults.sent,
        failed: sendResults.failed,
        skipped: sendResults.skipped,
      },
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error: any) {
    console.error('POST /api/renewals/engine/run error:', error)
    return NextResponse.json(
      { 
        ok: false,
        error: error?.message ?? 'Failed to run engine',
        summary: { candidates: 0, sent: 0, failed: 0, skipped: 0 },
        errors: [error?.message || 'Unknown error'],
      },
      { status: 500 }
    )
  }
}

