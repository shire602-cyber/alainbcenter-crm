/**
 * POST /api/leads/[id]/messages/ai-draft
 * 
 * Generate AI draft message based on lead context and mode
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAuthApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'
import { generateDraftReply } from '@/lib/ai/generate'
import { interpolateTemplate } from '@/lib/templateInterpolation'
import { format, differenceInDays, parseISO } from 'date-fns'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuthApi()
    const resolvedParams = await params
    const leadId = parseInt(resolvedParams.id)

    if (isNaN(leadId)) {
      return NextResponse.json(
        { ok: false, error: 'Invalid lead ID' },
        { status: 400 }
      )
    }

    let body
    try {
      body = await req.json()
    } catch (jsonError) {
      return NextResponse.json(
        { ok: false, error: 'Invalid JSON body' },
        { status: 400 }
      )
    }
    const { mode, channel } = body

    const validModes = ['FOLLOW_UP', 'QUALIFY', 'RENEWAL', 'PRICING', 'DOCS']
    if (!mode || !validModes.includes(mode)) {
      return NextResponse.json(
        { ok: false, error: `Invalid mode. Must be one of: ${validModes.join(', ')}` },
        { status: 400 }
      )
    }

    // Load lead with all relations
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      include: {
        contact: true,
        serviceType: true,
        expiryItems: {
          orderBy: {
            expiryDate: 'asc',
          },
        },
        messages: {
          where: channel && typeof channel === 'string'
            ? {
                conversation: {
                  channel: channel === 'EMAIL' 
                    ? 'email' 
                    : channel === 'WHATSAPP' 
                    ? 'whatsapp' 
                    : channel.toLowerCase(),
                },
              }
            : undefined,
          orderBy: {
            createdAt: 'desc',
          },
          take: 10,
        },
        conversations: {
          where: channel
            ? {
                channel: channel.toLowerCase(),
              }
            : undefined,
          include: {
            messages: {
              orderBy: {
                createdAt: 'desc',
              },
              take: 10,
            },
          },
        },
      },
    })

    if (!lead) {
      return NextResponse.json(
        { ok: false, error: 'Lead not found' },
        { status: 404 }
      )
    }

    // Build context for AI generation
    const recentMessages = lead.messages.slice(0, 10).map((m) => ({
      direction: m.direction,
      channel: m.channel,
      body: m.body || '',
      createdAt: m.createdAt,
    }))

    // Generate draft based on mode
    let draftText = ''

    try {
      if (mode === 'RENEWAL') {
        // Renewal-specific message
        const nearestExpiry = lead.expiryItems?.[0]
        if (!nearestExpiry) {
          return NextResponse.json(
            { ok: false, error: 'No expiry items found for this lead' },
            { status: 400 }
          )
        }

        const daysLeft = differenceInDays(parseISO(nearestExpiry.expiryDate.toString()), new Date())
        const isExpired = daysLeft < 0

        // Build renewal prompt
        const renewalTemplate = isExpired
          ? `Hi {name}, your {service} expired ${Math.abs(daysLeft)} days ago. We can help you renew quickly. Would you like to proceed?`
          : daysLeft <= 7
          ? `Hi {name}, URGENT: Your {service} expires in {expiry_days} days. Let's renew it now to avoid any issues.`
          : daysLeft <= 30
          ? `Hi {name}, your {service} expires in {expiry_days} days. We're here to help with renewal. Interested?`
          : `Hi {name}, your {service} expires on {expiry_date}. We can help renew it smoothly. Shall we proceed?`

        draftText = interpolateTemplate(renewalTemplate, { lead })

        // Try OpenAI enhancement if available
        try {
          const aiContext = {
            lead: {
              id: lead.id,
              contact: lead.contact,
              serviceType: lead.serviceType,
              stage: lead.stage,
            },
            recentMessages,
            expiry: {
              type: nearestExpiry.type,
              date: nearestExpiry.expiryDate,
              daysLeft,
              isExpired,
            },
          }

          // Use existing AI generation - map to ConversationContext format
          const aiDraft = await generateDraftReply(
            {
              messages: recentMessages.map((m) => ({
                direction: m.direction === 'INBOUND' || m.direction === 'IN' ? 'inbound' : 'outbound',
                message: m.body || '',
                channel: m.channel || 'whatsapp',
                createdAt: m.createdAt,
              })),
              lead: {
                id: lead.id,
                leadType: lead.leadType,
                serviceType: lead.serviceType?.name || null,
                status: lead.status,
                pipelineStage: lead.pipelineStage,
                expiryDate: lead.expiryDate,
                nextFollowUpAt: lead.nextFollowUpAt,
                aiScore: lead.aiScore,
                aiNotes: lead.aiNotes,
              },
              contact: {
                name: lead.contact.fullName,
                phone: lead.contact.phone,
                email: lead.contact.email,
                nationality: lead.contact.nationality,
              },
              companyIdentity: 'Alain Business Center – UAE business setup & visa services',
            },
            'professional',
            'en'
          )

          if (aiDraft.text) {
            draftText = interpolateTemplate(aiDraft.text, { lead })
          }
        } catch (aiError) {
          console.warn('AI generation failed, using template:', aiError)
          // Continue with template
        }
      } else if (mode === 'FOLLOW_UP') {
        // Follow-up message
        const template = `Hi {name}, 

Thank you for your interest in {service}. I wanted to follow up and see if you have any questions or if we can help you move forward.

Looking forward to hearing from you!

Best regards,
Alain Business Center`

        draftText = interpolateTemplate(template, { lead })

        // Try OpenAI enhancement
        try {
          const aiDraft = await generateDraftReply(
            {
              messages: recentMessages.map((m) => ({
                direction: m.direction === 'INBOUND' || m.direction === 'IN' ? 'inbound' : 'outbound',
                message: m.body || '',
                channel: m.channel || 'whatsapp',
                createdAt: m.createdAt,
              })),
              lead: {
                id: lead.id,
                leadType: lead.leadType,
                serviceType: lead.serviceType?.name || null,
                status: lead.status,
                pipelineStage: lead.pipelineStage,
                expiryDate: lead.expiryDate,
                nextFollowUpAt: lead.nextFollowUpAt,
                aiScore: lead.aiScore,
                aiNotes: lead.aiNotes,
              },
              contact: {
                name: lead.contact.fullName,
                phone: lead.contact.phone,
                email: lead.contact.email,
                nationality: lead.contact.nationality,
              },
              companyIdentity: 'Alain Business Center – UAE business setup & visa services',
            },
            'friendly',
            'en'
          )

          if (aiDraft.text) {
            draftText = interpolateTemplate(aiDraft.text, { lead })
          }
        } catch (aiError) {
          console.warn('AI generation failed, using template:', aiError)
        }
      } else if (mode === 'QUALIFY') {
        // Qualification message
        const template = `Hi {name},

Thank you for your interest in {service}. To better assist you, I'd like to ask a few questions:

1. What specific service do you need?
2. What is your nationality?
3. Are you currently in UAE?

Please share these details, and I'll provide you with the best solution!

Best regards,
Alain Business Center`

        draftText = interpolateTemplate(template, { lead })

        // Try OpenAI for more personalized questions
        try {
          const aiDraft = await generateDraftReply(
            {
              messages: recentMessages.map((m) => ({
                direction: m.direction === 'INBOUND' || m.direction === 'IN' ? 'inbound' : 'outbound',
                message: m.body || '',
                channel: m.channel || 'whatsapp',
                createdAt: m.createdAt,
              })),
              contact: {
                name: lead.contact?.fullName || 'Unknown',
                phone: lead.contact?.phone || '',
                email: lead.contact?.email || null,
                nationality: lead.contact?.nationality || null,
              },
              lead: {
                id: lead.id,
                leadType: lead.leadType,
                serviceType: lead.serviceType?.name || null,
                status: lead.status,
                pipelineStage: lead.pipelineStage,
                expiryDate: lead.expiryDate,
                nextFollowUpAt: lead.nextFollowUpAt,
                aiScore: lead.aiScore,
                aiNotes: lead.aiNotes,
              },
              companyIdentity: 'Alain Business Center',
            },
            'friendly',
            'en'
          )

          if (aiDraft.text) {
            draftText = interpolateTemplate(aiDraft.text, { lead })
          }
        } catch (aiError) {
          console.warn('AI generation failed, using template:', aiError)
        }
      } else if (mode === 'PRICING') {
        // Pricing inquiry
        const template = `Hi {name},

Thank you for your interest in {service} pricing.

I'd be happy to provide you with a detailed quote. To give you the most accurate pricing, could you please share:

1. Specific service requirements
2. Your nationality
3. Timeline for completion

Once I have these details, I'll send you a customized quote right away!

Best regards,
Alain Business Center`

        draftText = interpolateTemplate(template, { lead })
      } else if (mode === 'DOCS') {
        // Document request - use AI helper if available
        try {
          const { generateDocsReminderMessage } = await import('@/lib/aiDocsReminder')
          const channelForReminder = channel === 'EMAIL' ? 'EMAIL' : 'WHATSAPP'
          draftText = await generateDocsReminderMessage({
            leadId: lead.id,
            channel: channelForReminder,
          })
        } catch (error) {
          // Fallback to template if AI helper fails
          console.warn('AI docs reminder failed, using template:', error)
          const template = `Hi {name},

To proceed with your {service}, we'll need the following documents:

• Passport copy
• Emirates ID copy (if available)
• Photo
• Other required documents

Please upload these documents when convenient, or let me know if you have any questions.

Best regards,
Alain Business Center`

          draftText = interpolateTemplate(template, { lead })
        }
      }

      // Save AI draft to database
      try {
        const conversation = lead.conversations?.[0]
        if (conversation) {
          await prisma.aIDraft.create({
            data: {
              conversationId: conversation.id,
              leadId: lead.id,
              contactId: lead.contactId,
              tone: mode === 'RENEWAL' ? 'professional' : 'friendly',
              language: 'en',
              promptVersion: 'v1',
              inputSummary: `Mode: ${mode}, Channel: ${channel || 'any'}`,
              draftText,
              createdByUserId: user.id,
            },
          })
        }
      } catch (draftError) {
        // Draft saving is not critical - continue
        console.warn('Failed to save AI draft:', draftError)
      }

      return NextResponse.json({
        ok: true,
        draft: draftText,
        mode,
        channel: channel || null,
      })
    } catch (error: any) {
      console.error('Error generating AI draft:', error)
      return NextResponse.json(
        {
          ok: false,
          error: error.message || 'Failed to generate draft',
          draft: '', // Return empty draft on error
        },
        { status: 500 }
      )
    }
  } catch (error: any) {
    console.error('Error in AI draft endpoint:', error)
    return NextResponse.json(
      { ok: false, error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

