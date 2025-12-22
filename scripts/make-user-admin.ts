import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  // Get email from command line args
  const email = process.argv[2]

  if (!email) {
    console.log('Usage: npx ts-node scripts/make-user-admin.ts <email>')
    console.log('')
    console.log('Example:')
    console.log('  npx ts-node scripts/make-user-admin.ts user@example.com')
    console.log('')
    
    // List all users
    console.log('Current users:')
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    })
    
    if (users.length === 0) {
      console.log('  No users found.')
    } else {
      users.forEach((user) => {
        console.log(`  - ${user.email} (${user.name}) - Role: ${user.role}`)
      })
    }
    
    process.exit(1)
  }

  console.log('🔐 Making User Admin')
  console.log('===================')
  console.log('Email:', email)
  console.log('')

  // Check if user exists
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase().trim() },
  })

  if (!user) {
    console.error('❌ User not found with email:', email)
    console.log('')
    console.log('Available users:')
    const allUsers = await prisma.user.findMany({
      select: {
        email: true,
        name: true,
        role: true,
      },
    })
    allUsers.forEach((u) => {
      console.log(`  - ${u.email} (${u.name}) - ${u.role}`)
    })
    process.exit(1)
  }

  if (user.role === 'ADMIN') {
    console.log('✅ User is already an ADMIN')
    console.log('')
    console.log('User details:')
    console.log('  ID:', user.id)
    console.log('  Name:', user.name)
    console.log('  Email:', user.email)
    console.log('  Role:', user.role)
    process.exit(0)
  }

  // Update user to admin
  console.log(`📝 Updating user role from "${user.role}" to "ADMIN"...`)
  
  const updatedUser = await prisma.user.update({
    where: { email: email.toLowerCase().trim() },
    data: {
      role: 'ADMIN',
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
    },
  })

  console.log('✅ User updated successfully!')
  console.log('')
  console.log('Updated user:')
  console.log('  ID:', updatedUser.id)
  console.log('  Name:', updatedUser.name)
  console.log('  Email:', updatedUser.email)
  console.log('  Role:', updatedUser.role)
  console.log('')
  console.log('⚠️  Refresh your browser to see admin menu items!')
}

main()
  .catch((e) => {
    console.error('❌ Error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

















