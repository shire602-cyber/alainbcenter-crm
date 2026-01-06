import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * POST /api/debug/prisma-message-write
 * 
 * Tests Prisma Message.create() with ONLY required fields (no providerMediaId)
 * Returns success/error as string
 */
export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const providedConversationId = searchParams.get('conversationId')
    
    let conversationId: number
    
    if (providedConversationId) {
      conversationId = parseInt(providedConversationId)
      const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
      })
      
      if (!conversation) {
        return NextResponse.json({
          success: false,
          error: `Conversation ${conversationId} not found`,
        }, { status: 404 })
      }
    } else {
      // Find any existing conversation
      const existingConversation = await prisma.conversation.findFirst({
        orderBy: { createdAt: 'desc' },
        take: 1,
      })
      
      if (existingConversation) {
        conversationId = existingConversation.id
      } else {
        // Create minimal test conversation
        let contact = await prisma.contact.findFirst({
          where: { 
            phone: { 
              not: null,
            } as any,
          },
          take: 1,
        })
        
        if (!contact) {
          contact = await prisma.contact.create({
            data: {
              fullName: 'Test Contact (Debug)',
              phone: '+971501234567',
            },
          })
        }
        
        const testConversation = await prisma.conversation.create({
          data: {
            contactId: contact.id,
            channel: 'whatsapp',
            status: 'OPEN',
          },
        })
        
        conversationId = testConversation.id
      }
    }
    
    // Create test message with ONLY required fields (no providerMediaId)
    const testMessage = await prisma.message.create({
      data: {
        conversationId,
        direction: 'INBOUND',
        channel: 'whatsapp',
        type: 'text',
        body: 'Test message (no providerMediaId)',
        status: 'RECEIVED',
      },
    })
    
    // Clean up immediately
    try {
      await prisma.message.delete({
        where: { id: testMessage.id },
      })
    } catch (cleanupError) {
      // Non-critical
    }
    
    return NextResponse.json({
      success: true,
      error: null,
    })
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message || 'Unknown error',
    }, { status: 500 })
  }
}

