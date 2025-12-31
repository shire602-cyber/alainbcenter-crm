#!/usr/bin/env node

/**
 * Skip migrations during build - apply them separately
 * This prevents build failures due to database connection issues
 */

console.log('[MIGRATE] Skipping migrations during build')
console.log('[MIGRATE] Migrations should be applied separately using:')
console.log('[MIGRATE]   DATABASE_URL="..." npx prisma migrate deploy')
console.log('[MIGRATE] Or via Vercel CLI: vercel env pull && npx prisma migrate deploy')
console.log('[MIGRATE] Build will continue...')

process.exit(0)

