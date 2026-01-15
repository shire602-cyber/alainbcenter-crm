import { prisma } from '@/lib/prisma'

export type ServiceBucket = 'visa' | 'business_setup' | 'family_visa' | 'other'

const SERVICE_KEYS: Record<ServiceBucket, string> = {
  visa: 'VISA',
  business_setup: 'BUSINESS_SETUP',
  family_visa: 'FAMILY_VISA',
  other: 'OTHER',
}

type RoutingConfig = {
  mapping: Record<string, number[]>
  lastAssignedIndex: Record<string, number>
}

function parseRoutingConfig(raw: string | null, fallback: RoutingConfig): RoutingConfig {
  if (!raw) return fallback
  try {
    const parsed = JSON.parse(raw)
    return {
      mapping: parsed.mapping || parsed || fallback.mapping,
      lastAssignedIndex: parsed.lastAssignedIndex || fallback.lastAssignedIndex,
    }
  } catch {
    return fallback
  }
}

async function getLeastLoadedUserId(): Promise<{ id: number | null; name: string | null }> {
  const candidates = await prisma.user.findMany({
    where: {
      OR: [{ role: 'ADMIN' }, { role: 'AGENT' }],
    },
    select: { id: true, name: true },
  })

  if (candidates.length === 0) {
    return { id: null, name: null }
  }

  const counts = await Promise.all(
    candidates.map(async (user) => {
      const openLeadCount = await prisma.lead.count({
        where: {
          assignedUserId: user.id,
          stage: {
            notIn: ['COMPLETED_WON', 'LOST', 'ON_HOLD'],
          },
        },
      })
      return { id: user.id, name: user.name, openLeadCount }
    })
  )

  const leastLoaded = counts.reduce((min, current) =>
    current.openLeadCount < min.openLeadCount ? current : min
  )

  return { id: leastLoaded.id, name: leastLoaded.name }
}

export async function assignLeadByService(
  serviceBucket: ServiceBucket,
  workspaceId: number = 1
): Promise<{ assigneeId: number | null; assigneeName: string | null; routingSource: string }> {
  const serviceKey = SERVICE_KEYS[serviceBucket] || 'OTHER'

  const config = await prisma.serviceRoutingConfig.findUnique({
    where: { workspaceId },
  })

  const defaultConfig: RoutingConfig = {
    mapping: {},
    lastAssignedIndex: {},
  }

  const parsed = parseRoutingConfig(config?.mapping || null, defaultConfig)
  const mapping = parsed.mapping || {}
  const lastAssignedIndex = parsed.lastAssignedIndex || {}

  const userIds = Array.isArray(mapping[serviceKey]) ? mapping[serviceKey] : []
  if (userIds.length === 0) {
    console.warn('[SERVICE-ROUTING-MISSING]', { serviceType: serviceKey })
    const fallback = await getLeastLoadedUserId()
    return {
      assigneeId: fallback.id,
      assigneeName: fallback.name,
      routingSource: 'fallback_least_loaded',
    }
  }

  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true },
  })
  const validIds = users.map((u) => u.id)
  if (validIds.length === 0) {
    console.warn('[SERVICE-ROUTING-MISSING]', { serviceType: serviceKey })
    const fallback = await getLeastLoadedUserId()
    return {
      assigneeId: fallback.id,
      assigneeName: fallback.name,
      routingSource: 'fallback_least_loaded',
    }
  }

  const lastIndex = typeof lastAssignedIndex[serviceKey] === 'number'
    ? lastAssignedIndex[serviceKey]
    : -1
  const nextIndex = (lastIndex + 1) % validIds.length
  const nextUserId = validIds[nextIndex]
  const nextUser = users.find((u) => u.id === nextUserId) || null

  await prisma.serviceRoutingConfig.upsert({
    where: { workspaceId },
    update: {
      mapping: JSON.stringify(mapping),
      lastAssignedIndex: JSON.stringify({
        ...lastAssignedIndex,
        [serviceKey]: nextIndex,
      }),
    },
    create: {
      workspaceId,
      mapping: JSON.stringify(mapping),
      lastAssignedIndex: JSON.stringify({ [serviceKey]: nextIndex }),
    },
  })

  return {
    assigneeId: nextUser?.id || null,
    assigneeName: nextUser?.name || null,
    routingSource: 'round_robin',
  }
}
