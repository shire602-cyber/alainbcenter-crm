#!/usr/bin/env node

/**
 * Prisma Migration Script with Retry Logic
 * Handles Neon connection timeouts and advisory lock issues
 * NEVER FAILS THE BUILD - always exits with code 0
 */

const { execSync } = require('child_process')

const MAX_RETRIES = 3
const INITIAL_DELAY = 2000 // 2 seconds
const MAX_DELAY = 10000 // 10 seconds

function log(message) {
  console.log(`[MIGRATE] ${new Date().toISOString()} - ${message}`)
}

function sleep(ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms)
  })
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
      if (process.env.DIRECT_URL && process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('pooler')) {
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
      const errorMsg = error.message || error.toString() || String(error)
      const errorOutput = error.stdout?.toString() || error.stderr?.toString() || ''
      log(`❌ Attempt ${attempt} failed: ${errorMsg}`)
      if (errorOutput) {
        log(`Error output: ${errorOutput.substring(0, 200)}`)
      }
      
      // If it's a timeout or lock error, retry
      const isRetryable = errorMsg.includes('timeout') || 
                         errorMsg.includes('advisory lock') ||
                         errorMsg.includes('P1002') ||
                         errorMsg.includes('ETIMEDOUT') ||
                         errorOutput.includes('timeout') ||
                         errorOutput.includes('advisory lock') ||
                         errorOutput.includes('P1002')
      
      if (attempt < retries && isRetryable) {
        // Exponential backoff with jitter
        const delay = Math.min(
          INITIAL_DELAY * Math.pow(2, attempt - 1) + Math.random() * 1000,
          MAX_DELAY
        )
        log(`⏳ Waiting ${Math.round(delay)}ms before retry...`)
        await sleep(delay)
      } else if (attempt < retries) {
        // Non-retryable error but we have retries left - still retry (might be transient)
        const delay = INITIAL_DELAY
        log(`⏳ Non-retryable error, but retrying after ${delay}ms...`)
        await sleep(delay)
      } else {
        log(`❌ All ${retries} attempts failed`)
        return false // Don't throw, just return false
      }
    }
  }
  return false
}

async function checkMigrationsStatus() {
  try {
    log('Checking migration status...')
    
    const env = { ...process.env, PRISMA_MIGRATE_LOCK_TIMEOUT: '30000' }
    if (process.env.DIRECT_URL && process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('pooler')) {
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
  
  // Step 1: Generate Prisma Client (always required)
  log('Step 1: Generating Prisma Client...')
  try {
    execSync('npx prisma generate', { 
      stdio: 'inherit',
      timeout: 60000,
    })
    log('✅ Prisma Client generated')
  } catch (genError) {
    log(`⚠️  Prisma generate failed: ${genError.message || genError}`)
    log('⚠️  Continuing anyway - client may have been generated previously')
    // Don't fail - postinstall also runs prisma generate
  }
  
  // Step 2: Check if migrations are already applied
  let isUpToDate = false
  try {
    isUpToDate = await checkMigrationsStatus()
  } catch (statusError) {
    log(`⚠️  Could not check migration status: ${statusError.message || statusError}`)
    log('⚠️  Will attempt to deploy migrations')
  }
  
  if (isUpToDate) {
    log('✅ Migrations already applied, skipping deploy')
    return
  }
  
  // Step 3: Deploy migrations with retry
  log('Step 2: Deploying migrations...')
  const success = await runWithRetry('npx prisma migrate deploy --skip-seed')
  
  if (success) {
    log('✅ Migration process completed successfully')
  } else {
    log('⚠️  Migration failed after all retries')
    log('⚠️  Build will continue, but migrations may need to be applied manually')
    log('⚠️  You can apply migrations manually after deployment using:')
    log('⚠️  DATABASE_URL="..." npx prisma migrate deploy')
  }
}

// Wrap everything to ensure we never fail the build
try {
  main()
    .then(() => {
      log('✅ Migration script completed')
      process.exit(0)
    })
    .catch(error => {
      log(`❌ Fatal error in main: ${error.message || error}`)
      log('⚠️  Continuing build despite migration script error')
      process.exit(0) // Don't fail build
    })
} catch (error) {
  log(`❌ Fatal error: ${error.message || error}`)
  log('⚠️  Continuing build despite migration script error')
  process.exit(0) // Don't fail build
}
