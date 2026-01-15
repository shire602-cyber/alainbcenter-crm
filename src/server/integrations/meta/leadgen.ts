import { prisma } from '@/lib/prisma'
import { getDecryptedPageToken } from '@/server/integrations/meta/storage'
import { decryptToken } from '@/lib/integrations/meta/encryption'
import { getLeadGen, graphAPIGet } from '@/server/integrations/meta/graph'
import { extractLeadAdFields, serviceBucketFromRawText, type ServiceBucket } from '@/server/integrations/meta/normalize'
import { normalizeService } from '@/lib/services/normalizeService'
import { handleInboundMessageAutoMatch } from '@/lib/inbound/autoMatchPipeline'
import { computeSlaDueAt } from '@/lib/sla/computeSlaDueAt'
import { assignLeadByService } from '@/lib/leadRouting'
import { runRuleOnLead, type AutomationContext } from '@/lib/automation/engine'

const WORKSPACE_ID = 1

type LeadgenPayload = {
  leadgenId: string
  formId?: string | null
  adId?: string | null
  pageId?: string | null
  createdTime?: number | null
}

export async function ensureLeadgenState(workspaceId: number = WORKSPACE_ID) {
  return prisma.metaLeadgenState.upsert({
    where: { workspaceId },
    update: {},
    create: { workspaceId },
  })
}

export async function checkMetaLeadgenReadiness(workspaceId: number = WORKSPACE_ID) {
  const state = await ensureLeadgenState(workspaceId)
  const connection = await prisma.metaConnection.findFirst({
    where: {
      workspaceId,
      status: 'connected',
    },
    orderBy: { createdAt: 'desc' },
  })

  const missing: string[] = []
  const selectedPageId = state.selectedPageId || connection?.pageId || null
  const selectedAdAccountId = state.selectedAdAccountId || null

  if (!state.selectedPageId && selectedPageId) {
    await prisma.metaLeadgenState.update({
      where: { workspaceId },
      data: { selectedPageId },
    })
  }

  if (!connection?.pageAccessToken) {
    missing.push('page_access_token')
  }

  if (!connection?.metaUserAccessTokenLong) {
    missing.push('meta_user_token')
  }

  if (!selectedPageId) {
    missing.push('selectedPageId')
  }

  let hasLeadsRetrieval = false
  if (connection?.scopes) {
    try {
      const scopes = JSON.parse(connection.scopes)
      hasLeadsRetrieval = Array.isArray(scopes) && scopes.includes('leads_retrieval')
    } catch {
      hasLeadsRetrieval = false
    }
  }

  if (!hasLeadsRetrieval && connection?.metaUserId && connection?.metaUserAccessTokenLong) {
    try {
      const userToken = decryptToken(connection.metaUserAccessTokenLong)
      const permissions = await graphAPIGet<{ data: Array<{ permission: string; status: string }> }>(
        `/${connection.metaUserId}/permissions`,
        userToken
      )
      hasLeadsRetrieval = permissions.data.some(
        (perm) => perm.permission === 'leads_retrieval' && perm.status === 'granted'
      )
    } catch (error: any) {
      console.warn('[META-LEADGEN-READY] Permission check failed', { error: error.message })
    }
  }

  if (!hasLeadsRetrieval) {
    missing.push('leads_retrieval')
  }

  if (connection?.triggerSubscribed === false) {
    missing.push('webhook_subscription')
  }

  const ok = missing.length === 0

  console.log('[META-LEADGEN-READY]', {
    ok,
    missing,
    workspaceId,
    selectedPageId,
    selectedAdAccountId,
  })

  return {
    ok,
    missing,
    connection,
    selectedPageId,
    selectedAdAccountId,
    state,
  }
}

function buildSyntheticMessage(payload: LeadgenPayload, extractedFields: ReturnType<typeof extractLeadAdFields>) {
  const parts: string[] = ['📋 Lead Ad Submission']
  if (extractedFields.name) parts.push(`Name: ${extractedFields.name}`)
  if (extractedFields.phone) parts.push(`Phone: ${extractedFields.phone}`)
  if (extractedFields.email) parts.push(`Email: ${extractedFields.email}`)
  if (extractedFields.nationality) parts.push(`Nationality: ${extractedFields.nationality}`)
  if (extractedFields.rawServiceText) parts.push(`Service: ${extractedFields.rawServiceText}`)
  if (extractedFields.notes) parts.push(`Notes: ${extractedFields.notes}`)
  if (payload.formId) parts.push(`Form ID: ${payload.formId}`)
  return parts.join('\n')
}

export async function processLeadgenEvent(input: {
  payload: LeadgenPayload
  workspaceId?: number
  source: 'webhook' | 'poller'
}) {
  const workspaceId = input.workspaceId ?? WORKSPACE_ID
  const { payload } = input
  const { leadgenId } = payload

  const state = await ensureLeadgenState(workspaceId)

  await prisma.metaLeadgenState.update({
    where: { workspaceId },
    data: {
      lastLeadgenReceivedAt: new Date(),
    },
  })

  const existingEvent = await prisma.externalEventLog.findUnique({
    where: {
      provider_externalId: {
        provider: 'meta',
        externalId: leadgenId,
      },
    },
  })

  if (existingEvent?.processedAt) {
    console.log('[LEADGEN-DEDUPED]', { leadgenId, reason: 'external_event_processed' })
    return { ok: true, deduped: true }
  }

  const existingLead = await prisma.lead.findFirst({
    where: { metaLeadgenId: leadgenId },
    select: { id: true },
  })

  if (existingLead) {
    console.log('[LEADGEN-DEDUPED]', { leadgenId, reason: 'lead_meta_leadgen_id' })
    await prisma.externalEventLog.upsert({
      where: { provider_externalId: { provider: 'meta', externalId: leadgenId } },
      update: {
        status: 'deduped',
        processedAt: new Date(),
        payload: JSON.stringify(payload),
      },
      create: {
        provider: 'meta',
        externalId: leadgenId,
        eventType: 'leadgen',
        status: 'deduped',
        processedAt: new Date(),
        payload: JSON.stringify(payload),
      },
    })
    return { ok: true, deduped: true }
  }

  await prisma.externalEventLog.upsert({
    where: { provider_externalId: { provider: 'meta', externalId: leadgenId } },
    update: {
      eventType: 'leadgen',
      payload: JSON.stringify(payload),
      receivedAt: new Date(),
    },
    create: {
      provider: 'meta',
      externalId: leadgenId,
      eventType: 'leadgen',
      payload: JSON.stringify(payload),
      receivedAt: new Date(),
    },
  })

  const readiness = await checkMetaLeadgenReadiness(workspaceId)
  if (!readiness.ok || !readiness.connection) {
    await prisma.externalEventLog.update({
      where: { provider_externalId: { provider: 'meta', externalId: leadgenId } },
      data: {
        status: 'error',
        error: `Readiness failed: ${readiness.missing.join(', ')}`,
      },
    })
    return { ok: false, error: 'not_ready' }
  }

  const pageToken = await getDecryptedPageToken(readiness.connection.id)
  if (!pageToken) {
    await prisma.externalEventLog.update({
      where: { provider_externalId: { provider: 'meta', externalId: leadgenId } },
      data: {
        status: 'error',
        error: 'Missing page access token',
      },
    })
    return { ok: false, error: 'missing_page_token' }
  }

  let leadData = null
  try {
    leadData = await getLeadGen(leadgenId, pageToken)
  } catch (error: any) {
    console.warn('[LEADGEN-FETCH-FAIL]', { leadgenId, status: 'error', message: error.message })
    await prisma.externalEventLog.update({
      where: { provider_externalId: { provider: 'meta', externalId: leadgenId } },
      data: { status: 'error', error: error.message },
    })
    return { ok: false, error: 'fetch_failed' }
  }

  if (!leadData) {
    console.warn('[LEADGEN-FETCH-FAIL]', { leadgenId, status: 'empty', message: 'No lead data' })
    await prisma.externalEventLog.update({
      where: { provider_externalId: { provider: 'meta', externalId: leadgenId } },
      data: { status: 'error', error: 'No lead data' },
    })
    return { ok: false, error: 'no_lead_data' }
  }

  const extractedFields = extractLeadAdFields(leadData.field_data)
  const serviceBucket = serviceBucketFromRawText(extractedFields.rawServiceText)
  const normalizedService = normalizeService(extractedFields.rawServiceText)

  const receivedAt = payload.createdTime
    ? new Date(payload.createdTime * 1000)
    : new Date(leadData.created_time || Date.now())

  const syntheticMessageText = buildSyntheticMessage(payload, extractedFields)
  const fromPhone = extractedFields.phone || `fb_lead:${leadgenId}`

  const result = await handleInboundMessageAutoMatch({
    channel: 'FACEBOOK',
    providerMessageId: `leadgen_${leadgenId}`,
    fromPhone,
    fromEmail: extractedFields.email || null,
    fromName: extractedFields.name || 'Meta Lead',
    text: syntheticMessageText,
    timestamp: receivedAt,
    metadata: {
      isLeadAd: true,
      leadgenId,
      formId: payload.formId || leadData.form_id,
      adId: payload.adId || leadData.ad_id,
      pageId: payload.pageId || readiness.selectedPageId,
      serviceBucket,
      extractedFields,
    },
  })

  const leadId = result.lead?.id
  const conversationId = result.conversation?.id
  const messageId = result.message?.id

  const formId = payload.formId || leadData.form_id || null
  const adId = payload.adId || leadData.ad_id || null
  const pageId = payload.pageId || readiness.selectedPageId || null
  let formName: string | null = null
  let adName: string | null = null
  let campaignId: string | null = null
  let campaignName: string | null = null

  try {
    if (formId) {
      const form = await graphAPIGet<{ name?: string }>(`/${formId}`, pageToken, ['name'])
      formName = form?.name || null
    }
  } catch (error: any) {
    console.warn('[META-LEADGEN] Failed to fetch form name', { formId, error: error.message })
  }

  try {
    if (adId) {
      const ad = await graphAPIGet<{ name?: string; campaign_id?: string }>(
        `/${adId}`,
        pageToken,
        ['name', 'campaign_id']
      )
      adName = ad?.name || null
      campaignId = ad?.campaign_id || null
      if (campaignId) {
        const campaign = await graphAPIGet<{ name?: string }>(`/${campaignId}`, pageToken, ['name'])
        campaignName = campaign?.name || null
      }
    }
  } catch (error: any) {
    console.warn('[META-LEADGEN] Failed to fetch ad/campaign name', { adId, error: error.message })
  }

  const metaLead = {
    leadgenId,
    formId,
    formName,
    adId,
    adName,
    campaignId,
    campaignName,
    pageId,
    createdTime: receivedAt.toISOString(),
    rawServiceText: extractedFields.rawServiceText || null,
    serviceBucket,
  }

  if (leadId) {
    const existingLead = await prisma.lead.findUnique({
      where: { id: leadId },
      select: { dataJson: true },
    })
    const dataJson = existingLead?.dataJson ? JSON.parse(existingLead.dataJson) : {}

    await prisma.lead.update({
      where: { id: leadId },
      data: {
        metaLeadgenId: leadgenId,
        source: 'META_LEAD_AD',
        serviceTypeEnum: normalizedService.service,
        serviceOtherDescription: normalizedService.serviceOtherDescription,
        requestedServiceRaw: normalizedService.service === 'OTHER' ? extractedFields.rawServiceText || null : null,
        dataJson: JSON.stringify({
          ...dataJson,
          metaLead,
        }),
      },
    })
  }

  if (result.contact?.id) {
    await prisma.contact.update({
      where: { id: result.contact.id },
      data: {
        source: 'meta_lead_ad',
        ...(extractedFields.nationality ? { nationality: extractedFields.nationality } : {}),
      },
    })
  }

  if (conversationId) {
    await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        channel: 'meta_lead_ads',
        lastInboundAt: receivedAt,
      },
    })
  }

  if (messageId) {
    await prisma.message.update({
      where: { id: messageId },
      data: { channel: 'meta_lead_ads' },
    })
  }

  if (leadId) {
    await applyLeadgenRules({
      leadId,
      conversationId,
      receivedAt,
      serviceBucket,
    })
  }

  await prisma.externalEventLog.update({
    where: { provider_externalId: { provider: 'meta', externalId: leadgenId } },
    data: {
      status: 'processed',
      processedAt: new Date(),
    },
  })

  await prisma.metaLeadgenState.update({
    where: { workspaceId },
    data: {
      lastLeadgenProcessedAt: new Date(),
      selectedFormIds: JSON.stringify(
        Array.from(
          new Set(
            [
              ...(state.selectedFormIds ? JSON.parse(state.selectedFormIds) : []),
              metaLead.formId,
            ].filter(Boolean)
          )
        )
      ),
    },
  })

  return {
    ok: true,
    leadId,
    conversationId,
    messageId,
  }
}

async function applyLeadgenRules(data: {
  leadId: number
  conversationId?: number
  receivedAt: Date
  serviceBucket: ServiceBucket
}) {
  const { leadId, conversationId, receivedAt, serviceBucket } = data
  const slaDueAt = computeSlaDueAt(receivedAt, 2, 'Asia/Dubai')

  const { assigneeId, assigneeName } = await assignLeadByService(serviceBucket, WORKSPACE_ID)

  const existingLead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { dataJson: true },
  })
  const existingData = existingLead?.dataJson ? JSON.parse(existingLead.dataJson) : {}

  await prisma.lead.update({
    where: { id: leadId },
    data: {
      ...(assigneeId ? { assignedUserId: assigneeId } : {}),
      dataJson: JSON.stringify({
        ...existingData,
        ingestion: {
          receivedAt: receivedAt.toISOString(),
          serviceBucket,
          slaDueAt: slaDueAt.toISOString(),
          assignedAt: new Date().toISOString(),
        },
      }),
    },
  })

  if (conversationId && assigneeId) {
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { assignedUserId: assigneeId },
    })
  }

  await prisma.task.create({
    data: {
      leadId,
      conversationId: conversationId || null,
      title: `SLA Check: Contact lead within 2 hours`,
      description: `Lead Ad received at ${receivedAt.toISOString()}.`,
      type: 'CALL',
      dueAt: slaDueAt,
      status: 'OPEN',
      priority: 'HIGH',
      idempotencyKey: `leadgen_sla:${leadId}`,
      ...(assigneeId ? { assignedUserId: assigneeId } : {}),
    },
  })

  console.log('[SLA-SCHEDULED]', {
    leadId,
    dueAt: slaDueAt.toISOString(),
    assigneeId: assigneeId || 'N/A',
    assigneeName: assigneeName || 'N/A',
    serviceType: serviceBucket,
  })

  await triggerLeadgenWhatsAppTemplate(leadId)
}

async function triggerLeadgenWhatsAppTemplate(leadId: number) {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: { contact: true },
  })

  if (!lead || !lead.contact?.phone) {
    console.log('[LEADGEN-WA-SKIP]', { leadId, reason: 'no_phone' })
    return
  }

  const integration = await prisma.integration.findUnique({
    where: { name: 'whatsapp' },
    select: { isEnabled: true },
  })

  if (!integration?.isEnabled) {
    console.log('[LEADGEN-WA-SKIP]', { leadId, reason: 'whatsapp_disabled' })
    return
  }

  const dataJson = lead.dataJson ? JSON.parse(lead.dataJson) : {}
  if (dataJson?.metaLead?.autoWhatsAppSentAt) {
    console.log('[LEADGEN-WA-SKIP]', { leadId, reason: 'already_sent' })
    return
  }

  const rules = await prisma.automationRule.findMany({
    where: { trigger: 'LEAD_CREATED', enabled: true, isActive: true },
    orderBy: { id: 'asc' },
  })

  if (rules.length === 0) {
    console.log('[LEADGEN-WA-SKIP]', { leadId, reason: 'no_rules' })
    return
  }

  const context: AutomationContext = {
    lead,
    contact: lead.contact,
    expiries: [],
    recentMessages: [],
  }

  let templateTriggered = false

  for (const rule of rules) {
    const actions = typeof rule.actions === 'string' ? JSON.parse(rule.actions) : rule.actions
    const hasTemplate = Array.isArray(actions) && actions.some((action: any) =>
      action.type === 'SEND_WHATSAPP_TEMPLATE' || action.type === 'SEND_WHATSAPP'
    )

    if (!hasTemplate) {
      continue
    }

    const result = await runRuleOnLead(rule, context)
    if (result.status === 'SUCCESS') {
      templateTriggered = true
      break
    }
  }

  if (templateTriggered) {
    const updated = lead.dataJson ? JSON.parse(lead.dataJson) : {}
    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        dataJson: JSON.stringify({
          ...updated,
          metaLead: {
            ...(updated.metaLead || {}),
            autoWhatsAppSentAt: new Date().toISOString(),
          },
        }),
      },
    })
    console.log('[LEADGEN-WA-TEMPLATE-SENT]', { leadId })
  }
}

export async function listRecentLeadgenEvents(limit: number = 50) {
  return prisma.externalEventLog.findMany({
    where: { provider: 'meta', eventType: 'leadgen' },
    orderBy: { receivedAt: 'desc' },
    take: limit,
  })
}

export async function listLeadgenErrors(limit: number = 10) {
  return prisma.externalEventLog.findMany({
    where: { provider: 'meta', eventType: 'leadgen', status: 'error' },
    orderBy: { receivedAt: 'desc' },
    take: limit,
  })
}

export async function getLeadgenStateSummary(workspaceId: number = WORKSPACE_ID) {
  const state = await ensureLeadgenState(workspaceId)
  const connection = await prisma.metaConnection.findFirst({
    where: { workspaceId, status: 'connected' },
    orderBy: { createdAt: 'desc' },
  })
  return { state, connection }
}

export async function fetchLeadgenForms(pageId: string, accessToken: string) {
  const data = await graphAPIGet<{ data: Array<{ id: string; name?: string }> }>(
    `/${pageId}/leadgen_forms`,
    accessToken
  )
  return data.data || []
}

export async function fetchLeadgenIdsForForm(
  formId: string,
  accessToken: string,
  since?: string | null
) {
  const url = new URL(`https://graph.facebook.com/v21.0/${formId}/leads`)
  url.searchParams.set('access_token', accessToken)
  url.searchParams.set('fields', 'id,created_time,form_id,ad_id')
  url.searchParams.set('limit', '50')
  if (since) {
    url.searchParams.set('since', since)
  }

  const response = await fetch(url.toString())
  const data = await response.json()
  if (!response.ok) {
    throw new Error(data?.error?.message || 'Failed to fetch leads')
  }
  return data.data || []
}
