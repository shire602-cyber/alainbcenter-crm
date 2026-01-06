import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * POST /api/debug/prisma-message-write-media
 * 
 * Tests Prisma Message.create() WITH providerMediaId field
 * This proves whether production Prisma client accepts providerMediaId
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
    
    // CRITICAL TEST: Create message WITH providerMediaId
    // This will fail if Prisma client doesn't know about providerMediaId field
    const testMessage = await prisma.message.create({
      data: {
        conversationId,
        direction: 'INBOUND',
        channel: 'whatsapp',
        type: 'text',
        body: 'Test message with providerMediaId',
        status: 'RECEIVED',
        providerMediaId: '123456789', // Test field - will error if schema mismatch
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
    // Capture the exact error message
    const errorMessage = error.message || 'Unknown error'
    
    // Check if it's the "Unknown argument providerMediaId" error
    const isProviderMediaIdError = errorMessage.includes('providerMediaId') || 
                                   errorMessage.includes('Unknown argument')
    
    return NextResponse.json({
      success: false,
      error: errorMessage,
      isProviderMediaIdError,
    }, { status: 500 })
  }
}

