// AI qualification helper for leads
// Generates aiScore (0-100) and aiNotes based on lead data

type LeadQualificationData = {
  fullName: string
  phone: string
  email?: string | null
  leadType?: string | null
  source?: string | null
  notes?: string | null
}

/**
 * Qualify a lead using AI (stub - can be replaced with OpenAI)
 * Returns aiScore (0-100) and aiNotes
 * 
 * Scoring logic:
 * - HOT (70-100): Has email + phone, specific service request, detailed notes
 * - WARM (40-69): Has phone, service type specified, basic info
 * - COLD (0-39): Missing info, vague requests, no service type
 */
export async function qualifyLead(data: LeadQualificationData): Promise<{
  aiScore: number
  aiNotes: string
}> {
  // TODO: Replace with actual OpenAI API call
  // const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  // const completion = await openai.chat.completions.create({...})

  let score = 50 // Base score
  const factors: string[] = []

  // Email presence (+20 points)
  if (data.email && data.email.includes('@')) {
    score += 20
    factors.push('Has valid email')
  }

  // Phone format check (+10 points if valid format)
  if (data.phone && (data.phone.startsWith('+') || data.phone.length >= 10)) {
    score += 10
    factors.push('Valid phone number')
  }

  // Service type specified (+15 points)
  if (data.leadType && data.leadType.trim() !== '') {
    score += 15
    factors.push(`Service type: ${data.leadType}`)
  }

  // Detailed notes (+15 points if notes > 20 chars)
  if (data.notes && data.notes.length > 20) {
    score += 15
    factors.push('Detailed notes provided')
  } else if (!data.notes || data.notes.length === 0) {
    score -= 10
    factors.push('No notes provided')
  }

  // Source quality
  // Note: source is normalized to 'facebook_ad'/'instagram_ad' (singular) in leadIngest/ingest route
  // Check for normalized values (not the plural 'facebook_ads'/'instagram_ads')
  // Both Facebook and Instagram Lead Ads are equally valid paid advertising channels
  if (data.source === 'website' || data.source === 'facebook_ad' || data.source === 'instagram_ad') {
    score += 5
    factors.push('Quality source')
  }

  // Clamp score between 0-100
  score = Math.max(0, Math.min(100, score))

  // Generate notes
  let category = 'COLD'
  if (score >= 70) category = 'HOT'
  else if (score >= 40) category = 'WARM'

  const notes = `${category} lead (${score}/100). Factors: ${factors.join(', ')}. ${
    score >= 70 ? 'Ready for immediate follow-up.' :
    score >= 40 ? 'Requires nurturing and qualification.' :
    'Needs more information to qualify.'
  }`

  return { aiScore: score, aiNotes: notes }
}

/**
 * Re-qualify a lead based on recent conversation activity
 * Updates aiScore and aiNotes based on new messages and context
 */
export async function requalifyLeadFromConversation(leadId: number): Promise<void> {
  const { prisma } = await import('./prisma')

  // Load lead with all relevant data
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: {
      contact: true,
      conversations: {
        include: {
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 10, // Last 10 messages
          },
        },
        orderBy: { lastMessageAt: 'desc' },
        take: 1, // Most recent conversation
      },
      expiryItems: {
        orderBy: { expiryDate: 'asc' },
        take: 5,
      },
      serviceType: true,
    },
  })

  if (!lead) {
    throw new Error('Lead not found')
  }

  // Collect conversation context
  const recentMessages = lead.conversations[0]?.messages || []
  const inboundMessages = recentMessages.filter(
    (m: any) => m.direction === 'INBOUND' || m.direction === 'IN' || m.direction === 'inbound'
  )
  const outboundMessages = recentMessages.filter(
    (m: any) => m.direction === 'OUTBOUND' || m.direction === 'OUT' || m.direction === 'outbound'
  )

  // Build qualification data from conversation
  const conversationText = inboundMessages
    .map((m: any) => m.body || '')
    .join(' ')
    .toLowerCase()

  // Re-qualify using enhanced logic
  let score = lead.aiScore || 50 // Start with existing score
  const factors: string[] = []

  // Engagement signals (+points)
  if (inboundMessages.length > 0) {
    score += 10
    factors.push(`${inboundMessages.length} inbound message(s)`)
  }

  if (outboundMessages.length > 0) {
    score += 5
    factors.push('Has outbound replies')
  }

  // Keyword analysis
  const hotKeywords = ['urgent', 'asap', 'immediately', 'today', 'now', 'interested', 'ready']
  const warmKeywords = ['maybe', 'considering', 'thinking', 'information', 'details', 'price']
  const coldKeywords = ['not interested', 'no thanks', 'later', 'maybe later']

  const hasHotKeyword = hotKeywords.some((kw) => conversationText.includes(kw))
  const hasWarmKeyword = warmKeywords.some((kw) => conversationText.includes(kw))
  const hasColdKeyword = coldKeywords.some((kw) => conversationText.includes(kw))

  if (hasHotKeyword) {
    score += 15
    factors.push('Hot keywords detected')
  } else if (hasWarmKeyword) {
    score += 8
    factors.push('Warm keywords detected')
  }

  if (hasColdKeyword) {
    score -= 20
    factors.push('Cold signals detected')
  }

  // Service-specific keywords
  const serviceKeywords = [
    'visa',
    'business setup',
    'license',
    'renewal',
    'family visa',
    'investor visa',
    'freezone',
    'mainland',
  ]
  const hasServiceKeyword = serviceKeywords.some((kw) => conversationText.includes(kw))
  if (hasServiceKeyword) {
    score += 10
    factors.push('Service-specific interest')
  }

  // Response time (if we replied quickly, that's good)
  if (inboundMessages.length > 0 && outboundMessages.length > 0) {
    const lastInbound = inboundMessages[0]
    const firstOutboundAfter = outboundMessages.find(
      (m: any) => new Date(m.createdAt) > new Date(lastInbound.createdAt)
    )
    if (firstOutboundAfter) {
      const responseTimeHours =
        (new Date(firstOutboundAfter.createdAt).getTime() -
          new Date(lastInbound.createdAt).getTime()) /
        (1000 * 60 * 60)
      if (responseTimeHours < 2) {
        score += 10
        factors.push('Fast response (<2h)')
      } else if (responseTimeHours < 24) {
        score += 5
        factors.push('Good response time (<24h)')
      }
    }
  }

  // Expiry urgency
  if (lead.expiryItems && lead.expiryItems.length > 0) {
    const nearestExpiry = lead.expiryItems[0]
    const daysUntil = Math.ceil(
      (new Date(nearestExpiry.expiryDate).getTime() - new Date().getTime()) /
        (1000 * 60 * 60 * 24)
    )
    if (daysUntil <= 30) {
      score += 10
      factors.push('Urgent expiry (<30 days)')
    } else if (daysUntil <= 90) {
      score += 5
      factors.push('Upcoming expiry (<90 days)')
    }
  }

  // Clamp score
  score = Math.max(0, Math.min(100, score))

  // Generate updated notes
  let category = 'COLD'
  if (score >= 70) category = 'HOT'
  else if (score >= 40) category = 'WARM'

  const notes = `${category} lead (${score}/100). ${factors.join(', ')}. ${
    recentMessages.length > 0
      ? `Recent conversation activity: ${inboundMessages.length} inbound, ${outboundMessages.length} outbound.`
      : ''
  } ${
    score >= 70
      ? 'Ready for immediate follow-up.'
      : score >= 40
        ? 'Requires nurturing and qualification.'
        : 'Needs more information to qualify.'
  }`

  // Update lead
  await prisma.lead.update({
    where: { id: leadId },
    data: {
      aiScore: Math.round(score),
      aiNotes: notes,
    },
  })
}
