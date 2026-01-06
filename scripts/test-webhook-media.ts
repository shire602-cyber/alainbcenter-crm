/**
 * Test webhook with real media message payload
 * Simulates a WhatsApp webhook with an image message
 */

const testWebhookPayload = {
  object: 'whatsapp_business_account',
  entry: [
    {
      id: 'TEST_ENTRY_ID',
      changes: [
        {
          value: {
            messaging_product: 'whatsapp',
            metadata: {
              display_phone_number: '971501234567',
              phone_number_id: 'TEST_PHONE_ID',
            },
            contacts: [
              {
                profile: {
                  name: 'Test User',
                },
                wa_id: '971507042270',
              },
            ],
            messages: [
              {
                from: '971507042270',
                id: 'wamid.TEST_IMAGE_' + Date.now(),
                timestamp: Math.floor(Date.now() / 1000).toString(),
                type: 'image', // CRITICAL: Test with type='image'
                image: {
                  id: 'TEST_IMAGE_ID_' + Date.now(),
                  mime_type: 'image/jpeg',
                  sha256: 'test_sha256',
                  caption: 'Test image caption',
                },
              },
            ],
          },
          field: 'messages',
        },
      ],
    },
  ],
}

async function testWebhook() {
  console.log('🧪 Testing webhook with media message\n')
  console.log('Payload:', JSON.stringify(testWebhookPayload, null, 2))
  
  const webhookUrl = process.env.WEBHOOK_URL || 'http://localhost:3000/api/webhooks/whatsapp'
  const verifyToken = process.env.WEBHOOK_VERIFY_TOKEN || 'test_verify_token'
  
  console.log(`\n📤 Sending POST to ${webhookUrl}`)
  
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testWebhookPayload),
    })
    
    const responseText = await response.text()
    console.log(`\n📥 Response status: ${response.status}`)
    console.log(`Response body: ${responseText}`)
    
    if (response.ok) {
      console.log('\n✅ Webhook processed successfully!')
      console.log('\nNext steps:')
      console.log('1. Check the database for the new message')
      console.log('2. Verify type is set to "image" (not "text")')
      console.log('3. Verify providerMediaId is stored')
      console.log('4. Verify rawPayload contains the image object')
      console.log('5. Check the inbox to see if media loads')
    } else {
      console.log('\n❌ Webhook failed!')
    }
  } catch (error: any) {
    console.error('\n❌ Error sending webhook:', error.message)
    console.error('\nMake sure:')
    console.error('1. The server is running (npm run dev)')
    console.error('2. The webhook URL is correct')
    console.error('3. The verify token matches (if required)')
  }
}

testWebhook().catch(console.error)








