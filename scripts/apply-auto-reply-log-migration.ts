/**
 * Apply AutoReplyLog migration
 */

import { PrismaClient } from '@prisma/client'
import { readFileSync } from 'fs'
import { join } from 'path'

const prisma = new PrismaClient()

async function main() {
  console.log('📦 Applying AutoReplyLog migration...\n')
  
  try {
    // Read the migration SQL file
    const migrationPath = join(__dirname, '../prisma/migrations/add_auto_reply_log.sql')
    const migrationSQL = readFileSync(migrationPath, 'utf-8')
    
    // Remove comments and split by semicolons (but keep multi-line statements together)
    const cleanedSQL = migrationSQL
      .split('\n')
      .filter(line => !line.trim().startsWith('--'))
      .join('\n')
    
    // Split by semicolons that are at the end of lines (not inside statements)
    const statements = cleanedSQL
      .split(/;\s*\n/)
      .map(s => s.trim())
      .filter(s => s.length > 0)
    
    console.log(`Executing ${statements.length} SQL statements...\n`)
    
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i] + ';' // Add semicolon back
      if (statement.trim().length > 1) { // More than just ';'
        try {
          await prisma.$executeRawUnsafe(statement)
          console.log(`✅ Statement ${i + 1}/${statements.length} executed`)
        } catch (err: any) {
          // Ignore "already exists" errors
          const errMsg = err.message || ''
          if (errMsg.includes('already exists') || 
              errMsg.includes('duplicate') ||
              (errMsg.includes('relation') && errMsg.includes('already exists')) ||
              errMsg.includes('constraint') && errMsg.includes('already exists')) {
            console.log(`⚠️  Statement ${i + 1}/${statements.length} skipped (already exists)`)
          } else {
            console.error(`❌ Error in statement ${i + 1}:`, errMsg)
            console.error(`   Statement: ${statement.substring(0, 200)}...`)
            throw err
          }
        }
      }
    }
    
    console.log('\n✅ Migration applied successfully!')
    
    // Verify table exists (with error handling)
    try {
      const result = await prisma.$queryRaw<Array<{ table_name: string }>>`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_name = 'AutoReplyLog'
      `
      
      if (result.length > 0) {
        console.log('✅ AutoReplyLog table verified')
      } else {
        console.log('⚠️  AutoReplyLog table not found in information_schema (may still be creating)')
      }
    } catch (verifyErr: any) {
      console.log('⚠️  Could not verify table (may still be creating):', verifyErr.message)
    }
    
  } catch (error: any) {
    console.error('❌ Migration failed:', error.message)
    console.error(error.stack)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()

