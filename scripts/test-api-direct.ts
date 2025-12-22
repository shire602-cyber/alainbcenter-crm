/**
 * Direct API test script
 * Tests the renewals run API endpoint
 */

async function testAPI() {
  const baseUrl = 'http://localhost:3000'
  
  console.log('🧪 Testing Renewals Engine API...\n')
  console.log('⚠️  Note: This requires you to be logged in first')
  console.log('    Please log in via browser and get your session cookie\n')
  
  try {
    // Test dry run
    console.log('📋 Testing DRY RUN endpoint...')
    const response = await fetch(`${baseUrl}/api/renewals/run?dryRun=true`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include', // Include cookies
    })

    const data = await response.json()
    
    console.log(`Status: ${response.status} ${response.statusText}`)
    console.log('\nResponse:')
    console.log(JSON.stringify(data, null, 2))
    
    if (response.ok) {
      console.log('\n✅ API call successful!')
      console.log(`   Checked: ${data.totalExpiryChecked}`)
      console.log(`   Scheduled: ${data.totalRemindersScheduled}`)
      if (data.errors && data.errors.length > 0) {
        console.log(`   Errors: ${data.errors.length}`)
        data.errors.forEach((err: string, idx: number) => {
          console.log(`     ${idx + 1}. ${err}`)
        })
      }
    } else {
      console.log('\n❌ API call failed!')
      console.log(`   Error: ${data.error}`)
      if (data.details) {
        console.log(`   Details: ${data.details}`)
      }
    }
  } catch (error: any) {
    console.error('\n❌ Test failed:', error.message)
    console.error('   Make sure the dev server is running on http://localhost:3000')
    console.error('   And that you are logged in via browser')
  }
}

testAPI()


