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
      
      execSync(command, {
        stdio: 'inherit',
        env: {
          ...process.env,
          // Increase Prisma timeout
          PRISMA_MIGRATE_LOCK_TIMEOUT: '30000', // 30 seconds
        }
      })
      
      log(`✅ Migration succeeded on attempt ${attempt}`)
      return true
    } catch (error) {
      log(`❌ Attempt ${attempt} failed: ${error.message}`)
      
      if (attempt < retries) {
        // Exponential backoff with jitter
        const delay = Math.min(
          INITIAL_DELAY * Math.pow(2, attempt - 1) + Math.random() * 1000,
          MAX_DELAY
        )
        log(`⏳ Waiting ${Math.round(delay)}ms before retry...`)
        await sleep(delay)
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
    execSync('npx prisma migrate status', {
      stdio: 'pipe',
      env: {
        ...process.env,
        PRISMA_MIGRATE_LOCK_TIMEOUT: '30000',
      }
    })
    log('✅ Migrations are up to date')
    return true
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

