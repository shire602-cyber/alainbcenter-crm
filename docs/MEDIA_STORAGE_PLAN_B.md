# Media Storage Plan B: Durable Storage Design

## Overview

Plan B implements durable media storage to solve the problem of expired WhatsApp media URLs. This design document describes the architecture without implementation.

## Problem Statement

**Current Issue (Layer A):**
- WhatsApp media URLs expire after a short period (typically 24-48 hours)
- Once expired, media cannot be retrieved even with valid `providerMediaId`
- Old messages with expired media become permanently unavailable

**Solution (Plan B):**
- Download media on ingest (when webhook receives it)
- Store in durable storage (S3/R2)
- Serve from storage first, fallback to provider if storage miss

## Architecture

### Components

1. **Ingest Job** (`src/lib/media/ingestJob.ts`)
   - Triggered by webhook handler after message creation
   - Downloads media from WhatsApp using `providerMediaId`
   - Stores to S3/R2 with key: `media/{messageId}/{providerMediaId}`
   - Updates Message record: `mediaStoredUrl` field

2. **Storage Interface** (`src/lib/media/storage.ts`)
   - Abstract interface: `StorageBackend`
   - Implementations:
     - `LocalFileStorage` (dev/testing)
     - `S3Storage` (production)
     - `R2Storage` (production alternative)

3. **Proxy Route Enhancement** (`src/app/api/media/messages/[id]/route.ts`)
   - Check storage first: `getStoredMedia(messageId)`
   - If found: serve from storage (200/206 with Range support)
   - If not found: fallback to Layer A (fetch from WhatsApp)
   - If fallback succeeds: trigger async storage write

### Data Model Changes

```prisma
model Message {
  // ... existing fields ...
  mediaStoredUrl String? // S3/R2 URL if stored (e.g., "s3://bucket/media/123/456")
  mediaStoredAt   DateTime? // When media was stored
  mediaStorageBackend String? // "s3" | "r2" | "local"
}
```

### Storage Key Format

```
{backend}://{bucket}/media/{messageId}/{providerMediaId}
```

Example:
- S3: `s3://alainbcenter-media/media/1234/2087129492123864`
- R2: `r2://alainbcenter-media/media/1234/2087129492123864`
- Local: `file://.media-cache/1234`

### Flow Diagram

```
Webhook → Create Message → Ingest Job (async)
                              ↓
                    Download from WhatsApp
                              ↓
                    Store to S3/R2
                              ↓
                    Update Message.mediaStoredUrl

User Request → Proxy Route
                    ↓
            Check storage (mediaStoredUrl)
                    ↓
        ┌───────────┴───────────┐
        │                       │
    Found in storage      Not found
        │                       │
    Serve from S3/R2    Fallback to WhatsApp
        │                       │
    Return 200/206      If succeeds: async store
```

## Implementation Details

### 1. Ingest Job

**Trigger:**
- After `handleInboundMessageAutoMatch` creates message with `providerMediaId`
- Queue job: `mediaIngestQueue.add({ messageId, providerMediaId })`

**Job Handler:**
```typescript
async function ingestMediaJob({ messageId, providerMediaId }) {
  // 1. Get access token
  const token = await getWhatsAppAccessToken()
  
  // 2. Get download URL
  const mediaInfo = await getWhatsAppDownloadUrl(providerMediaId, token)
  
  // 3. Download media
  const stream = await fetchWhatsAppMediaStream(mediaInfo.url, token)
  const buffer = await stream.arrayBuffer()
  
  // 4. Store to backend
  const storedUrl = await storageBackend.put(
    `media/${messageId}/${providerMediaId}`,
    Buffer.from(buffer),
    mediaInfo.mimeType,
    mediaInfo.fileName
  )
  
  // 5. Update message
  await prisma.message.update({
    where: { id: messageId },
    data: {
      mediaStoredUrl: storedUrl,
      mediaStoredAt: new Date(),
      mediaStorageBackend: 's3', // or 'r2'
    },
  })
}
```

### 2. Storage Backend Interface

```typescript
interface StorageBackend {
  put(key: string, data: Buffer, contentType: string, filename?: string): Promise<string>
  get(key: string): Promise<{ stream: Readable; contentType: string; size: number } | null>
  delete(key: string): Promise<void>
  exists(key: string): Promise<boolean>
}
```

### 3. Proxy Route Changes

```typescript
// In GET handler, after checking message exists and is media type:

// PRIORITY 1: Check storage
if (message.mediaStoredUrl) {
  const stored = await storageBackend.get(message.mediaStoredUrl)
  if (stored) {
    // Serve from storage with Range support
    return streamFromStorage(stored, rangeHeader)
  }
}

// PRIORITY 2: Fallback to Layer A (existing logic)
// ... fetch from WhatsApp ...

// PRIORITY 3: If fallback succeeds, trigger async storage
if (mediaResponse.ok) {
  queueMediaIngest(messageId, providerMediaId).catch(console.error)
}
```

## Configuration

### Environment Variables

```bash
# Storage backend selection
MEDIA_STORAGE_BACKEND=s3  # or "r2" or "local"

# S3 Configuration
AWS_S3_BUCKET=alainbcenter-media
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1

# R2 Configuration (alternative)
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET=alainbcenter-media
R2_ENDPOINT=https://...

# Queue Configuration (for async ingest)
MEDIA_INGEST_QUEUE_URL=...  # BullMQ, SQS, etc.
```

## Cost Considerations

### Storage Costs
- **S3 Standard**: ~$0.023/GB/month
- **R2**: ~$0.015/GB/month (no egress fees)
- **Example**: 10,000 messages × 500KB avg = 5GB = ~$0.08/month

### Egress Costs
- **S3**: ~$0.09/GB (first 10TB)
- **R2**: $0 (no egress fees) ← **Recommended for high traffic**

### Retention Policy
- Store indefinitely (low cost)
- Or implement TTL: delete after 90 days of inactivity
- Or archive to Glacier after 30 days

## Migration Strategy

1. **Phase 1**: Deploy storage backend (no ingest yet)
2. **Phase 2**: Enable ingest for NEW messages only
3. **Phase 3**: Backfill job for old messages (optional)
4. **Phase 4**: Switch proxy to storage-first

## Rollback Plan

If Plan B causes issues:
- Set `MEDIA_STORAGE_BACKEND=local` (dev mode)
- Proxy falls back to Layer A automatically
- No data loss (messages still have `providerMediaId`)

## Testing

- Unit tests for storage backends
- Integration tests for ingest job
- E2E test: send media → verify stored → verify served from storage
- Load test: 1000 concurrent media requests

## Future Enhancements

- CDN integration (CloudFront/Cloudflare) for faster delivery
- Image optimization (thumbnails, WebP conversion)
- Video transcoding (multiple resolutions)
- Automatic cleanup of orphaned storage objects








