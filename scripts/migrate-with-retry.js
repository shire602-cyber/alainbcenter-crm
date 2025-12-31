#!/usr/bin/env node
/**
 * Run Prisma migrations with retry logic for connection timeouts
 * 
 * Usage: node scripts/migrate-with-retry.js
 * 
 * This script retries migrations up to 3 times with exponential backoff
 * to handle transient database connection issues.
 */

const { execSync } = require('child_process')
const MAX_RETRIES = 3
const INITIAL_DELAY = 2000 // 2 seconds

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function runMigrations() {
  console.log('🔄 Starting Prisma migrations...')
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`📦 Attempt ${attempt}/${MAX_RETRIES}: Running prisma migrate deploy...`)
      
      execSync('npx prisma migrate deploy', {
        stdio: 'inherit',
        env: process.env,
      })
      
      console.log('✅ Migrations completed successfully')
      process.exit(0)
    } catch (error) {
      const isTimeout = error.message?.includes('timed out') || 
                       error.message?.includes('P1002') ||
                       error.stderr?.toString().includes('timed out') ||
                       error.stderr?.toString().includes('P1002')
      
      if (isTimeout && attempt < MAX_RETRIES) {
        const delay = INITIAL_DELAY * Math.pow(2, attempt - 1) // Exponential backoff
        console.warn(`⚠️  Migration attempt ${attempt} failed due to timeout. Retrying in ${delay}ms...`)
        await sleep(delay)
        continue
      }
      
      // If not a timeout or last attempt, fail immediately
      if (!isTimeout) {
        console.error('❌ Migration failed with non-timeout error:', error.message)
        process.exit(1)
      }
      
      if (attempt === MAX_RETRIES) {
        console.error('❌ Migration failed after all retry attempts')
        console.error('💡 Tip: Run migrations manually with: npx prisma migrate deploy')
        process.exit(1)
      }
    }
  }
}

// Run migrations
runMigrations().catch(error => {
  console.error('❌ Unexpected error:', error)
  process.exit(1)
})
