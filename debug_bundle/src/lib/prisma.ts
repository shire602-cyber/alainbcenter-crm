import { PrismaClient } from '@prisma/client'

const globalForPrisma = global as unknown as { prisma: PrismaClient }

/**
 * Enhance DATABASE_URL with connection pool parameters
 * Since Vercel Neon integration auto-generates DATABASE_URL and it can't be edited,
 * we append connection pool parameters programmatically.
 */
function getEnhancedDatabaseUrl(): string {
  const baseUrl = process.env.DATABASE_URL || ''
  
  if (!baseUrl) {
    return baseUrl
  }
  
  // If already has connection_limit, use as-is
  if (baseUrl.includes('connection_limit')) {
    return baseUrl
  }
  
  // Check if it's a Neon pooler URL (has -pooler in hostname)
  const isPoolerUrl = baseUrl.includes('-pooler.')
  
  // For pooler URLs, add connection pool parameters
  if (isPoolerUrl) {
    // Parse PostgreSQL connection string manually (URL() doesn't work well with postgresql://)
    const urlParts = baseUrl.split('?')
    const baseConnection = urlParts[0]
    const existingParams = urlParts[1] || ''
    
    // Parse existing query parameters
    const params = new URLSearchParams(existingParams)
    
    // Add connection pool parameters (only if not already present)
    if (!params.has('connection_limit')) {
      params.set('connection_limit', '20')
    }
    if (!params.has('pool_timeout')) {
      params.set('pool_timeout', '20')
    }
    if (!params.has('connect_timeout')) {
      params.set('connect_timeout', '10')
    }
    
    // Ensure channel_binding is set if sslmode is require
    if (params.get('sslmode') === 'require' && !params.has('channel_binding')) {
      params.set('channel_binding', 'require')
    }
    
    const enhancedUrl = `${baseConnection}?${params.toString()}`
    console.log('✅ [PRISMA] Enhanced DATABASE_URL with connection pool parameters')
    return enhancedUrl
  }
  
  // For non-pooler URLs, log warning
  if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
    console.warn('⚠️ [PRISMA] DATABASE_URL does not appear to use a connection pooler')
    console.warn('⚠️ [PRISMA] Consider using pooler endpoint for better concurrency in serverless')
  }
  
  return baseUrl
}

// Connection pool configuration for better concurrency handling
const enhancedDatabaseUrl = getEnhancedDatabaseUrl()

const prismaClientOptions: ConstructorParameters<typeof PrismaClient>[0] = {
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  datasources: {
    db: {
      url: enhancedDatabaseUrl,
    },
  },
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
