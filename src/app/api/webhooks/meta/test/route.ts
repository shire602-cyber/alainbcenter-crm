/**
 * POST /api/webhooks/meta/test
 * Test endpoint to verify POST requests can reach the webhook handler
 * This helps diagnose if POST requests are being blocked or filtered
 */

import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const timestamp = new Date().toISOString()
  const userAgent = req.headers.get('user-agent') || 'unknown'
  const contentType = req.headers.get('content-type') || 'unknown'
  const method = req.method
  
  console.log('🧪 [WEBHOOK-TEST] Test POST request received', {
    timestamp,
    method,
    userAgent,
    contentType,
    path: req.nextUrl.pathname,
    headers: Object.fromEntries(req.headers.entries()),
  })
  
  try {
    const body = await req.text()
    
    console.log('🧪 [WEBHOOK-TEST] Request body received', {
      bodyLength: body.length,
      bodyPreview: body.substring(0, 500),
    })
    
    let parsedBody = null
    try {
      parsedBody = JSON.parse(body)
    } catch (e) {
      // Not JSON - that's fine for test
    }
    
    return NextResponse.json({
      success: true,
      message: 'Test POST request received successfully',
      timestamp,
      method,
      bodyLength: body.length,
      hasJsonBody: !!parsedBody,
      path: req.nextUrl.pathname,
    })
  } catch (error: any) {
    console.error('🧪 [WEBHOOK-TEST] Error processing test request:', error)
    return NextResponse.json({
      success: false,
      error: error.message,
      timestamp,
    }, { status: 500 })
  }
}

/**
 * GET /api/webhooks/meta/test
 * Test endpoint for GET requests (healthcheck)
 */
export async function GET(req: NextRequest) {
  console.log('🧪 [WEBHOOK-TEST] Test GET request received', {
    timestamp: new Date().toISOString(),
    path: req.nextUrl.pathname,
    method: req.method,
  })
  
  return NextResponse.json({
    success: true,
    message: 'Test endpoint is accessible',
    timestamp: new Date().toISOString(),
    method: 'GET',
  })
}
