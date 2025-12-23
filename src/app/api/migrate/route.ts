/**
 * POST /api/migrate
 * Public migration endpoint (with secret token)
 * 
 * This allows applying migration without admin session
 * Use x-migration-secret header for security
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  try {
    // Require secret token for security
    const migrationSecret = req.headers.get('x-migration-secret')
    const expectedSecret = process.env.MIGRATION_SECRET || 'default-migration-secret-change-in-production'
    
    if (!migrationSecret || migrationSecret !== expectedSecret) {
      return NextResponse.json(
        {
          success: false,
          error: 'Unauthorized',
          hint: 'Provide x-migration-secret header with correct value',
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
