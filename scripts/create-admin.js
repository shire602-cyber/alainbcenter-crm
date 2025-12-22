// Run this with: node scripts/create-admin.js
// Make sure to run: npx prisma generate first

const { PrismaClient } = require('@prisma/client')
const crypto = require('crypto')

const prisma = new PrismaClient()

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex')
}

async function main() {
  const email = 'admin@alainbcenter.com'
  const password = process.env.ADMIN_PASSWORD || 'admin123'
  const hashed = hashPassword(password)

  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      name: 'Alain Admin',
      email,
      password: hashed,
      role: 'admin',
    },
  })

  console.log('✅ Admin user created/updated:')
  console.log(`   Email: ${user.email}`)
  console.log(`   Password: ${password}`)
  console.log(`   Role: ${user.role}`)
  console.log('\n⚠️  IMPORTANT: Change the default password after first login!')
}

main()
  .catch((e) => {
    console.error('Error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

