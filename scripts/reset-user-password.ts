import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10)
}

async function main() {
  // Get email and password from command line args or use defaults
  const email = process.argv[2] || 'admin@alainbcenter.com'
  const password = process.argv[3] || 'admin123'
  const name = process.argv[4] || 'Admin User'
  const role = (process.argv[5] || 'ADMIN').toUpperCase()

  console.log('🔐 Resetting/Creating User Account')
  console.log('=====================================')
  console.log('Email:', email)
  console.log('Password:', password)
  console.log('Name:', name)
  console.log('Role:', role)
  console.log('')

  // Check if user exists
  const existing = await prisma.user.findUnique({
    where: { email: email.toLowerCase().trim() },
  })

  if (existing) {
    console.log('✅ User found, updating password...')
    const hashedPassword = await hashPassword(password)
    await prisma.user.update({
      where: { email: email.toLowerCase().trim() },
      data: {
        password: hashedPassword,
        role: role,
        name: name,
      },
    })
    console.log('✅ Password updated successfully!')
    console.log('')
    console.log('You can now login with:')
    console.log('  Email:', email)
    console.log('  Password:', password)
  } else {
    console.log('📝 Creating new user...')
    const hashedPassword = await hashPassword(password)
    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase().trim(),
        name: name,
        password: hashedPassword,
        role: role,
      },
    })
    console.log('✅ User created successfully!')
    console.log('')
    console.log('Login credentials:')
    console.log('  Email:', user.email)
    console.log('  Password:', password)
  }

  console.log('')
  console.log('⚠️  IMPORTANT: Change the password after first login!')
}

main()
  .catch((e) => {
    console.error('❌ Error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
