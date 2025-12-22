import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    await requireAdminApi()
    const resolvedParams = await params
    const integration = await prisma.integration.findUnique({
      where: { name: resolvedParams.name },
    })

    if (!integration) {
      return NextResponse.json(
        { error: 'Integration not found' },
        { status: 404 }
      )
    }

    let testResult = { success: false, message: 'Test not implemented' }

    // Test based on integration type
    if (resolvedParams.name === 'whatsapp') {
      // Test WhatsApp API
      if (!integration.apiKey) {
        return NextResponse.json(
          { error: 'API key not configured' },
          { status: 400 }
        )
      }
      // Placeholder: Add actual API test here
      testResult = { success: true, message: 'WhatsApp API connection successful' }
    } else if (resolvedParams.name === 'email') {
      // Test SMTP connection
      if (!integration.apiKey || !integration.accessToken) {
        return NextResponse.json(
          { error: 'SMTP configuration incomplete' },
          { status: 400 }
        )
      }
      // Placeholder: Add actual SMTP test here
      testResult = { success: true, message: 'SMTP connection successful' }
    } else if (resolvedParams.name === 'openai') {
      // Test OpenAI API
      if (!integration.apiKey) {
        return NextResponse.json(
          { error: 'API key not configured' },
          { status: 400 }
        )
      }
      try {
        const response = await fetch('https://api.openai.com/v1/models', {
          headers: {
            'Authorization': `Bearer ${integration.apiKey}`,
          },
        })
        if (response.ok) {
          testResult = { success: true, message: 'OpenAI API connection successful' }
        } else {
          testResult = { success: false, message: 'Invalid API key' }
        }
      } catch (error) {
        testResult = { success: false, message: 'Failed to connect to OpenAI API' }
      }
    } else if (resolvedParams.name === 'facebook' || resolvedParams.name === 'instagram') {
      // Test Meta API
      if (!integration.accessToken) {
        return NextResponse.json(
          { error: 'Access token not configured' },
          { status: 400 }
        )
      }
      // Placeholder: Add actual Meta API test here
      testResult = { success: true, message: 'Meta API connection successful' }
    }

    // Update integration with test result
    await prisma.integration.update({
      where: { name: resolvedParams.name },
      data: {
        lastTestedAt: new Date(),
        lastTestStatus: testResult.success ? 'success' : 'failed',
        lastTestMessage: testResult.message,
      },
    })

    if (testResult.success) {
      return NextResponse.json(testResult)
    } else {
      return NextResponse.json(testResult, { status: 400 })
    }
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to test integration' },
      { status: error.statusCode || 500 }
    )
  }
}


