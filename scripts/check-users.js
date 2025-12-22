// Quick script to check users in database
const { PrismaClient } = require('@prisma/client')
const crypto = require('crypto')

const prisma = new PrismaClient()

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex')
}

async function main() {
  const users = await prisma.user.findMany()
  console.log(`\nTotal users: ${users.length}\n`)
  
  users.forEach((u, i) => {
    console.log(`${i + 1}. ${u.email}`)
    console.log(`   Role: ${u.role}`)
    console.log(`   Name: ${u.name}`)
    console.log(`   Created: ${u.createdAt}`)
    console.log(`   Password hash: ${u.password.substring(0, 20)}...`)
    console.log('')
  })
  
  // Test password
  if (users.length > 0) {
    const testUser = users[0]
    const testPassword = 'admin123'
    const hashed = hashPassword(testPassword)
    console.log(`Testing password '${testPassword}' for ${testUser.email}:`)
    console.log(`  Stored hash: ${testUser.password}`)
    console.log(`  Test hash:   ${hashed}`)
    console.log(`  Match: ${testUser.password === hashed ? '✅ YES' : '❌ NO'}`)
  }
  
  await prisma.$disconnect()
}

main().catch(console.error)

