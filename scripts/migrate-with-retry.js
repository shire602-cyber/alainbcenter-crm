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
  
  // CRITICAL: Use DIRECT_URL for migrations to avoid connection pool timeouts
  // Neon pooled connections can cause advisory lock timeouts
  const migrationEnv = { ...process.env }
  if (process.env.DIRECT_URL) {
    console.log('✅ Using DIRECT_URL for migrations (non-pooled connection)')
    migrationEnv.DATABASE_URL = process.env.DIRECT_URL
  } else if (process.env.DATABASE_URL && process.env.DATABASE_URL.includes('-pooler')) {
    console.warn('⚠️  WARNING: Using pooled connection. Migrations may timeout.')
    console.warn('⚠️  Set DIRECT_URL environment variable for better reliability.')
    console.warn('⚠️  If migrations timeout, they will be skipped and can be run manually.')
    
    // Try to convert pooled URL to direct URL (Neon pattern)
    const pooledUrl = process.env.DATABASE_URL
    if (pooledUrl.includes('-pooler')) {
      const directUrl = pooledUrl.replace('-pooler', '')
      console.log('💡 Attempting to use direct connection (removed -pooler suffix)')
      migrationEnv.DATABASE_URL = directUrl
    }
  }
  
  // Increase timeout for advisory locks (PostgreSQL advisory lock timeout)
  migrationEnv.PRISMA_MIGRATE_LOCK_TIMEOUT = '30000' // 30 seconds (reduced to fail faster)
  
  // Check if we should skip migrations (useful for Vercel builds with connection issues)
  const skipMigrations = process.env.SKIP_MIGRATIONS === 'true' || process.env.VERCEL === '1'
  
  if (skipMigrations) {
    console.log('⏭️  Skipping migrations (SKIP_MIGRATIONS=true or VERCEL=1)')
    console.log('💡 Migrations should be run separately or via a migration job')
    process.exit(0)
  }
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`📦 Attempt ${attempt}/${MAX_RETRIES}: Running prisma migrate deploy...`)
      console.log(`⏱️  Using lock timeout: ${migrationEnv.PRISMA_MIGRATE_LOCK_TIMEOUT}ms`)
      
      // Use shorter timeout per attempt to fail faster
      execSync('npx prisma migrate deploy', {
        stdio: 'inherit',
        env: migrationEnv,
        timeout: 120000, // 2 minute timeout per attempt (reduced for faster failure)
      })
      
      console.log('✅ Migrations completed successfully')
      process.exit(0)
    } catch (error) {
      const errorOutput = (error.stderr?.toString() || error.stdout?.toString() || error.message || '').toLowerCase()
      const isTimeout = errorOutput.includes('timed out') || 
                       errorOutput.includes('p1002') ||
                       errorOutput.includes('advisory lock') ||
                       errorOutput.includes('timeout') ||
                       errorOutput.includes('was reached but timed out') ||
                       errorOutput.includes('elapsed:')
      
      if (isTimeout && attempt < MAX_RETRIES) {
        const delay = INITIAL_DELAY * Math.pow(2, attempt - 1) // Exponential backoff
        console.warn(`⚠️  Migration attempt ${attempt} failed due to timeout (P1002). Retrying in ${delay}ms...`)
        await sleep(delay)
        continue
      }
      
      // If timeout on last attempt, skip migrations gracefully (don't fail build)
      if (isTimeout && attempt === MAX_RETRIES) {
        console.error('❌ Migration failed after all retry attempts due to timeout')
        console.error('⚠️  WARNING: Migrations were not applied during build')
        console.error('💡 This is likely due to:')
        console.error('   1. Using pooled connection without DIRECT_URL')
        console.error('   2. Another migration process holding the lock')
        console.error('   3. Database connection issues')
        console.error('💡 Solutions:')
        console.error('   1. Set DIRECT_URL in Vercel environment variables (recommended)')
        console.error('   2. Run migrations manually: npx prisma migrate deploy')
        console.error('   3. Or set SKIP_MIGRATIONS=true to skip during build')
        console.warn('⚠️  Continuing build without migrations (app may fail at runtime if schema mismatch)')
        console.warn('⚠️  Consider running migrations via a separate job or after deployment')
        // Exit with 0 to allow build to continue
        process.exit(0)
      }
      
      // If not a timeout, fail immediately
      if (!isTimeout) {
        console.error('❌ Migration failed with non-timeout error:', error.message)
        console.error('Full error:', errorOutput)
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
