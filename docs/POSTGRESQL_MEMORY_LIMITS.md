# PostgreSQL Memory Limits Configuration

## Issue: PostgreSQL Out of Memory (Error Code 53200)

**Error Message:**
```
ConnectorError: QueryError(PostgresError { code: "53200", message: "out of memory", 
detail: Some("Failed on request of size 216 in memory context \"MessageContext\".") })
```

This error occurs when PostgreSQL runs out of memory while processing large queries, typically when:
- Loading too many messages in a single query (e.g., 500+ messages)
- Messages have large `body` text fields
- Messages include multiple attachments
- Result set exceeds PostgreSQL's `work_mem` or `max_message_size` limits

## Solution Applied

### 1. Reduced Message Limit
- **Before**: Loading up to 500 messages per conversation
- **After**: Loading only 50 most recent messages per conversation
- **File**: `src/app/api/inbox/conversations/[id]/route.ts`
- **Change**: `take: 500` → `take: 50`, `orderBy: 'asc'` → `orderBy: 'desc'` (most recent first)

### 2. Message Ordering
- Messages are now fetched in descending order (newest first)
- Array is reversed for display (oldest to newest chronological order)
- This ensures we get the 50 most relevant (recent) messages

## PostgreSQL Configuration Limits

### For Vercel Postgres / Neon

**You cannot directly modify PostgreSQL configuration** on managed services like Vercel Postgres or Neon. These settings are controlled by the hosting provider.

**What you CAN do:**

1. **Upgrade Database Plan**
   - Vercel Postgres: Upgrade to a higher tier with more memory
   - Neon: Upgrade to a higher tier (Pro/Scale plans have more memory)
   - Check your current plan limits in the provider dashboard

2. **Optimize Queries** (Already Done)
   - ✅ Reduced message limit from 500 to 50
   - ✅ Order by most recent (desc) instead of oldest (asc)
   - ✅ Use selective field loading (`select` instead of `include`)

3. **Implement Pagination** (Future Enhancement)
   - Load messages in batches (e.g., 50 at a time)
   - Frontend can request older messages on scroll
   - API endpoint: `GET /api/inbox/conversations/[id]/messages?page=1&limit=50`

### For Self-Hosted PostgreSQL

If you're running your own PostgreSQL instance, you can adjust these settings in `postgresql.conf`:

```conf
# Increase work memory for sorting/hashing (default: 4MB)
work_mem = 16MB

# Increase maintenance work memory (default: 64MB)
maintenance_work_mem = 256MB

# Shared buffers (default: 128MB, recommended: 25% of RAM)
shared_buffers = 256MB

# Effective cache size (default: 4GB, should be 50-75% of total RAM)
effective_cache_size = 2GB

# Max message size (default: unlimited, but some connections may limit)
# This is typically set at the connection level, not PostgreSQL config
```

**To apply changes:**
```bash
# Edit postgresql.conf
sudo nano /etc/postgresql/15/main/postgresql.conf

# Reload configuration (no downtime)
sudo systemctl reload postgresql
# OR
SELECT pg_reload_conf();
```

## Current Implementation

### Message Loading Strategy
- **Initial Load**: 50 most recent messages (ordered by `createdAt DESC`)
- **Display Order**: Reversed to chronological (oldest to newest)
- **Future**: Pagination API for loading older messages

### Code Changes
```typescript
// src/app/api/inbox/conversations/[id]/route.ts
messages: {
  orderBy: { createdAt: 'desc' }, // Most recent first
  take: 50, // Reduced from 500 to prevent memory errors
  // ... select fields
}

// Reverse for display (chronological order)
const messagesInOrder = conversation.messages.slice().reverse()
```

## Monitoring

### Check for Memory Issues
1. **Vercel Logs**: Look for error code `53200` or "out of memory"
2. **Database Metrics**: Check memory usage in Vercel/Neon dashboard
3. **Query Performance**: Monitor slow queries (>1 second)

### Warning Signs
- Frequent 53200 errors
- Conversations with 100+ messages failing to load
- Slow conversation loading times (>2 seconds)

## Recommendations

1. **For Production**: 
   - ✅ Already implemented: Reduced to 50 messages
   - ⚠️ Consider: Upgrade database plan if you have very active conversations
   - 📋 Future: Implement pagination for loading older messages

2. **For Development**:
   - Monitor conversation sizes
   - Archive old conversations periodically
   - Consider soft-deleting messages older than 90 days

3. **Database Maintenance**:
   - Regularly clean up old data (messages, logs)
   - Archive conversations that haven't been active in 6+ months
   - Consider separate storage for message history (e.g., S3 for old messages)

## Testing

To verify the fix works:

1. **Test with Large Conversation**:
   ```bash
   # Find a conversation with many messages
   # Load it in the UI
   # Should load successfully (50 most recent messages)
   ```

2. **Verify Memory Usage**:
   - Check Vercel logs for any 53200 errors
   - Should see no memory errors after fix

3. **Test Message Ordering**:
   - Verify messages display in chronological order (oldest to newest)
   - Verify most recent messages are shown (not oldest 50)

## Related Files

- `src/app/api/inbox/conversations/[id]/route.ts` - Conversation loading endpoint
- `src/lib/prisma.ts` - Prisma client configuration
- `prisma/schema.prisma` - Database schema

## Additional Resources

- [PostgreSQL Configuration](https://www.postgresql.org/docs/current/config-setting.html)
- [Vercel Postgres Limits](https://vercel.com/docs/storage/vercel-postgres/limits)
- [Neon PostgreSQL Limits](https://neon.tech/docs/introduction/limits)

