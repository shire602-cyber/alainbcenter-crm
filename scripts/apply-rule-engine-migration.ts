/**
 * Apply rule engine memory migration
 * Adds ruleEngineMemory field to Conversation table
 */

import { PrismaClient } from '@prisma/client'
import { readFileSync } from 'fs'
import { join } from 'path'

const prisma = new PrismaClient()

async function main() {
  console.log('📦 Applying rule engine memory migration...')
  
  try {
    const migrationSQL = readFileSync(
      join(process.cwd(), 'prisma', 'migrations', 'add_rule_engine_memory.sql'),
      'utf-8'
    )
    
    await prisma.$executeRawUnsafe(migrationSQL)
    
    console.log('✅ Migration applied successfully!')
  } catch (error: any) {
    console.error('❌ Migration failed:', error.message)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })

