import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'
import { sendWhatsApp, sendEmail } from '@/lib/messaging'
import { generateExpiryReminderMessage, generateFollowUpMessage } from '@/lib/aiMessageGeneration'

/**
 * POST /api/automation/run-now
 * Internal endpoint for UI "Run Autopilot Now" button
 * Admin-only, no CRON_SECRET required
 */
export async function POST(req: NextRequest) {
  try {
    // Require admin authentication
    await requireAdminApi()

    const today = new Date()
    today.setUTCHours(0, 0, 0, 0)
    const now = new Date()
    const dateKey = today.toISOString().split('T')[0] // YYYY-MM-DD

    const results = {
      rulesRun: 0,
      expiryRemindersSent: 0,
      followUpsSent: 0,
      skippedDuplicates: 0,
      errors: [] as string[],
    }

    // Get active automation rules
    const activeRules = await prisma.automationRule.findMany({
      where: { isActive: true },
    })

    results.rulesRun = activeRules.length

    // ========================================
    // PART A: Expiry Reminders
    // ========================================
    const expiryRules = activeRules.filter((r) => r.type === 'expiry_reminder')

    if (expiryRules.length > 0) {
      const leadsWithExpiry = await prisma.lead.findMany({
        where: {
          expiryDate: {
            gte: today,
          },
          pipelineStage: {
            notIn: ['completed', 'lost'],
          },
        },
        include: {
          contact: true,
        },
      })

      for (const lead of leadsWithExpiry) {
        if (!lead.expiryDate) continue

        const expiryDate = new Date(lead.expiryDate)
        expiryDate.setUTCHours(0, 0, 0, 0)
        const daysUntilExpiry = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

        for (const rule of expiryRules) {
          if (!rule.daysBeforeExpiry) continue

          const dayRange = [rule.daysBeforeExpiry - 1, rule.daysBeforeExpiry, rule.daysBeforeExpiry + 1]
          const shouldSend = dayRange.includes(daysUntilExpiry)

          if (!shouldSend) continue

          const actionKey = `expiry:${rule.daysBeforeExpiry}`
          try {
            await prisma.automationRunLog.create({
              data: {
                dateKey,
                ruleId: rule.id,
                leadId: lead.id,
                actionKey,
              },
            })
          } catch (error: any) {
            if (error.code === 'P2002') {
              results.skippedDuplicates++
              continue
            }
            throw error
          }

          try {
            if (!lead.contact) {
              results.errors.push(`Lead ${lead.id}: ${rule.name} skipped (no contact)`)
              continue
            }

            const hasPhone = lead.contact?.phone && lead.contact.phone.trim() !== ''
            const hasEmail = lead.contact?.email && lead.contact.email.trim() !== ''

            const message = await generateExpiryReminderMessage(lead as any, rule.daysBeforeExpiry)

            let sendResult
            if (rule.channel === 'whatsapp' && hasPhone) {
              sendResult = await sendWhatsApp(lead as any, lead.contact as any, message)
            } else if (rule.channel === 'email' && hasEmail) {
              sendResult = await sendEmail(
                lead as any,
                lead.contact as any,
                `Expiry Reminder: ${rule.daysBeforeExpiry} Days`,
                message
              )
            } else {
              results.errors.push(
                `Lead ${lead.id}: ${rule.name} skipped (no ${rule.channel === 'whatsapp' ? 'phone' : 'email'})`
              )
              continue
            }

            if (sendResult.success) {
              await prisma.lead.update({
                where: { id: lead.id },
                data: { lastContactAt: now },
              })
              results.expiryRemindersSent++
            } else {
              results.errors.push(`Lead ${lead.id}: ${rule.name} failed to send`)
            }
          } catch (error: any) {
            results.errors.push(`Lead ${lead.id} ${rule.name}: ${error.message}`)
          }
        }
      }
    }

    // ========================================
    // PART B: Follow-up Reminders
    // ========================================
    const followupRules = activeRules.filter((r) => r.type === 'followup_due')

    if (followupRules.length > 0) {
      const allLeads = await prisma.lead.findMany({
        where: {
          pipelineStage: {
            notIn: ['completed', 'lost'],
          },
        },
        include: {
          contact: true,
        },
      })

      for (const lead of allLeads) {
        for (const rule of followupRules) {
          if (!rule.followupAfterDays) continue

          let shouldFollowUp = false

          if (lead.nextFollowUpAt) {
            const followUpDate = new Date(lead.nextFollowUpAt)
            followUpDate.setUTCHours(0, 0, 0, 0)
            if (followUpDate.getTime() <= today.getTime()) {
              shouldFollowUp = true
            }
          }

          if (!shouldFollowUp && lead.lastContactAt) {
            const lastContactDate = new Date(lead.lastContactAt)
            lastContactDate.setUTCDate(lastContactDate.getUTCDate() + rule.followupAfterDays)
            lastContactDate.setUTCHours(0, 0, 0, 0)
            if (lastContactDate.getTime() <= today.getTime()) {
              shouldFollowUp = true
            }
          }

          if (!shouldFollowUp) continue

          const actionKey = `followup`
          try {
            await prisma.automationRunLog.create({
              data: {
                dateKey,
                ruleId: rule.id,
                leadId: lead.id,
                actionKey,
              },
            })
          } catch (error: any) {
            if (error.code === 'P2002') {
              results.skippedDuplicates++
              continue
            }
            throw error
          }

          try {
            const recentMessages = await prisma.communicationLog.findMany({
              where: { leadId: lead.id },
              orderBy: { createdAt: 'desc' },
              take: 3,
            })

            const message = await generateFollowUpMessage(
              lead as any,
              recentMessages.map((m) => ({ channel: m.channel, messageSnippet: m.messageSnippet }))
            )

            if (!lead.contact) {
              results.errors.push(`Lead ${lead.id}: ${rule.name} skipped (no contact)`)
              continue
            }

            const hasPhone = lead.contact?.phone && lead.contact.phone.trim() !== ''
            const hasEmail = lead.contact?.email && lead.contact.email.trim() !== ''

            let sendResult
            if (rule.channel === 'whatsapp' && hasPhone) {
              sendResult = await sendWhatsApp(lead as any, lead.contact as any, message)
            } else if (rule.channel === 'email' && hasEmail) {
              sendResult = await sendEmail(
                lead as any,
                lead.contact as any,
                'Follow-up from Alain Business Center',
                message
              )
            } else {
              results.errors.push(
                `Lead ${lead.id}: ${rule.name} skipped (no ${rule.channel === 'whatsapp' ? 'phone' : 'email'})`
              )
              continue
            }

            if (sendResult.success) {
              const nextFollowUpDate = new Date(now)
              nextFollowUpDate.setUTCDate(nextFollowUpDate.getUTCDate() + rule.followupAfterDays)

              await prisma.lead.update({
                where: { id: lead.id },
                data: {
                  nextFollowUpAt: nextFollowUpDate,
                  lastContactAt: now,
                },
              })

              try {
                await prisma.task.create({
                  data: {
                    leadId: lead.id,
                    title: `Follow-up via ${rule.channel}`,
                    type: rule.channel === 'whatsapp' ? 'whatsapp' : 'email',
                    dueAt: nextFollowUpDate,
                  },
                })
              } catch (taskError) {
                console.warn('Failed to create task:', taskError)
              }

              results.followUpsSent++
            } else {
              results.errors.push(`Lead ${lead.id}: ${rule.name} failed to send`)
            }
          } catch (error: any) {
            results.errors.push(`Lead ${lead.id} ${rule.name}: ${error.message}`)
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      timestamp: now.toISOString(),
      ...results,
    })
  } catch (error: any) {
    console.error('POST /api/automation/run-now error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error?.message ?? 'Unknown error',
      },
      { status: error.statusCode || 500 }
    )
  }
}

