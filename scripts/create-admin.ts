import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10)
}

async function main() {
  const email = 'admin@alainbcenter.com'
  const password = 'CHANGE_ME'
  const name = 'Admin User'

  // Check if user already exists
  const existing = await prisma.user.findUnique({
    where: { email },
  })

  if (existing) {
    console.log('✅ Admin user already exists:', email)
    // Update password in case it changed
    const hashedPassword = await hashPassword(password)
    await prisma.user.update({
      where: { email },
      data: {
        password: hashedPassword,
        role: 'ADMIN', // Ensure role is ADMIN
      },
    })
    console.log('✅ Password updated for existing admin user')
    return
  }

  // Create admin user
  const hashedPassword = await hashPassword(password)
  const user = await prisma.user.create({
    data: {
      email,
      name,
      password: hashedPassword,
      role: 'ADMIN',
    },
  })

  console.log('✅ Admin user created successfully!')
  console.log('   Email:', email)
  console.log('   Password:', password)
  console.log('   ⚠️  IMPORTANT: Change the password after first login!')
}

main()
  .catch((e) => {
    console.error('❌ Error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
