import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { buildWhatsAppTemplateForExpiry, buildEmailTemplateForExpiry, buildEmailSubjectForExpiry } from '@/lib/aiMessaging'
import { sendWhatsApp, sendEmail } from '@/lib/messaging'

// POST /api/automation/run-expiry-checks
// Server-side job to check for expiring leads and send reminders
// This can be called via cron, GitHub Actions, or manually
export async function POST(req: NextRequest) {
  try {
    // Normalize today to UTC midnight to match run-daily endpoint and avoid timezone issues
    const today = new Date()
    today.setUTCHours(0, 0, 0, 0)

    const results = {
      checked: 0,
      remindersSent: 0,
      errors: [] as string[],
      actions: [] as Array<{
        leadId: number
        contactName: string
        daysBefore: number
        channel: string
        action: string
      }>,
    }

    // Find all leads with expiry dates
    const leadsWithExpiry = await prisma.lead.findMany({
      where: {
        expiryDate: { not: null },
      },
      include: {
        contact: true,
        communicationLogs: {
          where: {
            direction: 'outbound',
            channel: { in: ['whatsapp', 'email'] },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    })

    results.checked = leadsWithExpiry.length

    // Check each lead
    for (const lead of leadsWithExpiry) {
      if (!lead.expiryDate) continue

      // Normalize expiry date to UTC midnight to match today's timezone
      const expiryDate = new Date(lead.expiryDate)
      expiryDate.setUTCHours(0, 0, 0, 0)

      // Calculate days until expiry (both dates normalized to UTC midnight)
      const daysDiff = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

      // Skip if already expired (negative days) or more than 90 days away
      if (daysDiff < 0 || daysDiff > 90) continue

      // Define reminder checkpoints (90, 60, 30, 7 days before)
      const checkpoints = [90, 60, 30, 7]
      
      // Find the relevant checkpoint: exact match or within the range for that checkpoint
      // For the last checkpoint (7), also match if daysDiff is 1-6 (within final week)
      let relevantCheckpoint: number | undefined
      
      for (let i = 0; i < checkpoints.length; i++) {
        const cp = checkpoints[i]
        const nextCp = checkpoints[i + 1] // undefined for last checkpoint
        
        // Exact match at checkpoint
        if (daysDiff === cp) {
          relevantCheckpoint = cp
          break
        }
        
        // Within range: after this checkpoint but before next (or before 0 for last)
        if (daysDiff < cp) {
          if (nextCp !== undefined) {
            // Has next checkpoint: must be between this and next
            if (daysDiff > nextCp) {
              relevantCheckpoint = cp
              break
            }
          } else {
            // Last checkpoint: match if within 0-7 days
            if (daysDiff >= 0 && daysDiff <= cp) {
              relevantCheckpoint = cp
              break
            }
          }
        }
      }

      if (!relevantCheckpoint) continue

      // Check if we've already sent a reminder for this checkpoint
      const checkpointStatus = `sent_${relevantCheckpoint}_day_reminder`
      const alreadySent = lead.autoWorkflowStatus === checkpointStatus ||
        lead.communicationLogs.some(log => {
          // Check if we sent a reminder in the last 7 days (avoid duplicates)
          const logDate = new Date(log.createdAt)
          const daysSinceLog = Math.ceil((today.getTime() - logDate.getTime()) / (1000 * 60 * 60 * 24))
          return daysSinceLog < 7 && log.messageSnippet?.includes(`${relevantCheckpoint}`)
        })

      if (alreadySent) continue

      try {
        // Generate message
        const whatsappMessage = buildWhatsAppTemplateForExpiry(lead as any, relevantCheckpoint)
        const emailMessage = buildEmailTemplateForExpiry(lead as any, relevantCheckpoint)
        const emailSubject = buildEmailSubjectForExpiry(relevantCheckpoint, lead.leadType || 'Service')

        // Track reminders sent for this lead (only if actually sent successfully)
        let whatsappSent = false
        let emailSent = false

        // Send WhatsApp reminder (if phone number is available)
        if (lead.contact.phone) {
          const whatsappResult = await sendWhatsApp(lead as any, lead.contact as any, whatsappMessage)
          whatsappSent = whatsappResult.success
          if (!whatsappResult.success) {
            results.errors.push(`Lead ${lead.id}: WhatsApp reminder failed to send (${relevantCheckpoint}-day)`)
          }
        }

        // Send Email reminder (if email is available)
        if (lead.contact.email) {
          const emailResult = await sendEmail(lead as any, lead.contact as any, emailSubject, emailMessage)
          emailSent = emailResult.success
          if (!emailResult.success) {
            results.errors.push(`Lead ${lead.id}: Email reminder failed to send (${relevantCheckpoint}-day)`)
          }
        }

        // Only update lead status if at least one message was successfully sent
        // This prevents marking reminders as sent when all delivery attempts failed
        if (!whatsappSent && !emailSent) {
          results.errors.push(`Lead ${lead.id}: All reminder delivery attempts failed (${relevantCheckpoint}-day)`)
          continue // Skip updating status and try again on next run
        }

        // Calculate nextFollowUpAt: set to the next checkpoint date based on expiry date
        // For checkpoints [90, 60, 30, 7], the next checkpoint is the one that comes after
        const checkpointIndex = checkpoints.indexOf(relevantCheckpoint)
        const nextCheckpoint = checkpoints[checkpointIndex + 1]
        
        let nextFollowUpDate: Date | null = null
        if (nextCheckpoint !== undefined) {
          // Calculate when the next checkpoint will occur (nextCheckpoint days before expiry)
          nextFollowUpDate = new Date(expiryDate.getTime() - nextCheckpoint * 24 * 60 * 60 * 1000)
        } else {
          // Last checkpoint (7 days): set to expiry date itself as final reminder
          nextFollowUpDate = expiryDate
        }

        // Update lead's autoWorkflowStatus
        // Only update if at least one message was successfully sent
        // Only increment counters after successful database update
        // This ensures accurate reporting if update fails
        await prisma.lead.update({
          where: { id: lead.id },
          data: {
            autoWorkflowStatus: checkpointStatus,
            nextFollowUpAt: nextFollowUpDate,
          },
        })

        // Increment counters only after successful database update and successful send
        if (whatsappSent) {
          results.remindersSent++
          results.actions.push({
            leadId: lead.id,
            contactName: lead.contact.fullName,
            daysBefore: relevantCheckpoint,
            channel: 'whatsapp',
            action: 'reminder_sent',
          })
        }

        if (emailSent) {
          results.remindersSent++
          results.actions.push({
            leadId: lead.id,
            contactName: lead.contact.fullName,
            daysBefore: relevantCheckpoint,
            channel: 'email',
            action: 'reminder_sent',
          })
        }

      } catch (error: any) {
        results.errors.push(`Lead ${lead.id}: ${error.message}`)
        console.error(`Error processing lead ${lead.id}:`, error)
      }
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      ...results,
    })

  } catch (error: any) {
    console.error('POST /api/automation/run-expiry-checks error:', error)
    return NextResponse.json(
      { 
        success: false,
        error: error?.message ?? 'Unknown error in expiry checks',
      },
      { status: 500 }
    )
  }
}

// GET /api/automation/run-expiry-checks
// Get stats about upcoming expiries (for dashboard/monitoring)
export async function GET() {
  try {
    // Normalize today to UTC midnight to match POST endpoint and avoid timezone issues
    const today = new Date()
    today.setUTCHours(0, 0, 0, 0)

    const leadsWithExpiry = await prisma.lead.findMany({
      where: {
        expiryDate: { not: null },
      },
      include: {
        contact: true,
      },
    })

    const stats = {
      totalWithExpiry: leadsWithExpiry.length,
      expiringIn90Days: 0,
      expiringIn60Days: 0,
      expiringIn30Days: 0,
      expiringIn7Days: 0,
      expired: 0,
    }

    for (const lead of leadsWithExpiry) {
      if (!lead.expiryDate) continue
      // Normalize expiry date to UTC midnight to match today's timezone
      const expiryDate = new Date(lead.expiryDate)
      expiryDate.setUTCHours(0, 0, 0, 0)
      const daysDiff = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

      if (daysDiff < 0) stats.expired++
      else if (daysDiff <= 7) stats.expiringIn7Days++
      else if (daysDiff <= 30) stats.expiringIn30Days++
      else if (daysDiff <= 60) stats.expiringIn60Days++
      else if (daysDiff <= 90) stats.expiringIn90Days++
    }

    return NextResponse.json(stats)
  } catch (error: any) {
    console.error('GET /api/automation/run-expiry-checks error:', error)
    return NextResponse.json(
      { error: error?.message ?? 'Unknown error' },
      { status: 500 }
    )
  }
}



