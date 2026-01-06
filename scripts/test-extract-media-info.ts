/**
 * Test extractMediaInfo with various payload structures
 */

import { extractMediaInfo, detectMediaType } from '../src/lib/media/extractMediaId'

interface TestCase {
  name: string
  message: any
  expectedType: string
  expectedMediaId: string | null
}

const testCases: TestCase[] = [
  // Test 1: Standard audio message
  {
    name: 'Standard audio message',
    message: {
      id: 'wamid.TEST1',
      type: 'audio',
      audio: {
        id: '1234567890123456',
        mime_type: 'audio/ogg; codecs=opus',
      },
    },
    expectedType: 'audio',
    expectedMediaId: '1234567890123456',
  },
  
  // Test 2: Audio with type='text' but has audio object
  {
    name: 'Audio with type=text but has audio object',
    message: {
      id: 'wamid.TEST2',
      type: 'text',
      audio: {
        id: '2345678901234567',
        mime_type: 'audio/ogg',
      },
    },
    expectedType: 'audio',
    expectedMediaId: '2345678901234567',
  },
  
  // Test 3: Image message
  {
    name: 'Standard image message',
    message: {
      id: 'wamid.TEST3',
      type: 'image',
      image: {
        id: '3456789012345678',
        mime_type: 'image/jpeg',
      },
    },
    expectedType: 'image',
    expectedMediaId: '3456789012345678',
  },
  
  // Test 4: Document with media_id field
  {
    name: 'Document with media_id field',
    message: {
      id: 'wamid.TEST4',
      type: 'document',
      document: {
        media_id: '4567890123456789',
        id: null,
        filename: 'test.pdf',
        mime_type: 'application/pdf',
      },
    },
    expectedType: 'document',
    expectedMediaId: '4567890123456789',
  },
  
  // Test 5: Video with mediaId field
  {
    name: 'Video with mediaId field',
    message: {
      id: 'wamid.TEST5',
      type: 'video',
      video: {
        mediaId: '5678901234567890',
        id: null,
        mime_type: 'video/mp4',
      },
    },
    expectedType: 'video',
    expectedMediaId: '5678901234567890',
  },
  
  // Test 6: Audio message missing audio object (should fail gracefully)
  {
    name: 'Audio message missing audio object',
    message: {
      id: 'wamid.TEST6',
      type: 'audio',
      // No audio object
    },
    expectedType: 'audio',
    expectedMediaId: null,
  },
  
  // Test 7: Message with wrong type but has media object
  {
    name: 'Type=text but has image object',
    message: {
      id: 'wamid.TEST7',
      type: 'text',
      image: {
        id: '6789012345678901',
        mime_type: 'image/jpeg',
      },
    },
    expectedType: 'image',
    expectedMediaId: '6789012345678901',
  },
]

async function runTests() {
  console.log('🧪 Testing extractMediaInfo function\n')
  
  let passed = 0
  let failed = 0
  
  for (const testCase of testCases) {
    console.log(`\n📋 Test: ${testCase.name}`)
    
    // Test detectMediaType
    const detectedType = detectMediaType(testCase.message)
    const typeMatch = detectedType === testCase.expectedType
    
    // Test extractMediaInfo
    const result = extractMediaInfo(testCase.message, detectedType)
    const idMatch = result.providerMediaId === testCase.expectedMediaId
    
    if (typeMatch && idMatch) {
      console.log(`  ✅ PASSED`)
      console.log(`     Type: ${detectedType} (expected: ${testCase.expectedType})`)
      console.log(`     Media ID: ${result.providerMediaId || 'NULL'} (expected: ${testCase.expectedMediaId || 'NULL'})`)
      passed++
    } else {
      console.log(`  ❌ FAILED`)
      if (!typeMatch) {
        console.log(`     Type mismatch: got ${detectedType}, expected ${testCase.expectedType}`)
      }
      if (!idMatch) {
        console.log(`     Media ID mismatch: got ${result.providerMediaId || 'NULL'}, expected ${testCase.expectedMediaId || 'NULL'}`)
      }
      failed++
    }
  }
  
  console.log(`\n\n📊 Test Results:`)
  console.log(`  ✅ Passed: ${passed}/${testCases.length}`)
  console.log(`  ❌ Failed: ${failed}/${testCases.length}`)
  console.log(`  Success rate: ${((passed / testCases.length) * 100).toFixed(1)}%`)
  
  if (failed === 0) {
    console.log(`\n✅ All tests passed!`)
    process.exit(0)
  } else {
    console.log(`\n❌ Some tests failed. Fix issues before deploying.`)
    process.exit(1)
  }
}

runTests().catch(console.error)








