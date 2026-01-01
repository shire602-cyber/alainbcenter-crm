import { NextResponse } from 'next/server'

/**
 * GET /api/health
 * Returns build information for deployment verification
 * STEP 0: This endpoint provides proof of deployment version
 */
export async function GET() {
  let buildId = process.env.NEXT_PUBLIC_BUILD_ID || 
                process.env.VERCEL_GIT_COMMIT_SHA?.substring(0, 7) || 
                'unknown'
  
  // Try to get git SHA if not in env (for local dev)
  if (buildId === 'unknown' && typeof process !== 'undefined') {
    try {
      const { execSync } = require('child_process')
      buildId = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim()
    } catch {
      // Ignore errors - buildId stays 'unknown'
    }
  }

  const buildTime = process.env.BUILD_TIME || 
                    process.env.VERCEL ? new Date().toISOString() : 
                    'unknown'

  return NextResponse.json({
    ok: true,
    buildId,
    buildTime,
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
  })
}
