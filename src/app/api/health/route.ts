import { NextResponse } from 'next/server'

/**
 * GET /api/health
 * Simple health check endpoint to verify server is running
 */
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    message: 'Server is running',
  })
}












