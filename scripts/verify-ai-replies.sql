-- Verification Queries for AI Reply System
-- Run these queries to verify the system is working correctly

-- 1. Verify no template messages exist
SELECT 
  id,
  LEFT(body, 100) as body_preview,
  direction,
  channel,
  createdAt
FROM "Message"
WHERE direction = 'OUTBOUND'
  AND (
    body LIKE '%Thank you for your interest%' 
    OR body LIKE '%What specific service are you looking for%'
    OR body LIKE '%What is your timeline%'
    OR body LIKE '%Looking forward to helping you%'
  )
ORDER BY createdAt DESC
LIMIT 10;

-- 2. Check AutoReplyLog for fallback usage and decisions
SELECT 
  id,
  leadId,
  conversationId,
  decision,
  decisionReason,
  hasUsefulContext,
  usedFallback,
  replySent,
  replyStatus,
  LEFT(replyText, 100) as replyPreview,
  retrievalDocsCount,
  retrievalSimilarity,
  createdAt
FROM "AutoReplyLog"
ORDER BY createdAt DESC
LIMIT 20;

-- 3. Verify conversation uniqueness (should return 0 rows)
SELECT 
  "contactId",
  channel,
  COUNT(*) as count
FROM "Conversation"
GROUP BY "contactId", channel
HAVING COUNT(*) > 1;

-- 4. Check message counts per conversation
SELECT 
  c.id as conversationId,
  c."contactId",
  c.channel,
  COUNT(m.id) as messageCount,
  COUNT(CASE WHEN m.direction = 'INBOUND' THEN 1 END) as inboundCount,
  COUNT(CASE WHEN m.direction = 'OUTBOUND' THEN 1 END) as outboundCount
FROM "Conversation" c
LEFT JOIN "Message" m ON m."conversationId" = c.id
GROUP BY c.id, c."contactId", c.channel
ORDER BY messageCount DESC
LIMIT 10;

-- 5. Check for leads with multiple conversations (should be 0)
SELECT 
  l.id as leadId,
  l."contactId",
  COUNT(DISTINCT c.id) as conversationCount
FROM "Lead" l
JOIN "Conversation" c ON c."leadId" = l.id
WHERE c.channel = 'whatsapp'
GROUP BY l.id, l."contactId"
HAVING COUNT(DISTINCT c.id) > 1
LIMIT 10;

-- 6. Recent AI replies (check they're not templates)
SELECT 
  m.id,
  m."conversationId",
  LEFT(m.body, 150) as replyPreview,
  m.direction,
  m.channel,
  m.createdAt,
  CASE 
    WHEN m.body LIKE '%Thank you for your interest%' THEN 'TEMPLATE DETECTED'
    WHEN m.body LIKE '%What specific service%' THEN 'TEMPLATE DETECTED'
    WHEN m.body LIKE '%What is your timeline%' THEN 'TEMPLATE DETECTED'
    ELSE 'OK'
  END as templateCheck
FROM "Message" m
WHERE m.direction = 'OUTBOUND'
  AND m.channel = 'whatsapp'
ORDER BY m.createdAt DESC
LIMIT 20;

-- 7. Check AutoReplyLog success rate
SELECT 
  decision,
  COUNT(*) as count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as percentage
FROM "AutoReplyLog"
GROUP BY decision
ORDER BY count DESC;

-- 8. Check fallback usage rate
SELECT 
  usedFallback,
  COUNT(*) as count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as percentage
FROM "AutoReplyLog"
WHERE replySent = true
GROUP BY usedFallback;

