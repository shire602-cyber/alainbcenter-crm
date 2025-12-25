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

        // CRITICAL: NO TEMPLATES - Always use AI generation first
        // Try AI generation first (no template fallback)
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
            draftText = aiDraft.text
            // Validate it's not a template
            const lowerText = draftText.toLowerCase()
            const isTemplate = lowerText.includes('thank you for your interest') ||
                              lowerText.includes('to better assist you')
            if (isTemplate) {
              console.error('❌ AI generated template-like message, rejecting')
              throw new Error('AI generated template message - rejected')
            }
          } else {
            throw new Error('AI returned empty draft')
          }
        } catch (aiError) {
          console.error('❌ AI generation failed:', aiError)
          // Minimal fallback - NO template
          const contactName = lead.contact?.fullName || 'there'
          draftText = `Hello ${contactName}! This is a reminder about your renewal. When would you like to proceed?`
        }
      } else if (mode === 'FOLLOW_UP') {
        // CRITICAL: NO TEMPLATES - Always use AI generation
        // Follow-up message - MUST be AI-generated
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
            draftText = aiDraft.text
            // Validate it's not a template
            const lowerText = draftText.toLowerCase()
            const isTemplate = lowerText.includes('thank you for your interest') ||
                              lowerText.includes('looking forward to hearing')
            if (isTemplate) {
              console.error('❌ AI generated template-like message, rejecting')
              throw new Error('AI generated template message - rejected')
            }
          } else {
            throw new Error('AI returned empty draft')
          }
        } catch (aiError) {
          console.error('❌ AI generation failed:', aiError)
          // Minimal fallback - NO template
          const contactName = lead.contact?.fullName || 'there'
          draftText = `Hello ${contactName}! Just checking in. How can I help you today?`
        }
      } else if (mode === 'QUALIFY') {
        // CRITICAL: NO TEMPLATES - Always use AI generation
        // Qualification message - MUST be AI-generated, no templates
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
                name: (() => {
                  const { getGreetingName } = require('@/lib/message-utils')
                  return getGreetingName(lead.contact) || 'there'
                })(),
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
            draftText = aiDraft.text
            // Validate it's not a template
            const lowerText = draftText.toLowerCase()
            const isTemplate = lowerText.includes('thank you for your interest') ||
                              lowerText.includes('looking forward to hearing')
            if (isTemplate) {
              console.error('❌ AI generated template-like message, rejecting')
              throw new Error('AI generated template message - rejected')
            }
          } else {
            throw new Error('AI returned empty draft')
          }
        } catch (aiError) {
          console.error('❌ AI generation failed:', aiError)
          // Minimal fallback - NO template
          const contactName = lead.contact?.fullName || 'there'
          draftText = `Hello ${contactName}! Just checking in. How can I help you today?`
        }
      } else if (mode === 'PRICING') {
        // CRITICAL: NO TEMPLATES - Always use AI generation
        // Pricing inquiry - MUST be AI-generated
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
                name: (() => {
                  const { getGreetingName } = require('@/lib/message-utils')
                  return getGreetingName(lead.contact) || 'there'
                })(),
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
            'professional',
            'en'
          )
          
          if (aiDraft.text) {
            draftText = aiDraft.text
            // Validate it's not a template
            const lowerText = draftText.toLowerCase()
            const isTemplate = lowerText.includes('thank you for your interest') ||
                              lowerText.includes('could you please share')
            if (isTemplate) {
              console.error('❌ AI generated template-like message, rejecting')
              throw new Error('AI generated template message - rejected')
            }
          } else {
            throw new Error('AI returned empty draft')
          }
        } catch (aiError) {
          console.error('❌ AI generation failed:', aiError)
          // Minimal fallback - NO template
          const contactName = lead.contact?.fullName || 'there'
          draftText = `Hello ${contactName}! I can help with pricing. What service are you interested in?`
        }
        
        // OLD TEMPLATE CODE REMOVED - Now using AI only (handled above)
      } else if (mode === 'DOCS') {
        // CRITICAL: NO TEMPLATES - Always use AI generation
        // Document request - MUST be AI-generated
        try {
          const { generateDocsReminderMessage } = await import('@/lib/aiDocsReminder')
          const channelForReminder = channel === 'EMAIL' ? 'EMAIL' : 'WHATSAPP'
          draftText = await generateDocsReminderMessage({
            leadId: lead.id,
            channel: channelForReminder,
          })
          
          // Validate it's not a template
          const lowerText = draftText.toLowerCase()
          const isTemplate = lowerText.includes('thank you for your interest') ||
                            lowerText.includes('to better assist you')
          if (isTemplate) {
            console.error('❌ AI generated template-like message, rejecting')
            throw new Error('AI generated template message - rejected')
          }
        } catch (error) {
          console.error('❌ AI docs reminder failed:', error)
          // Minimal fallback - NO template
          const contactName = lead.contact?.fullName || 'there'
          draftText = `Hello ${contactName}! We need some documents to proceed. What documents do you have available?`
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

