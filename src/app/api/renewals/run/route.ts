import { NextRequest, NextResponse } from 'next/server'
import { requireAdminOrManagerApi } from '@/lib/authApi'
import { runRenewalEngine } from '@/lib/renewals/engine'

/**
 * POST /api/renewals/run
 * Run the renewal engine to scan expiries and create tasks/drafts
 * Auth: ADMIN or MANAGER only
 */
export async function POST(req: NextRequest) {
  try {
    // Get user with proper error handling (already checks for ADMIN or MANAGER)
    let user
    try {
      user = await requireAdminOrManagerApi()
    } catch (authError: any) {
      console.error('Auth error in renewals/run:', authError)
      const statusCode = authError?.statusCode || 401
      return NextResponse.json(
        { error: authError?.message || 'Unauthorized' },
        { status: statusCode }
      )
    }

    // Parse dryRun parameter
    let dryRun = false
    try {
      const { searchParams } = new URL(req.url)
      const dryRunParam = searchParams.get('dryRun')
      dryRun = dryRunParam === 'true' || dryRunParam === '1'
    } catch (urlError: any) {
      console.error('Error parsing URL:', urlError)
      // Continue with default dryRun = false
    }

    // Run renewal engine
    let result
    try {
      result = await runRenewalEngine({ dryRun })
    } catch (engineError: any) {
      console.error('Engine execution error:', engineError)
      return NextResponse.json(
        { 
          error: engineError?.message || 'Failed to run renewal engine',
          details: process.env.NODE_ENV === 'development' ? engineError?.stack : undefined
        },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      dryRun,
      ...result,
    })
  } catch (error: any) {
    console.error('POST /api/renewals/run unexpected error:', error)
    const errorMessage = error?.message || error?.toString() || 'Failed to run renewal engine'
    return NextResponse.json(
      { 
        error: errorMessage,
        details: process.env.NODE_ENV === 'development' ? error?.stack : undefined
      },
      { status: 500 }
    )
  }
}















