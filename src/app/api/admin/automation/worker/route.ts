import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/authApi'
import { getAutomationWorker } from '@/lib/workers/automationWorker'

/**
 * POST /api/admin/automation/worker
 * Start or stop the automation worker
 */
export async function POST(req: NextRequest) {
  try {
    await requireAdminApi()
    
    const body = await req.json().catch(() => ({}))
    const action = body.action || 'start'
    
    const worker = getAutomationWorker()
    
    if (action === 'start') {
      await worker.start()
      return NextResponse.json({ 
        ok: true, 
        message: 'Worker started',
        running: true 
      })
    } else if (action === 'stop') {
      await worker.stop()
      return NextResponse.json({ 
        ok: true, 
        message: 'Worker stopped',
        running: false 
      })
    } else {
      return NextResponse.json({ 
        ok: false, 
        error: 'Invalid action. Use "start" or "stop"' 
      }, { status: 400 })
    }
  } catch (error: any) {
    console.error('Worker API error:', error)
    return NextResponse.json({ 
      ok: false, 
      error: error.message 
    }, { status: 500 })
  }
}

/**
 * GET /api/admin/automation/worker
 * Get worker status and stats
 */
export async function GET() {
  try {
    const worker = getAutomationWorker()
    
    // Initialize worker state from database
    await worker.initialize()
    
    const stats = await worker.getStats()
    
    return NextResponse.json({ 
      ok: true,
      ...stats
    })
  } catch (error: any) {
    console.error('Worker status error:', error)
    return NextResponse.json({ 
      ok: false, 
      error: error.message 
    }, { status: 500 })
  }
}

