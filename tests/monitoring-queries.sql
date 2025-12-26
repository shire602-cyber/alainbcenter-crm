-- Monitoring Queries for Anti-Duplicate Detection
-- Run these periodically to detect regressions

-- 1. Duplicate Outbound Detection
-- This query should ALWAYS return empty (0 rows)
-- If it returns rows, we have a critical bug
SELECT 
  triggerProviderMessageId,
  COUNT(*) as duplicate_count,
  MIN(createdAt) as first_sent,
  MAX(createdAt) as last_sent
FROM "OutboundMessageLog"
WHERE triggerProviderMessageId IS NOT NULL
GROUP BY triggerProviderMessageId
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC;

-- 2. Conversation Repeat Detection
-- Alert if same question asked >2 times within 2 minutes
SELECT 
  c.id as conversation_id,
  c."lastQuestionKey",
  c."lastQuestionAt",
  COUNT(m.id) as question_repeat_count
FROM "Conversation" c
JOIN "Message" m ON m."conversationId" = c.id
WHERE 
  c."lastQuestionKey" IS NOT NULL
  AND m.direction = 'OUTBOUND'
  AND m.body LIKE '%' || c."lastQuestionKey" || '%'
  AND m."createdAt" >= NOW() - INTERVAL '2 minutes'
GROUP BY c.id, c."lastQuestionKey", c."lastQuestionAt"
HAVING COUNT(m.id) > 2
ORDER BY question_repeat_count DESC;

-- 3. Inbound Dedupe Effectiveness
-- Check how many duplicates were caught
SELECT 
  DATE_TRUNC('hour', "receivedAt") as hour,
  COUNT(*) as total_inbound,
  COUNT(CASE WHEN "processingStatus" = 'COMPLETED' THEN 1 END) as processed,
  COUNT(CASE WHEN "processingStatus" = 'FAILED' THEN 1 END) as failed
FROM "InboundMessageDedup"
WHERE "receivedAt" >= NOW() - INTERVAL '24 hours'
GROUP BY DATE_TRUNC('hour', "receivedAt")
ORDER BY hour DESC;

-- 4. Outbound Log Coverage
-- Check if all outbound messages are logged
SELECT 
  DATE_TRUNC('hour', m."createdAt") as hour,
  COUNT(DISTINCT m.id) as outbound_messages,
  COUNT(DISTINCT oml.id) as logged_outbound,
  COUNT(DISTINCT m.id) - COUNT(DISTINCT oml.id) as missing_logs
FROM "Message" m
LEFT JOIN "OutboundMessageLog" oml ON oml."outboundMessageId" = m.id
WHERE 
  m.direction = 'OUTBOUND'
  AND m.channel = 'whatsapp'
  AND m."createdAt" >= NOW() - INTERVAL '24 hours'
GROUP BY DATE_TRUNC('hour', m."createdAt")
HAVING COUNT(DISTINCT m.id) - COUNT(DISTINCT oml.id) > 0
ORDER BY hour DESC;

-- 5. Flow State Consistency Check
-- Check for conversations stuck in same step
SELECT 
  c.id,
  c."flowKey",
  c."flowStep",
  c."lastQuestionKey",
  c."lastQuestionAt",
  COUNT(m.id) as messages_since_question,
  MAX(m."createdAt") as last_message_at
FROM "Conversation" c
LEFT JOIN "Message" m ON m."conversationId" = c.id 
  AND m."createdAt" > c."lastQuestionAt"
WHERE 
  c."flowStep" IS NOT NULL
  AND c."lastQuestionAt" < NOW() - INTERVAL '10 minutes'
  AND c."lastQuestionAt" IS NOT NULL
GROUP BY c.id, c."flowKey", c."flowStep", c."lastQuestionKey", c."lastQuestionAt"
HAVING COUNT(m.id) > 3
ORDER BY messages_since_question DESC;

