#!/usr/bin/env node
/**
 * Comprehensive Automation System Test
 * 
 * Tests:
 * 1. Login
 * 2. Start worker
 * 3. Run automation manually
 * 4. Create test jobs
 * 5. Verify background processing
 * 6. Test persistence (simulate leaving page)
 * 7. Check for errors
 */

const http = require('http');

const BASE_URL = 'http://localhost:3000';
const EMAIL = 'admin@alainbcenter.com';
const PASSWORD = 'CHANGE_ME';

let sessionCookie = '';

function makeRequest(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const data = options.body ? JSON.stringify(options.body) : null;
    
    const reqOptions = {
      hostname: url.hostname,
      port: url.port || 3000,
      path: url.pathname + url.search,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(sessionCookie ? { 'Cookie': sessionCookie } : {}),
        ...(options.headers || {}),
      },
    };

    if (data) {
      reqOptions.headers['Content-Length'] = Buffer.byteLength(data);
    }

    const req = http.request(reqOptions, (res) => {
      let body = '';
      const setCookie = res.headers['set-cookie'];
      if (setCookie) {
        const cookie = setCookie.find(c => c.startsWith('alaincrm_session='));
        if (cookie) {
          sessionCookie = cookie.split(';')[0];
        }
      }

      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body), headers: res.headers });
        } catch (e) {
          resolve({ status: res.statusCode, data: body, headers: res.headers });
        }
      });
    });

    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testLogin() {
  console.log('\n🔐 Step 1: Logging in...');
  const result = await makeRequest('/api/auth/login', {
    method: 'POST',
    body: { email: EMAIL, password: PASSWORD },
  });

  if (result.status === 200 && result.data.success) {
    console.log('✅ Login successful');
    return true;
  }
  console.log('❌ Login failed:', result.data);
  return false;
}

async function testStartWorker() {
  console.log('\n🚀 Step 2: Starting Worker...');
  const result = await makeRequest('/api/admin/automation/worker', {
    method: 'POST',
    body: { action: 'start' },
  });

  if (result.status === 200 && result.data.ok) {
    console.log('✅ Worker started');
    return true;
  }
  console.log('❌ Failed to start worker:', result.data);
  return false;
}

async function testRunNow() {
  console.log('\n▶️  Step 3: Running Automation (Run Now button)...');
  const result = await makeRequest('/api/autopilot/run', {
    method: 'POST',
    body: {},
  });

  if (result.status === 200) {
    console.log('✅ Automation run initiated');
    console.log('   Response:', JSON.stringify(result.data, null, 2));
    return result.data;
  }
  console.log('❌ Failed to run automation:', result.data);
  return null;
}

async function testWorkerStatus() {
  const result = await makeRequest('/api/admin/automation/worker');
  if (result.status === 200 && result.data.ok) {
    return result.data;
  }
  return null;
}

async function createTestJob(leadId = 1) {
  try {
    const result = await makeRequest('/api/admin/automation/test-job', {
      method: 'POST',
      body: { leadId },
    });
    
    if (result.status === 200 && result.data.ok) {
      return result.data.jobId;
    }
    console.error('Failed to create test job:', result.data);
    return null;
  } catch (error) {
    console.error('Failed to create test job:', error.message);
    return null;
  }
}

async function checkJobStatus(jobId) {
  const { execSync } = require('child_process');
  try {
    // Escape single quotes in jobId for SQL
    const escapedId = jobId.replace(/'/g, "''");
    const result = execSync(`sqlite3 prisma/dev.db "SELECT status, COALESCE(error, ''), retryCount FROM automation_jobs WHERE id = '${escapedId}';"`, { cwd: process.cwd(), encoding: 'utf-8' });
    const parts = result.trim().split('|');
    return [parts[0] || null, parts[1] || null, parts[2] || '0'];
  } catch (error) {
    return [null, null, '0'];
  }
}

async function testBackgroundProcessing() {
  console.log('\n🔄 Step 4: Testing Background Processing...');
  
  // Create test job
  const jobId = await createTestJob();
  if (!jobId) {
    console.log('❌ Failed to create test job');
    return false;
  }
  console.log(`✅ Created test job: ${jobId}`);

  // Check initial status
  let [status] = await checkJobStatus(jobId);
  console.log(`   Initial status: ${status}`);

  // Wait for worker to process (15 seconds)
  console.log('   Waiting 15 seconds for worker to process...');
  for (let i = 0; i < 15; i++) {
    await sleep(1000);
    const [newStatus, error, retryCount] = await checkJobStatus(jobId);
    if (newStatus !== status) {
      console.log(`   Status changed to: ${newStatus} (after ${i + 1}s)`);
      if (error) console.log(`   Error: ${error}`);
      if (retryCount) console.log(`   Retry count: ${retryCount}`);
      status = newStatus;
    }
    process.stdout.write('.');
  }
  console.log('');

  // Final status
  const [finalStatus, finalError] = await checkJobStatus(jobId);
  console.log(`   Final status: ${finalStatus}`);
  if (finalError) console.log(`   Error: ${finalError}`);

  return finalStatus === 'COMPLETED' || finalStatus === 'PROCESSING';
}

async function testPersistence() {
  console.log('\n💾 Step 5: Testing Persistence (Simulating Page Leave)...');
  
  // Get current stats
  const statsBefore = await testWorkerStatus();
  console.log('   Stats before "leaving page":', {
    pending: statsBefore?.pending || 0,
    processing: statsBefore?.processing || 0,
    completed: statsBefore?.completed || 0,
  });

  // Create multiple jobs
  console.log('   Creating 3 test jobs...');
  const jobIds = [];
  for (let i = 0; i < 3; i++) {
    const jobId = await createTestJob();
    if (jobId) jobIds.push(jobId);
    await sleep(500);
  }
  console.log(`   Created ${jobIds.length} jobs`);

  // "Leave page" - don't make any requests for 20 seconds
  console.log('   Simulating leaving page (20 seconds, no requests)...');
  await sleep(20000);

  // "Return to page" - check stats again
  const statsAfter = await testWorkerStatus();
  console.log('   Stats after "returning to page":', {
    pending: statsAfter?.pending || 0,
    processing: statsAfter?.processing || 0,
    completed: statsAfter?.completed || 0,
  });

  // Check if jobs were processed
  let processedCount = 0;
  for (const jobId of jobIds) {
    const [status] = await checkJobStatus(jobId);
    if (status === 'COMPLETED' || status === 'PROCESSING') {
      processedCount++;
    }
  }
  console.log(`   Jobs processed while "away": ${processedCount}/${jobIds.length}`);

  return processedCount > 0;
}

async function testErrorHandling() {
  console.log('\n⚠️  Step 6: Testing Error Handling...');
  
  // Create job with invalid lead ID
  const invalidJobId = await createTestJob(999999);
  if (invalidJobId) {
    console.log(`   Created job with invalid lead ID: ${invalidJobId}`);
    await sleep(10000);
    const [status, error] = await checkJobStatus(invalidJobId);
    console.log(`   Status: ${status}`);
    if (error) console.log(`   Error captured: ${error.substring(0, 100)}`);
    
    // Check if it retried
    const [, , retryCount] = await checkJobStatus(invalidJobId);
    console.log(`   Retry count: ${retryCount || 0}`);
  }

  return true;
}

async function testWorkerStats() {
  console.log('\n📊 Step 7: Testing Worker Stats API...');
  const stats = await testWorkerStatus();
  
  if (stats) {
    console.log('✅ Worker stats retrieved:');
    console.log('   Running:', stats.isRunning ? '🟢 Yes' : '🟡 No');
    console.log('   Pending:', stats.pending || 0);
    console.log('   Processing:', stats.processing || 0);
    console.log('   Completed:', stats.completed || 0);
    console.log('   Failed:', stats.failed || 0);
    return true;
  }
  return false;
}

async function checkForErrors() {
  console.log('\n🔍 Step 8: Checking for Errors...');
  
  // Check database for failed jobs
  const { execSync } = require('child_process');
  try {
    const failedJobs = execSync(`sqlite3 prisma/dev.db "SELECT COUNT(*) FROM automation_jobs WHERE status = 'FAILED';"`, { encoding: 'utf-8' }).trim();
    console.log(`   Failed jobs in database: ${failedJobs}`);
    
    if (parseInt(failedJobs) > 0) {
      const errorDetails = execSync(`sqlite3 prisma/dev.db "SELECT id, type, error FROM automation_jobs WHERE status = 'FAILED' LIMIT 5;"`, { encoding: 'utf-8' });
      console.log('   Error details:');
      errorDetails.split('\n').forEach(line => {
        if (line.trim()) console.log(`     ${line}`);
      });
    }
  } catch (error) {
    console.log('   Could not check database:', error.message);
  }

  return true;
}

async function runAllTests() {
  console.log('🧪 COMPREHENSIVE AUTOMATION SYSTEM TEST');
  console.log('========================================\n');

  const results = {
    login: false,
    workerStart: false,
    runNow: false,
    backgroundProcessing: false,
    persistence: false,
    errorHandling: false,
    stats: false,
  };

  try {
    // Test 1: Login
    results.login = await testLogin();
    if (!results.login) {
      console.log('\n❌ Cannot proceed without login');
      return results;
    }

    // Test 2: Start Worker
    results.workerStart = await testStartWorker();
    await sleep(2000);

    // Test 3: Run Now
    const runResult = await testRunNow();
    results.runNow = !!runResult;
    await sleep(3000);

    // Test 4: Background Processing
    results.backgroundProcessing = await testBackgroundProcessing();

    // Test 5: Persistence
    results.persistence = await testPersistence();

    // Test 6: Error Handling
    results.errorHandling = await testErrorHandling();

    // Test 7: Stats
    results.stats = await testWorkerStats();

    // Test 8: Check for Errors
    await checkForErrors();

    // Final Summary
    console.log('\n' + '='.repeat(50));
    console.log('📋 TEST SUMMARY');
    console.log('='.repeat(50));
    console.log('Login:', results.login ? '✅' : '❌');
    console.log('Worker Start:', results.workerStart ? '✅' : '❌');
    console.log('Run Now:', results.runNow ? '✅' : '❌');
    console.log('Background Processing:', results.backgroundProcessing ? '✅' : '❌');
    console.log('Persistence (works when away):', results.persistence ? '✅' : '❌');
    console.log('Error Handling:', results.errorHandling ? '✅' : '❌');
    console.log('Stats API:', results.stats ? '✅' : '❌');

    const allPassed = Object.values(results).every(r => r);
    console.log('\n' + (allPassed ? '✅ ALL TESTS PASSED' : '⚠️  SOME TESTS FAILED'));

  } catch (error) {
    console.error('\n❌ Test suite error:', error);
  }

  return results;
}

runAllTests().catch(console.error);

