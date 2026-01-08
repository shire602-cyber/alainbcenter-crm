/**
 * CRUD operations for meta_connections and meta_webhook_events
 * Isolated module for database operations
 */

import { prisma } from '@/lib/prisma'
import { encryptToken, decryptToken } from '@/lib/integrations/meta/encryption'

export interface CreateConnectionInput {
  workspaceId?: number | null
  provider?: string
  metaUserId?: string | null
  pageId: string
  pageName?: string | null
  pageAccessToken: string
  igBusinessId?: string | null
  igUsername?: string | null
  scopes?: string[]
  triggerSubscribed?: boolean
  status?: 'connected' | 'error'
  lastError?: string | null
}

export interface UpdateConnectionInput {
  pageName?: string | null
  pageAccessToken?: string
  igBusinessId?: string | null
  igUsername?: string | null
  scopes?: string[]
  triggerSubscribed?: boolean
  status?: 'connected' | 'error'
  lastError?: string | null
}

/**
 * Create or update a Meta connection
 */
export async function upsertConnection(
  input: CreateConnectionInput
): Promise<{ id: number }> {
  const encryptedToken = encryptToken(input.pageAccessToken)

  const connection = await prisma.metaConnection.upsert({
    where: {
      workspaceId_pageId: {
        workspaceId: input.workspaceId ?? 1,
        pageId: input.pageId,
      },
    },
    update: {
      pageName: input.pageName ?? undefined,
      pageAccessToken: encryptedToken,
      igBusinessId: input.igBusinessId ?? undefined,
      igUsername: input.igUsername ?? undefined,
      scopes: input.scopes ? JSON.stringify(input.scopes) : undefined,
      triggerSubscribed: input.triggerSubscribed ?? false,
      status: input.status ?? 'connected',
      lastError: input.lastError ?? null,
      updatedAt: new Date(),
    },
    create: {
      workspaceId: input.workspaceId ?? 1,
      provider: input.provider ?? 'meta',
      metaUserId: input.metaUserId ?? null,
      pageId: input.pageId,
      pageName: input.pageName ?? null,
      pageAccessToken: encryptedToken,
      igBusinessId: input.igBusinessId ?? null,
      igUsername: input.igUsername ?? null,
      scopes: input.scopes ? JSON.stringify(input.scopes) : null,
      triggerSubscribed: input.triggerSubscribed ?? false,
      status: input.status ?? 'connected',
      lastError: input.lastError ?? null,
    },
  })

  return { id: connection.id }
}

/**
 * Get connection by page ID
 */
export async function getConnectionByPageId(
  pageId: string,
  workspaceId?: number | null
) {
  return prisma.metaConnection.findFirst({
    where: {
      pageId,
      workspaceId: workspaceId ?? 1,
    },
  })
}

/**
 * Get all active connections
 */
export async function getAllConnections(workspaceId?: number | null) {
  return prisma.metaConnection.findMany({
    where: {
      workspaceId: workspaceId ?? 1,
      status: 'connected',
    },
    orderBy: {
      createdAt: 'desc',
    },
  })
}

/**
 * Update connection status
 */
export async function updateConnectionStatus(
  connectionId: number,
  status: 'connected' | 'error',
  lastError?: string | null
) {
  return prisma.metaConnection.update({
    where: { id: connectionId },
    data: {
      status,
      lastError: lastError ?? null,
      updatedAt: new Date(),
    },
  })
}

/**
 * Delete connection (mark as disconnected)
 */
export async function deleteConnection(connectionId: number) {
  return prisma.metaConnection.delete({
    where: { id: connectionId },
  })
}

/**
 * Store webhook event
 */
export async function storeWebhookEvent(input: {
  connectionId?: number | null
  workspaceId?: number | null
  pageId?: string | null
  eventType: string
  payload: any
}) {
  return prisma.metaWebhookEvent.create({
    data: {
      connectionId: input.connectionId ?? null,
      workspaceId: input.workspaceId ?? 1,
      pageId: input.pageId ?? null,
      eventType: input.eventType,
      payload: JSON.stringify(input.payload),
    },
  })
}

/**
 * Get decrypted page access token
 */
export async function getDecryptedPageToken(connectionId: number): Promise<string | null> {
  const connection = await prisma.metaConnection.findUnique({
    where: { id: connectionId },
    select: { pageAccessToken: true },
  })

  if (!connection) {
    return null
  }

  try {
    return decryptToken(connection.pageAccessToken)
  } catch (error) {
    console.error('Failed to decrypt page token:', error)
    return null
  }
}

