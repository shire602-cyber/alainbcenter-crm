import crypto from 'crypto'
import { NextRequest } from 'next/server'

type LeadgenWebhookPayload = {
  object: 'page'
  entry: Array<{
    id: string
    changes: Array<{
      field?: string
      value: {
        leadgen_id: string
        form_id?: string | null
        ad_id?: string | null
        page_id?: string | null
        created_time?: number | null
      }
    }>
  }>
}

export function buildLeadgenWebhookPayload(input: {
  leadgenId: string
  pageId: string
  formId?: string | null
  adId?: string | null
  createdTime?: number | null
}): LeadgenWebhookPayload {
  return {
    object: 'page',
    entry: [
      {
        id: input.pageId,
        changes: [
          {
            field: 'leadgen',
            value: {
              leadgen_id: input.leadgenId,
              form_id: input.formId ?? null,
              ad_id: input.adId ?? null,
              page_id: input.pageId,
              created_time: input.createdTime ?? Math.floor(Date.now() / 1000),
            },
          },
        ],
      },
    ],
  }
}

export function signMetaPayload(payload: any, appSecret: string): string {
  const body = typeof payload === 'string' ? payload : JSON.stringify(payload)
  const signature = crypto.createHmac('sha256', appSecret).update(body).digest('hex')
  return `sha256=${signature}`
}

export function buildMetaWebhookRequest(input: {
  url: string
  payload: any
  appSecret?: string | null
  signatureOverride?: string | null
}): NextRequest {
  const body = JSON.stringify(input.payload)
  const signature =
    input.signatureOverride ??
    (input.appSecret ? signMetaPayload(body, input.appSecret) : null)

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  if (signature) {
    headers['x-hub-signature-256'] = signature
  }

  return new NextRequest(input.url, {
    method: 'POST',
    body,
    headers,
  })
}

export function maskSecret(value?: string | null, visible: number = 4): string {
  if (!value) return ''
  if (value.length <= visible) return '*'.repeat(value.length)
  return `${'*'.repeat(Math.max(0, value.length - visible))}${value.slice(-visible)}`
}

export function getWebhookBaseUrl(): string | null {
  const url = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_PUBLIC_URL || null
  if (!url) return null
  return url.replace(/\/$/, '')
}
