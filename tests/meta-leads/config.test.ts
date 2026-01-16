import { describe, it, expect } from 'vitest'
import { getWebhookBaseUrl, maskSecret } from '../helpers/metaLeadsTestHelpers'

describe('Meta Leads - Environment Configuration', () => {
  it('requires Meta Lead Ads environment variables', () => {
    const required = ['META_APP_SECRET', 'META_VERIFY_TOKEN', 'META_APP_ID']
    const missing = required.filter((key) => !process.env[key])
    const redirectUri = process.env.META_OAUTH_REDIRECT_URI || process.env.META_REDIRECT_URI

    if (missing.length > 0) {
      const details = missing
        .map((key) => `${key}=MISSING`)
        .join(', ')
      expect(missing, `Missing required env vars: ${details}`).toHaveLength(0)
    }

    expect(
      redirectUri,
      'Missing META_OAUTH_REDIRECT_URI or META_REDIRECT_URI'
    ).toBeTruthy()

    const appSecret = process.env.META_APP_SECRET || ''
    const verifyToken = process.env.META_VERIFY_TOKEN || ''

    expect(maskSecret(appSecret)).toBeTruthy()
    expect(maskSecret(verifyToken)).toBeTruthy()
  })

  it('requires a stable public URL in production', () => {
    const baseUrl = getWebhookBaseUrl()

    if (process.env.NODE_ENV === 'production') {
      expect(
        baseUrl,
        'NEXT_PUBLIC_APP_URL or APP_PUBLIC_URL must be set in production'
      ).toBeTruthy()
    }
  })
})
