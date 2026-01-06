import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * POST /api/debug/prisma-message-create
 * 
 * Debug endpoint to test Prisma Message.create() and verify schema alignment
 * Attempts to create a test message with minimal required fields
 * 
 * Query params:
 * - conversationId: (optional) Use existing conversation ID, or will find/create one
 */
export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const providedConversationId = searchParams.get('conversationId')
    
    let conversationId: number
    
    if (providedConversationId) {
      // Use provided conversation ID
      conversationId = parseInt(providedConversationId)
      
      // Verify it exists
      const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
      })
      
      if (!conversation) {
        return NextResponse.json({
          ok: false,
          error: `Conversation ${conversationId} not found`,
          timestamp: new Date().toISOString(),
        }, { status: 404 })
      }
    } else {
      // Find or create a test conversation
      // Try to find any existing conversation first
      const existingConversation = await prisma.conversation.findFirst({
        orderBy: { createdAt: 'desc' },
        take: 1,
      })
      
      if (existingConversation) {
        conversationId = existingConversation.id
      } else {
        // Create a minimal test conversation
        // First, get or create a test contact
        let contact = await prisma.contact.findFirst({
          where: { 
            phone: { 
              not: null,
            } as any,
          },
          take: 1,
        })
        
        if (!contact) {
          // Create a minimal test contact
          contact = await prisma.contact.create({
            data: {
              fullName: 'Test Contact (Debug)',
              phone: '+971501234567',
            },
          })
        }
        
        // Create test conversation
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
    
    // Attempt to create a test message
    const testMessage = await prisma.message.create({
      data: {
        conversationId,
        direction: 'INBOUND',
        channel: 'whatsapp',
        type: 'text',
        body: 'Test message from debug endpoint',
        status: 'RECEIVED',
      },
    })
    
    // Clean up: delete the test message immediately
    try {
      await prisma.message.delete({
        where: { id: testMessage.id },
      })
    } catch (cleanupError) {
      // Non-critical - log but don't fail
      console.warn('[DEBUG] Failed to cleanup test message:', cleanupError)
    }
    
    return NextResponse.json({
      ok: true,
      success: true,
      message: 'Message.create() succeeded',
      testMessageId: testMessage.id,
      conversationId,
      timestamp: new Date().toISOString(),
    })
  } catch (error: any) {
    // Capture detailed error information
    const errorDetails: any = {
      ok: false,
      success: false,
      error: error.message || 'Unknown error',
      errorCode: error.code || null,
      errorName: error.name || null,
      timestamp: new Date().toISOString(),
    }
    
    // Add Prisma-specific error details if available
    if (error.meta) {
      errorDetails.meta = error.meta
    }
    
    // Add stack trace in development
    if (process.env.NODE_ENV === 'development') {
      errorDetails.stack = error.stack
    }
    
    return NextResponse.json(errorDetails, { status: 500 })
  }
}

/**
 * GET /api/debug/prisma-message-create
 * 
 * Returns information about the endpoint without creating a message
 */
export async function GET() {
  try {
    // Find an existing conversation for reference
    const conversation = await prisma.conversation.findFirst({
      orderBy: { createdAt: 'desc' },
      take: 1,
      select: {
        id: true,
        channel: true,
        contactId: true,
      },
    })
    
    return NextResponse.json({
      ok: true,
      message: 'Use POST to test message creation',
      exampleConversationId: conversation?.id || null,
      usage: {
        method: 'POST',
        url: '/api/debug/prisma-message-create',
        queryParams: {
          conversationId: 'optional - use existing conversation ID',
        },
      },
      timestamp: new Date().toISOString(),
    })
  } catch (error: any) {
    return NextResponse.json({
      ok: false,
      error: error.message || 'Unknown error',
      timestamp: new Date().toISOString(),
    }, { status: 500 })
  }
}

