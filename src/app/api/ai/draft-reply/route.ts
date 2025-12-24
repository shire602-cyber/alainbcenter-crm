import { NextRequest, NextResponse } from 'next/server'
import { requireAuthApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'
import { buildConversationContext } from '@/lib/ai/context'
import { generateDraftReply } from '@/lib/ai/generate'
import { detectLanguage } from '@/lib/utils/languageDetection'

// POST /api/ai/draft-reply
// Input: leadId or conversationId, objective (qualify|renewal|followup|pricing|docs_request)
// Output: draftText, tone, language, nextQuestions array
export async function POST(req: NextRequest) {
  try {
    // Allow automation calls with CRON_SECRET, otherwise require auth
    const cronSecret = req.headers.get('x-cron-secret')
    const expectedSecret = process.env.CRON_SECRET
    let user = null
    
    if (cronSecret && expectedSecret && cronSecret === expectedSecret) {
      // Automation call - use admin user as fallback
      user = await prisma.user.findFirst({
        where: { role: 'ADMIN' }
      })
      if (!user) {
        return NextResponse.json(
          { error: 'No admin user found for automation' },
          { status: 500 }
        )
      }
    } else {
      // Regular API call - require authentication
      user = await requireAuthApi()
    }
    
    const body = await req.json()

    const { leadId, conversationId, objective = 'followup' } = body

    // Validate input
    if (!leadId && !conversationId) {
      return NextResponse.json(
        { error: 'Either leadId or conversationId is required' },
        { status: 400 }
      )
    }

    const validObjectives = ['qualify', 'renewal', 'followup', 'pricing', 'docs_request', 'remind', 'book_call']
    if (!validObjectives.includes(objective)) {
      return NextResponse.json(
        { error: `objective must be one of: ${validObjectives.join(', ')}` },
        { status: 400 }
      )
    }

    let resolvedConversationId: number | null = null
    let resolvedLeadId: number | null = null
    let resolvedContactId: number | null = null
    let conversation: any = null
    let lead: any = null

    // Resolve IDs
    if (conversationId) {
      conversation = await prisma.conversation.findUnique({
        where: { id: parseInt(conversationId) },
        include: {
          contact: true,
          lead: {
            select: {
              id: true,
              stage: true,
              pipelineStage: true,
              leadType: true,
              serviceTypeId: true,
              priority: true,
              aiScore: true,
              aiNotes: true,
              nextFollowUpAt: true,
              lastContactAt: true,
              expiryDate: true,
              // Exclude infoSharedAt, quotationSentAt, lastInfoSharedType for now
            },
          }
        }
      })
      
      if (!conversation) {
        return NextResponse.json(
          { error: 'Conversation not found' },
          { status: 404 }
        )
      }
      
      resolvedConversationId = conversation.id
      resolvedContactId = conversation.contactId
      resolvedLeadId = conversation.leadId
    } else if (leadId) {
      lead = await prisma.lead.findUnique({
        where: { id: parseInt(leadId) },
        include: {
          contact: true,
          conversations: {
            orderBy: { lastMessageAt: 'desc' },
            take: 1
          }
        }
      })
      
      if (!lead) {
        return NextResponse.json(
          { error: 'Lead not found' },
          { status: 404 }
        )
      }
      
      resolvedLeadId = lead.id
      resolvedContactId = lead.contactId
      resolvedConversationId = lead.conversations[0]?.id || null
    }

    // Build context (use conversation if available, otherwise build from lead)
    let contextSummary: any
    if (resolvedConversationId) {
      contextSummary = await buildConversationContext(resolvedConversationId)
    } else {
      // Build context from lead data
      const contact = await prisma.contact.findUnique({
        where: { id: resolvedContactId! },
        include: {
          leads: {
            orderBy: { createdAt: 'desc' },
            take: 5
          },
          expiryItems: {
            orderBy: { expiryDate: 'asc' },
            take: 5
          }
        }
      })
      
      contextSummary = {
        structured: {
          contact: {
            name: contact?.fullName,
            phone: contact?.phone,
            email: contact?.email,
            nationality: contact?.nationality
          },
          lead: lead ? {
            id: lead.id,
            stage: lead.stage || lead.pipelineStage,
            priority: lead.priority,
            serviceType: lead.serviceTypeEnum || lead.serviceType?.name,
            notes: lead.notes,
            aiScore: lead.aiScore,
            aiNotes: lead.aiNotes,
            nextFollowUpAt: lead.nextFollowUpAt,
            lastContactAt: lead.lastContactAt
          } : null,
          expiries: contact?.expiryItems || []
        },
        text: `Contact: ${contact?.fullName} (${contact?.phone}). Lead: ${lead?.stage || 'N/A'}. Notes: ${lead?.notes || 'None'}`
      }
    }

    // RETRIEVER-FIRST CHAIN: Check if AI can respond to this query
    // Get the user's query from recent messages
    // Check for both 'INBOUND' and 'inbound' for backward compatibility with existing data
    let userQuery = ''
    if (resolvedConversationId) {
      const lastMessage = await prisma.message.findFirst({
        where: { 
          conversationId: resolvedConversationId,
          OR: [
            { direction: 'INBOUND' },
            { direction: 'inbound' },
            { direction: 'IN' }, // Legacy support
          ],
        },
        orderBy: { createdAt: 'desc' },
        select: { body: true },
      })
      userQuery = lastMessage?.body || ''
    }
    if (!userQuery) {
      userQuery = contextSummary.structured.lead?.notes || contextSummary.text || ''
    }

    // Use retriever-first chain to check if we can respond
    const { retrieveAndGuard, markLeadRequiresHuman } = await import('@/lib/ai/retrieverChain')
    const retrievalResult = await retrieveAndGuard(userQuery, {
      similarityThreshold: parseFloat(process.env.AI_SIMILARITY_THRESHOLD || '0.7'),
      topK: 5,
    })

    // If AI cannot respond, mark lead and return polite message
    if (!retrievalResult.canRespond) {
      if (resolvedLeadId) {
        await markLeadRequiresHuman(resolvedLeadId, retrievalResult.reason, userQuery)
      }

      return NextResponse.json({
        error: retrievalResult.reason,
        requiresTraining: true,
        requiresHuman: true,
        suggestedResponse: retrievalResult.suggestedResponse || "I'm only trained to assist with specific business topics. Let me get a human agent for you.",
      }, { status: 400 })
    }

    // Determine tone and language based on objective
    let tone = 'professional'
    if (objective === 'followup' || objective === 'qualify') {
      tone = 'friendly'
    }

    // Build training context from retrieved documents
    const relevantTraining = retrievalResult.relevantDocuments
      .map(doc => `${doc.title} (${doc.type}, similarity: ${doc.similarity.toFixed(2)}):\n${doc.content}`)
      .join('\n\n---\n\n')

    // Generate draft based on objective
    let draftText = ''
    let nextQuestions: string[] = []

    // For now, use template-based approach (can be enhanced with OpenAI later)
    const contactName = contextSummary.structured.contact?.name || 'there'
    const leadStage = contextSummary.structured.lead?.stage || 'NEW'
    
    // Use training documents to enhance the response
    const trainingContext = relevantTraining 
      ? `\n\nTraining Guidelines:\n${relevantTraining}\n\nUse the above training to guide your response.`
      : ''

    switch (objective) {
      case 'qualify':
        // Check if this is first message (no previous outbound messages)
        let outboundCount = 0
        if (resolvedConversationId) {
          outboundCount = await prisma.message.count({
            where: {
              conversationId: resolvedConversationId,
              direction: 'OUTBOUND',
            },
          })
        }
        
        if (outboundCount === 0) {
          // First message - greet and collect basic info
          draftText = `Hello! 👋 Welcome to Al Ain Business Center. I'm here to help you with UAE business setup and visa services.\n\nTo get started, could you please share:\n1. Your full name\n2. What service do you need? (e.g., Family Visa, Business Setup, Employment Visa)\n3. Your nationality\n\nI'll connect you with the right specialist!${trainingContext}`
          nextQuestions = [
            'What is your full name?',
            'What service are you interested in?',
            'What is your nationality?'
          ]
        } else {
          // Follow-up message
          draftText = `Hi ${contactName}, thank you for your interest in our services. To better assist you, could you please share:\n\n1. What specific service are you looking for?\n2. What is your timeline?\n3. Do you have any specific requirements?\n\nLooking forward to helping you!${trainingContext}`
          nextQuestions = [
            'What specific service are you interested in?',
            'What is your timeline?',
            'Do you have any specific requirements?'
          ]
        }
        break
      
      case 'renewal':
        const nearestExpiry = contextSummary.structured.expiries?.[0]
        if (nearestExpiry) {
          draftText = `Hi ${contactName}, I hope this message finds you well. I noticed that your ${nearestExpiry.type} is expiring soon. Would you like to proceed with renewal? We can help you complete the process smoothly.`
        } else {
          draftText = `Hi ${contactName}, I wanted to check in regarding your upcoming renewals. Is there anything we can help you with?`
        }
        nextQuestions = [
          'Would you like to proceed with renewal?',
          'Do you have all required documents?',
          'What is your preferred timeline?'
        ]
        break
      
      case 'followup':
        draftText = `Hi ${contactName}, I wanted to follow up on our previous conversation. How can we assist you further? Please let me know if you have any questions.`
        nextQuestions = [
          'Do you have any questions?',
          'Would you like to schedule a call?',
          'What is the best time to reach you?'
        ]
        break
      
      case 'pricing':
        draftText = `Hi ${contactName}, thank you for your interest. I'd be happy to provide you with detailed pricing information. Could you please let me know which service you're interested in, and I'll send you a customized quote?`
        nextQuestions = [
          'Which service are you interested in?',
          'What is your budget range?',
          'Do you need any add-on services?'
        ]
        break
      
      case 'docs_request':
        draftText = `Hi ${contactName}, to proceed with your application, we'll need the following documents:\n\n1. Passport copy\n2. Photo\n3. Emirates ID (if applicable)\n\nPlease share these documents when convenient. If you have any questions, feel free to ask!`
        nextQuestions = [
          'Do you have all required documents?',
          'When can you provide the documents?',
          'Do you need help with any specific document?'
        ]
        break
      
      case 'remind':
        const nearestExpiryRemind = contextSummary.structured.expiries?.[0]
        if (nearestExpiryRemind) {
          draftText = `Hi ${contactName}, this is a friendly reminder about your upcoming ${nearestExpiryRemind.type} expiry. We're here to help you renew on time. Would you like to proceed?`
        } else {
          draftText = `Hi ${contactName}, this is a friendly reminder about your pending follow-up. Is there anything we can help you with today?`
        }
        nextQuestions = [
          'Would you like to proceed?',
          'Do you have any questions?',
          'What is the best time to reach you?'
        ]
        break
      
      case 'book_call':
        draftText = `Hi ${contactName}, I'd love to schedule a call with you to discuss your needs in detail. Would you be available for a quick call? Please let me know your preferred time, and I'll arrange it.`
        nextQuestions = [
          'What is your preferred time?',
          'Which day works best for you?',
          'Do you prefer morning or afternoon?'
        ]
        break
    }

    // Auto-detect language (simplified - can be enhanced)
    const language = 'en' // Default to English, can be enhanced with detection

    // Ensure we have a conversationId (required by schema)
    // If we don't have one, create a conversation first
    let finalConversationId = resolvedConversationId
    if (!finalConversationId && resolvedLeadId && resolvedContactId) {
      // Create a conversation if we don't have one
      const newConversation = await prisma.conversation.create({
        data: {
          contactId: resolvedContactId,
          leadId: resolvedLeadId,
          channel: 'whatsapp', // Default channel
        },
      })
      finalConversationId = newConversation.id
    }

    if (!finalConversationId) {
      return NextResponse.json(
        { error: 'Unable to create draft: conversation or lead required' },
        { status: 400 }
      )
    }

    // Save draft
    const draft = await prisma.aIDraft.create({
      data: {
        conversationId: finalConversationId,
        leadId: resolvedLeadId ?? undefined,
        contactId: resolvedContactId ?? undefined,
        tone,
        language,
        promptVersion: 'v1',
        inputSummary: contextSummary.text.substring(0, 500),
        draftText,
        createdByUserId: user.id,
      },
    })

    // Log action
    await prisma.aIActionLog.create({
      data: {
        kind: 'draft_reply',
        conversationId: finalConversationId,
        leadId: resolvedLeadId ?? undefined,
        contactId: resolvedContactId ?? undefined,
        ok: true,
        meta: JSON.stringify({
          objective,
          tone,
          language,
          model: 'template-v1', // Can be upgraded to OpenAI later
        }),
      },
    })

    return NextResponse.json({
      draftText,
      tone,
      language,
      nextQuestions,
      draftId: draft.id
    })
  } catch (error: any) {
    console.error('POST /api/ai/draft-reply error:', error)

    // Log failed action
    try {
      const body = await req.json().catch(() => ({}))
      await prisma.aIActionLog.create({
        data: {
          kind: 'draft_reply',
          conversationId: body.conversationId || 0,
          ok: false,
          error: error.message || 'Unknown error',
        },
      })
    } catch (logError) {
      // Ignore logging errors
    }

    return NextResponse.json(
      { error: error.message || 'Failed to generate draft reply' },
      { status: 500 }
    )
  }
}




