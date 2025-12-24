import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/authApi'
import { queueAutomationJob } from '@/lib/automation/queueJob'

/**
 * POST /api/admin/automation/test-job
 * Create a test automation job for testing
 */
export async function POST(req: NextRequest) {
  try {
    await requireAdminApi()
    
    const body = await req.json().catch(() => ({}))
    const { type = 'inbound_message', leadId = 1 } = body
    
    const jobId = await queueAutomationJob(
      type as any,
      {
        leadId,
        message: {
          id: Date.now(),
          direction: 'INBOUND',
          channel: 'whatsapp',
          body: `Test automation job created at ${new Date().toISOString()}`,
          createdAt: new Date().toISOString(),
        },
      },
      {
        priority: 10,
        maxRetries: 3,
      }
    )
    
    return NextResponse.json({
      ok: true,
      jobId,
      message: 'Test job created successfully',
    })
  } catch (error: any) {
    console.error('Test job creation error:', error)
    return NextResponse.json({
      ok: false,
      error: error.message,
    }, { status: 500 })
  }
}

