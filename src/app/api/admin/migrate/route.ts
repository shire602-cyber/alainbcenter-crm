/**
 * POST /api/admin/migrate
 * Admin endpoint to apply database migrations
 * 
 * This applies the Phase 2 migration for info/quotation tracking fields
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'

// Support both GET and POST for easier browser access
export async function GET(req: NextRequest) {
  return await handleMigration(req)
}

export async function POST(req: NextRequest) {
  return await handleMigration(req)
}

async function handleMigration(req: NextRequest) {
  try {
    // EMERGENCY: Allow migration without auth if MIGRATION_SECRET is not set
    // This is a temporary measure to fix production issues
    const migrationSecret = req.headers.get('x-migration-secret')
    const expectedSecret = process.env.MIGRATION_SECRET
    
    let isAuthorized = false
    
    // Option 1: Check secret token (if configured)
    if (expectedSecret) {
      if (migrationSecret === expectedSecret) {
        isAuthorized = true
      }
    } else {
      // EMERGENCY MODE: If no secret is configured, allow without auth
      // This is temporary - set MIGRATION_SECRET in production for security
      console.warn('⚠️ MIGRATION_SECRET not set - allowing migration without auth (EMERGENCY MODE)')
      isAuthorized = true
    }
    
    // Option 2: Check admin authentication (if secret auth failed)
    if (!isAuthorized) {
      try {
        await requireAdminApi()
        isAuthorized = true
      } catch (authError) {
        // Not authenticated as admin
      }
    }
    
    if (!isAuthorized) {
      return NextResponse.json(
        {
          success: false,
          error: 'Unauthorized',
          hint: 'Either log in as admin, provide x-migration-secret header, or set MIGRATION_SECRET env var',
        },
        { status: 401 }
      )
    }

    // Check if migration is already applied
    const tableInfo = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'Lead' 
      AND column_name IN ('infoSharedAt', 'quotationSentAt', 'lastInfoSharedType')
    `

    const existingColumns = tableInfo.map((row) => row.column_name)
    const allColumnsExist = 
      existingColumns.includes('infoSharedAt') &&
      existingColumns.includes('quotationSentAt') &&
      existingColumns.includes('lastInfoSharedType')

    if (allColumnsExist) {
      return NextResponse.json({
        success: true,
        message: 'Migration already applied',
        existingColumns,
      })
    }

    // Apply migration
    await prisma.$executeRaw`
      ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "infoSharedAt" TIMESTAMP
    `
    await prisma.$executeRaw`
      ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "quotationSentAt" TIMESTAMP
    `
    await prisma.$executeRaw`
      ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "lastInfoSharedType" TEXT
    `
    await prisma.$executeRaw`
      CREATE INDEX IF NOT EXISTS "Lead_infoSharedAt_idx" ON "Lead"("infoSharedAt")
    `

    // Verify migration
    const verifyInfo = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'Lead' 
      AND column_name IN ('infoSharedAt', 'quotationSentAt', 'lastInfoSharedType')
    `

    return NextResponse.json({
      success: true,
      message: 'Migration applied successfully',
      columnsAdded: verifyInfo.map((row) => row.column_name),
    })
  } catch (error: any) {
    console.error('Migration error:', error)
    
    // Check if it's a permission error
    if (error.message?.includes('permission') || error.message?.includes('denied')) {
      return NextResponse.json(
        {
          success: false,
          error: 'Database permission error. Please apply migration manually via SQL.',
          hint: 'Run the SQL commands directly on your database',
        },
        { status: 403 }
      )
    }

    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to apply migration',
        hint: 'Check database connection and permissions',
      },
      { status: 500 }
    )
  }
}
