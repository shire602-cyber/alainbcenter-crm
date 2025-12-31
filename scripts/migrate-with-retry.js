#!/usr/bin/env node

/**
 * Prisma Migration Script with Retry Logic
 * Handles Neon connection timeouts and advisory lock issues
 */

const { execSync } = require('child_process')
const { setTimeout } = require('timers/promises')

const MAX_RETRIES = 3
const INITIAL_DELAY = 2000 // 2 seconds
const MAX_DELAY = 10000 // 10 seconds

function log(message) {
  console.log(`[MIGRATE] ${new Date().toISOString()} - ${message}`)
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function runWithRetry(command, retries = MAX_RETRIES) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      log(`Attempt ${attempt}/${retries}: Running ${command}`)
      
      // Use DIRECT_URL if available (non-pooled connection for migrations)
      const env = {
        ...process.env,
        // Increase Prisma timeout
        PRISMA_MIGRATE_LOCK_TIMEOUT: '30000', // 30 seconds
      }
      
      // If DIRECT_URL is set, use it for migrations (bypasses connection pooling)
      if (process.env.DIRECT_URL && !process.env.DATABASE_URL.includes('pooler')) {
        log('Using DIRECT_URL for migration (non-pooled connection)')
        env.DATABASE_URL = process.env.DIRECT_URL
      }
      
      execSync(command, {
        stdio: 'inherit',
        env,
        timeout: 60000, // 60 second timeout per attempt
      })
      
      log(`✅ Migration succeeded on attempt ${attempt}`)
      return true
    } catch (error) {
      const errorMsg = error.message || error.toString()
      log(`❌ Attempt ${attempt} failed: ${errorMsg}`)
      
      // If it's a timeout or lock error, retry
      const isRetryable = errorMsg.includes('timeout') || 
                         errorMsg.includes('advisory lock') ||
                         errorMsg.includes('P1002') ||
                         errorMsg.includes('ETIMEDOUT')
      
      if (attempt < retries && isRetryable) {
        // Exponential backoff with jitter
        const delay = Math.min(
          INITIAL_DELAY * Math.pow(2, attempt - 1) + Math.random() * 1000,
          MAX_DELAY
        )
        log(`⏳ Waiting ${Math.round(delay)}ms before retry...`)
        await sleep(delay)
      } else if (!isRetryable) {
        // Non-retryable error (e.g., syntax error, missing migration)
        log(`❌ Non-retryable error detected, aborting`)
        throw error
      } else {
        log(`❌ All ${retries} attempts failed`)
        throw error
      }
    }
  }
}

async function checkMigrationsStatus() {
  try {
    log('Checking migration status...')
    
    const env = { ...process.env, PRISMA_MIGRATE_LOCK_TIMEOUT: '30000' }
    if (process.env.DIRECT_URL && !process.env.DATABASE_URL.includes('pooler')) {
      env.DATABASE_URL = process.env.DIRECT_URL
    }
    
    const output = execSync('npx prisma migrate status', {
      stdio: 'pipe',
      env,
      timeout: 30000,
    }).toString()
    
    if (output.includes('Database schema is up to date')) {
      log('✅ Migrations are up to date')
      return true
    }
    
    log('⚠️  Migrations pending, will deploy')
    return false
  } catch (error) {
    // If status check fails, we still need to try deploy
    log('⚠️  Migration status check failed, will attempt deploy')
    return false
  }
}

async function main() {
  log('Starting Prisma migration with retry logic...')
  
  try {
    // Step 1: Generate Prisma Client
    log('Step 1: Generating Prisma Client...')
    execSync('npx prisma generate', { stdio: 'inherit' })
    log('✅ Prisma Client generated')
    
    // Step 2: Check if migrations are already applied
    const isUpToDate = await checkMigrationsStatus()
    
    if (isUpToDate) {
      log('✅ Migrations already applied, skipping deploy')
      process.exit(0)
    }
    
    // Step 3: Deploy migrations with retry
    log('Step 2: Deploying migrations...')
    await runWithRetry('npx prisma migrate deploy --skip-seed')
    
    log('✅ Migration process completed successfully')
    process.exit(0)
  } catch (error) {
    log(`❌ Migration failed after all retries: ${error.message}`)
    log('⚠️  Build will continue, but migrations may need to be applied manually')
    // Don't fail the build - migrations can be applied manually if needed
    // This allows the build to complete even if migrations timeout
    process.exit(0)
  }
}

main().catch(error => {
  log(`❌ Fatal error: ${error.message}`)
  process.exit(0) // Don't fail build
})

