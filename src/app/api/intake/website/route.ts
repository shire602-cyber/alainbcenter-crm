import { NextRequest, NextResponse } from 'next/server'
import { ingestLead } from '@/lib/leadIngest'
import { prisma } from '@/lib/prisma'

// In-memory rate limiting (for production, use Redis)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT_WINDOW = 60 * 60 * 1000 // 1 hour
const RATE_LIMIT_MAX = 5 // Max 5 submissions per hour per IP

/**
 * Website intake form submission endpoint
 * Handles form submissions from the public website with spam protection
 */
export async function POST(req: NextRequest) {
  try {
    // Rate limiting by IP
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0] || 
               req.headers.get('x-real-ip') || 
               'unknown'
    
    const now = Date.now()
    const rateLimitKey = `website_intake_${ip}`
    const rateLimit = rateLimitMap.get(rateLimitKey)
    
    if (rateLimit) {
      if (now < rateLimit.resetAt) {
        if (rateLimit.count >= RATE_LIMIT_MAX) {
          return NextResponse.json(
            { error: 'Rate limit exceeded. Please try again later.' },
            { status: 429 }
          )
        }
        rateLimit.count++
      } else {
        // Reset window
        rateLimitMap.set(rateLimitKey, { count: 1, resetAt: now + RATE_LIMIT_WINDOW })
      }
    } else {
      rateLimitMap.set(rateLimitKey, { count: 1, resetAt: now + RATE_LIMIT_WINDOW })
    }
    
    // Clean up old entries (simple cleanup)
    if (Math.random() < 0.01) { // 1% chance to clean up
      for (const [key, value] of rateLimitMap.entries()) {
        if (now >= value.resetAt) {
          rateLimitMap.delete(key)
        }
      }
    }

    let body
    try {
      body = await req.json()
    } catch (jsonError) {
      return NextResponse.json(
        { error: 'Invalid JSON body' },
        { status: 400 }
      )
    }

    // Honeypot spam protection
    if (body.website || body.url || body._gotcha || body.honeypot) {
      // Honeypot field filled - likely spam
      console.warn('Honeypot triggered for website intake:', ip)
      return NextResponse.json(
        { success: true, message: 'Form submitted successfully' },
        { status: 200 }
      ) // Return success to not reveal honeypot
    }

    // Validate required fields
    if (!body.fullName || typeof body.fullName !== 'string' || body.fullName.trim().length < 2) {
      return NextResponse.json(
        { error: 'Full name is required and must be at least 2 characters' },
        { status: 400 }
      )
    }

    if (!body.phone || typeof body.phone !== 'string') {
      return NextResponse.json(
        { error: 'Phone number is required' },
        { status: 400 }
      )
    }

    // Basic phone validation
    const phoneRegex = /^[\d\s\-\+\(\)]+$/
    if (!phoneRegex.test(body.phone)) {
      return NextResponse.json(
        { error: 'Invalid phone number format' },
        { status: 400 }
      )
    }

    // Email validation (optional but validate format if provided)
    if (body.email && typeof body.email === 'string' && body.email.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(body.email)) {
        return NextResponse.json(
          { error: 'Invalid email format' },
          { status: 400 }
        )
      }
    }

    // Validate name isn't suspicious (basic check)
    const fullName = body.fullName.trim()
    if (fullName.length > 100) {
      return NextResponse.json(
        { error: 'Name is too long' },
        { status: 400 }
      )
    }

    // Sanitize inputs
    const sanitizedData = {
      fullName: fullName.substring(0, 100),
      phone: body.phone.trim().substring(0, 50),
      email: body.email?.trim().substring(0, 255) || undefined,
      service: body.service?.trim().substring(0, 200) || undefined,
      notes: body.notes?.trim().substring(0, 2000) || body.message?.trim().substring(0, 2000) || undefined,
      nationality: body.nationality?.trim().substring(0, 100) || undefined,
    }

    // Use shared ingest function
    const result = await ingestLead({
      fullName: sanitizedData.fullName,
      phone: sanitizedData.phone,
      email: sanitizedData.email,
      service: sanitizedData.service,
      source: 'website',
      notes: sanitizedData.notes,
      nationality: sanitizedData.nationality,
    })

    // Log successful intake for monitoring
    try {
      await prisma.externalEventLog.create({
        data: {
          provider: 'website',
          externalId: `website_${Date.now()}_${ip}`,
          payload: JSON.stringify({
            leadId: result.lead.id,
            ip,
            timestamp: new Date().toISOString(),
          }),
        },
      })
    } catch (error) {
      // Ignore logging errors (non-critical)
      console.warn('Failed to log website intake event:', error)
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Form submitted successfully',
        leadId: result.lead.id,
      },
      { status: 201 }
    )
  } catch (error: any) {
    console.error('POST /api/intake/website error:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to process form submission' },
      { status: 500 }
    )
  }
}

