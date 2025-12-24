import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/cron/expiry-sweeper
 * Daily cron to create reminders for leads with upcoming expiries
 * Runs daily at 9 AM (configured in vercel.json)
 */
export async function GET(req: NextRequest) {
  try {
    // Verify cron secret
    const vercelCronHeader = req.headers.get('x-vercel-cron')
    const authHeader = req.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET || 'change-me-in-production'

    let isAuthorized = false
    if (vercelCronHeader) {
      isAuthorized = true
      console.log('✅ Vercel cron request detected for expiry sweeper')
    } else if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7)
      if (token === cronSecret) {
        isAuthorized = true
        console.log('✅ Authorized via CRON_SECRET for expiry sweeper')
      }
    }

    if (!isAuthorized) {
      return NextResponse.json(
        { ok: false, error: 'Unauthorized: Missing or invalid authorization' },
        { status: 401 }
      )
    }

    const today = new Date()
    today.setUTCHours(0, 0, 0, 0)
    
    const results = {
      remindersCreated: 0,
      errors: [] as string[],
    }

    // Checkpoints: 90, 60, 30, 7 days before expiry
    const checkpoints = [90, 60, 30, 7]

    for (const daysBefore of checkpoints) {
      const targetDate = new Date(today)
      targetDate.setDate(targetDate.getDate() + daysBefore)
      targetDate.setUTCHours(0, 0, 0, 0)

      // Find leads with expiry on target date
      const leadsWithExpiry = await prisma.lead.findMany({
        where: {
          expiryDate: {
            gte: targetDate,
            lt: new Date(targetDate.getTime() + 24 * 60 * 60 * 1000), // Next day
          },
        },
        include: {
          contact: true,
          reminders: {
            where: {
              type: 'EXPIRY',
              scheduledAt: {
                gte: new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000), // Within last 7 days
              },
            },
          },
        },
      })

      for (const lead of leadsWithExpiry) {
        // Check if reminder already exists for this checkpoint
        const existingReminder = lead.reminders.find(
          r => r.type === 'EXPIRY' && 
          Math.abs((new Date(r.scheduledAt).getTime() - targetDate.getTime()) / (1000 * 60 * 60 * 24)) < 1
        )

        if (existingReminder) {
          continue // Already has reminder
        }

        try {
          // Create reminder
          await prisma.reminder.create({
            data: {
              leadId: lead.id,
              type: 'EXPIRY',
              scheduledAt: targetDate,
              channel: 'WHATSAPP',
              message: `Hi ${lead.contact.fullName}, your ${lead.leadType || 'service'} expires in ${daysBefore} days. Please contact us to renew.`,
            },
          })

          results.remindersCreated++
          console.log(`✅ Created ${daysBefore}-day expiry reminder for lead ${lead.id}`)
        } catch (error: any) {
          results.errors.push(`Lead ${lead.id}: ${error.message}`)
          console.error(`❌ Failed to create reminder for lead ${lead.id}:`, error)
        }
      }
    }

    return NextResponse.json({
      ok: true,
      message: 'Expiry reminders created',
      results,
      timestamp: new Date().toISOString(),
    })
  } catch (error: any) {
    console.error('Expiry sweeper error:', error)
    return NextResponse.json(
      {
        ok: false,
        error: error.message || 'Internal server error',
      },
      { status: 500 }
    )
  }
}

