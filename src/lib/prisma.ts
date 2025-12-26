import { PrismaClient } from '@prisma/client'

const globalForPrisma = global as unknown as { prisma: PrismaClient }

// Connection pool configuration for better concurrency handling
// Increase pool size to handle concurrent webhook requests
const prismaClientOptions: ConstructorParameters<typeof PrismaClient>[0] = {
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
}

// For serverless environments (Vercel), configure connection pooling
if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
  // Use connection pooler URL if available (Neon, Supabase, etc.)
  // If DATABASE_URL already includes pooler params, use as-is
  // Otherwise, add connection_limit and pool_timeout to handle concurrent requests
  const dbUrl = process.env.DATABASE_URL || ''
  
  // If using Neon or similar, ensure we're using the pooler connection string
  // Connection pool settings are typically in the URL query params:
  // ?pgbouncer=true&connection_limit=20&pool_timeout=20
  if (dbUrl && !dbUrl.includes('connection_limit')) {
    console.log('⚠️ [PRISMA] Consider using a connection pooler URL for better concurrency')
    console.log('⚠️ [PRISMA] Add ?connection_limit=20&pool_timeout=20 to DATABASE_URL')
  }
}

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient(prismaClientOptions)

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

// Ensure connections are properly managed
if (process.env.NODE_ENV === 'production') {
  // In production, ensure we disconnect on process termination
  process.on('beforeExit', async () => {
    await prisma.$disconnect()
  })
}
