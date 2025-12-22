// Messaging sender functions
// Abstraction layer for WhatsApp and Email sending
// TODO: Replace with real API integrations

import { prisma } from './prisma'

type Lead = {
  id: number
  leadType: string | null
  status: string
  aiScore: number | null
}

type Contact = {
  id: number
  fullName: string
  phone: string
  email: string | null
}

/**
 * Get WhatsApp integration settings
 */
async function getWhatsAppIntegration() {
  return await prisma.integration.findUnique({
    where: { name: 'whatsapp' },
  })
}

/**
 * Send a WhatsApp message to a lead's contact
 * Uses integration settings from database
 */
export async function sendWhatsApp(
  lead: Lead,
  contact: Contact,
  text: string
): Promise<{ success: boolean; messageId?: string }> {
  // Try the new WhatsApp Cloud API library first
  try {
    const { sendTextMessage } = await import('./whatsapp')
    
    const result = await sendTextMessage(contact.phone, text)

    // Ensure conversation exists
    let conversation = await prisma.conversation.findUnique({
      where: {
        contactId_channel: {
          contactId: contact.id,
          channel: 'whatsapp',
        },
      },
    })

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          contactId: contact.id,
          channel: 'whatsapp',
          lastMessageAt: new Date(),
        },
      })
    } else {
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          lastMessageAt: new Date(),
        },
      })
    }

    // Create communication log with message ID
    const logData: any = {
      leadId: lead.id,
      conversationId: conversation.id,
      channel: 'whatsapp',
      direction: 'outbound',
      messageSnippet: text.substring(0, 200),
    }

    try {
      logData.whatsappMessageId = result.messageId
      logData.deliveryStatus = 'sent'
    } catch {
      // Fields don't exist yet
    }

    await Promise.all([
      prisma.communicationLog.create({
        data: logData,
      }),
      prisma.chatMessage.create({
        data: {
          contactId: contact.id,
          leadId: lead.id,
          channel: 'whatsapp',
          direction: 'outbound',
          message: text,
        },
      }),
      prisma.lead.update({
        where: { id: lead.id },
        data: { lastContactAt: new Date() },
      }),
    ])

    return { success: true, messageId: result.messageId }
  } catch (error: any) {
    // Cloud API failed, log and continue to fallback integration-based sending
    console.warn('WhatsApp Cloud API failed, trying fallback integration:', error.message)
    // Don't return here - allow execution to continue to fallback code below
  }

  // Fallback to integration-based sending (360dialog, Twilio, etc.)
  // This code is reachable when Cloud API fails (catch block above doesn't return)
  const integration = await getWhatsAppIntegration()

  if (!integration?.isEnabled || !integration.apiKey) {
    console.log('📱 [STUB] WhatsApp integration not enabled, logging message only')
    console.log(`   To: ${contact.phone}`)
    console.log(`   Contact: ${contact.fullName}`)
    console.log(`   Message: ${text.substring(0, 100)}...`)

    // Still create communication log and chat message
    await Promise.all([
      prisma.communicationLog.create({
        data: {
          leadId: lead.id,
          channel: 'whatsapp',
          direction: 'outbound',
          messageSnippet: text.substring(0, 200),
        },
      }),
      prisma.chatMessage.create({
        data: {
          contactId: contact.id,
          leadId: lead.id,
          channel: 'whatsapp',
          direction: 'outbound',
          message: text,
        },
      }),
    ])

    return { success: true, messageId: 'stub-' + Date.now() }
  }

  // Try to send via actual API based on provider
  try {
    let result: { success: boolean; messageId?: string } = { success: false }

    if (integration.provider === '360dialog') {
      const cleanPhone = contact.phone.replace(/[^0-9]/g, '')
      const response = await fetch(`https://waba-api.360dialog.io/v1/messages`, {
        method: 'POST',
        headers: {
          'D360-API-KEY': integration.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          recipient_type: 'individual',
          to: cleanPhone,
          type: 'text',
          text: { body: text },
        }),
      })

      if (response.ok) {
        const data = await response.json()
        result = { success: true, messageId: data.messages?.[0]?.id }
      } else {
        throw new Error(`API returned ${response.status}`)
      }
    } else if (integration.provider === 'Twilio') {
      // Twilio WhatsApp implementation
      const accountSid = integration.apiKey
      const authToken = integration.apiSecret
      const fromNumber = integration.webhookUrl || 'whatsapp:+14155238886' // Twilio sandbox

      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            From: fromNumber,
            To: `whatsapp:${contact.phone}`,
            Body: text,
          }),
        }
      )

      if (response.ok) {
        const data = await response.json()
        result = { success: true, messageId: data.sid }
      } else {
        throw new Error(`API returned ${response.status}`)
      }
    }

    // Create communication log and chat message
    await Promise.all([
      prisma.communicationLog.create({
        data: {
          leadId: lead.id,
          channel: 'whatsapp',
          direction: 'outbound',
          messageSnippet: text.substring(0, 200),
        },
      }),
      prisma.chatMessage.create({
        data: {
          contactId: contact.id,
          leadId: lead.id,
          channel: 'whatsapp',
          direction: 'outbound',
          message: text,
        },
      }),
    ])

    return result
  } catch (error: any) {
    console.error('Failed to send WhatsApp message via integration:', error)
    // Still create logs even if sending fails
    const failedLogData: any = {
      leadId: lead.id,
      channel: 'whatsapp',
      direction: 'outbound',
      messageSnippet: text.substring(0, 200),
    }

    try {
      failedLogData.deliveryStatus = 'failed'
      failedLogData.failedAt = new Date()
      failedLogData.failureReason = error.message || 'Unknown error'
    } catch {}

    await Promise.all([
      prisma.communicationLog.create({
        data: failedLogData,
      }),
      prisma.chatMessage.create({
        data: {
          contactId: contact.id,
          leadId: lead.id,
          channel: 'whatsapp',
          direction: 'outbound',
          message: text,
        },
      }),
    ])

    return { success: false }
  }
}

/**
 * Get Email integration settings
 */
async function getEmailIntegration() {
  return await prisma.integration.findUnique({
    where: { name: 'email' },
  })
}

/**
 * Send an email to a lead's contact
 * Uses integration settings from database
 */
export async function sendEmail(
  lead: Lead,
  contact: Contact,
  subject: string,
  text: string
): Promise<{ success: boolean; messageId?: string }> {
  if (!contact.email) {
    console.warn(`⚠️ Cannot send email to lead ${lead.id}: no email address`)
    return { success: false }
  }

  const integration = await getEmailIntegration()

  if (!integration?.isEnabled) {
    console.log('📧 [STUB] Email integration not enabled, logging email only')
    console.log(`   To: ${contact.email}`)
    console.log(`   Subject: ${subject}`)

    await Promise.all([
      prisma.communicationLog.create({
        data: {
          leadId: lead.id,
          channel: 'email',
          direction: 'outbound',
          messageSnippet: text.substring(0, 200),
        },
      }),
      prisma.chatMessage.create({
        data: {
          contactId: contact.id,
          leadId: lead.id,
          channel: 'email',
          direction: 'outbound',
          message: `Subject: ${subject}\n\n${text}`,
          senderEmail: integration?.webhookUrl || 'noreply@alainbcenter.com', // Use webhookUrl as from email
        },
      }),
    ])

    return { success: true, messageId: 'stub-' + Date.now() }
  }

  // TODO: Implement actual SMTP/email API calls based on provider
  // For now, log and create records
  await Promise.all([
    prisma.communicationLog.create({
      data: {
        leadId: lead.id,
        channel: 'email',
        direction: 'outbound',
        messageSnippet: text.substring(0, 200),
      },
    }),
    prisma.chatMessage.create({
      data: {
        contactId: contact.id,
        leadId: lead.id,
        channel: 'email',
        direction: 'outbound',
        message: `Subject: ${subject}\n\n${text}`,
        senderEmail: integration.webhookUrl || 'noreply@alainbcenter.com',
      },
    }),
  ])

  return { success: true, messageId: 'stub-' + Date.now() }
}
