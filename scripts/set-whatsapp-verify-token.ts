/**
 * Script to set WhatsApp webhook verify token in the database
 * 
 * Usage:
 *   npx tsx scripts/set-whatsapp-verify-token.ts <verify-token>
 * 
 * Example:
 *   npx tsx scripts/set-whatsapp-verify-token.ts "wa-verify-7hsjygtsk4m1bdta10nfd4-mjhdhymx"
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const verifyToken = process.argv[2]

  if (!verifyToken) {
    console.error('❌ Error: Verify token is required')
    console.log('')
    console.log('Usage:')
    console.log('  npx tsx scripts/set-whatsapp-verify-token.ts <verify-token>')
    console.log('')
    console.log('Example:')
    console.log('  npx tsx scripts/set-whatsapp-verify-token.ts "wa-verify-7hsjygtsk4m1bdta10nfd4-mjhdhymx"')
    process.exit(1)
  }

  try {
    // Find WhatsApp integration
    let integration = await prisma.integration.findUnique({
      where: { name: 'whatsapp' },
    })

    let currentConfig: Record<string, any> = {}

    if (integration?.config) {
      try {
        currentConfig = typeof integration.config === 'string'
          ? JSON.parse(integration.config)
          : integration.config
      } catch (e) {
        console.warn('⚠️  Could not parse existing config, creating new one')
        currentConfig = {}
      }
    }

    // Update config with verify token
    const updatedConfig = {
      ...currentConfig,
      webhookVerifyToken: verifyToken,
    }

    if (integration) {
      // Update existing integration
      await prisma.integration.update({
        where: { name: 'whatsapp' },
        data: {
          config: JSON.stringify(updatedConfig),
        },
      })
      console.log('✅ Updated WhatsApp integration verify token')
    } else {
      // Create new integration
      await prisma.integration.create({
        data: {
          name: 'whatsapp',
          provider: 'meta',
          isEnabled: false,
          config: JSON.stringify(updatedConfig),
        },
      })
      console.log('✅ Created WhatsApp integration with verify token')
    }

    console.log('')
    console.log('📋 Verify Token Details:')
    console.log(`   Token: ${verifyToken.substring(0, 15)}...${verifyToken.substring(verifyToken.length - 5)}`)
    console.log(`   Length: ${verifyToken.length} characters`)
    console.log('')
    console.log('✅ Next Steps:')
    console.log('   1. Go to Meta Developer Console → WhatsApp → Configuration → Webhooks')
    console.log('   2. Paste this token in "Verify Token" field:')
    console.log(`      ${verifyToken}`)
    console.log('   3. Set Callback URL to: https://your-app.vercel.app/api/webhooks/whatsapp')
    console.log('   4. Click "Verify and Save"')
    console.log('')

  } catch (error: any) {
    console.error('❌ Error setting verify token:', error.message)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()

