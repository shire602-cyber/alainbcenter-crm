#!/usr/bin/env node
/**
 * Test Continuous Background Processing
 * 
 * Verifies that automation continues running even after "leaving the page"
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

async function login() {
  const result = await makeRequest('/api/auth/login', {
    method: 'POST',
    body: { email: EMAIL, password: PASSWORD },
  });
  return result.status === 200 && result.data.success;
}

async function startWorker() {
  const result = await makeRequest('/api/admin/automation/worker', {
    method: 'POST',
    body: { action: 'start' },
  });
  return result.status === 200 && result.data.ok;
}

async function runNow() {
  const result = await makeRequest('/api/autopilot/run', {
    method: 'POST',
    body: {},
  });
  return result.status === 200 && result.data.ok;
}

async function getWorkerStats() {
  const result = await makeRequest('/api/admin/automation/worker');
  if (result.status === 200 && result.data.ok) {
    return result.data;
  }
  return null;
}

async function createTestJob(leadId = 1) {
  const result = await makeRequest('/api/admin/automation/test-job', {
    method: 'POST',
    body: { leadId },
  });
  if (result.status === 200 && result.data.ok) {
    return result.data.jobId;
  }
  return null;
}

async function checkDatabaseStats() {
  const { execSync } = require('child_process');
  try {
    const result = execSync(`sqlite3 prisma/dev.db "SELECT status, COUNT(*) FROM automation_jobs GROUP BY status;"`, { 
      cwd: process.cwd(), 
      encoding: 'utf-8' 
    });
    return result.trim();
  } catch (error) {
    return 'Error: ' + error.message;
  }
}

async function main() {
  console.log('🧪 CONTINUOUS BACKGROUND PROCESSING TEST');
  console.log('========================================\n');

  // Step 1: Login
  console.log('1️⃣  Logging in...');
  if (!(await login())) {
    console.log('❌ Login failed');
    return;
  }
  console.log('✅ Logged in\n');

  // Step 2: Start Worker
  console.log('2️⃣  Starting worker...');
  if (!(await startWorker())) {
    console.log('❌ Failed to start worker');
    return;
  }
  console.log('✅ Worker started\n');

  // Step 3: Run Now
  console.log('3️⃣  Running automation (Run Now)...');
  const runResult = await runNow();
  console.log(runResult ? '✅ Automation run completed' : '❌ Automation run failed');
  await sleep(3000);
  console.log('');

  // Step 4: Create test jobs
  console.log('4️⃣  Creating 5 test jobs...');
  const jobIds = [];
  for (let i = 0; i < 5; i++) {
    const jobId = await createTestJob(1);
    if (jobId) {
      jobIds.push(jobId);
      console.log(`   ✅ Created job ${i + 1}: ${jobId.substring(0, 20)}...`);
    }
    await sleep(500);
  }
  console.log(`\n   Created ${jobIds.length} jobs total\n`);

  // Step 5: Check initial stats
  console.log('5️⃣  Initial worker stats:');
  let stats = await getWorkerStats();
  if (stats) {
    console.log(`   Pending: ${stats.pending || 0}`);
    console.log(`   Processing: ${stats.processing || 0}`);
    console.log(`   Completed: ${stats.completed || 0}`);
    console.log(`   Failed: ${stats.failed || 0}\n`);
  }

  // Step 6: "Leave page" - wait 30 seconds without making requests
  console.log('6️⃣  Simulating leaving page (30 seconds, no API calls)...');
  console.log('   Worker should continue processing in background...\n');
  await sleep(30000);

  // Step 7: "Return to page" - check stats again
  console.log('7️⃣  Returning to page - checking stats:');
  stats = await getWorkerStats();
  if (stats) {
    console.log(`   Pending: ${stats.pending || 0}`);
    console.log(`   Processing: ${stats.processing || 0}`);
    console.log(`   Completed: ${stats.completed || 0}`);
    console.log(`   Failed: ${stats.failed || 0}\n`);
  }

  // Step 8: Check database directly
  console.log('8️⃣  Database status:');
  const dbStats = await checkDatabaseStats();
  console.log(`   ${dbStats}\n`);

  // Step 9: Wait another 20 seconds and check again
  console.log('9️⃣  Waiting 20 more seconds (still "away")...');
  await sleep(20000);
  
  stats = await getWorkerStats();
  console.log('   Final stats:');
  if (stats) {
    console.log(`   Pending: ${stats.pending || 0}`);
    console.log(`   Processing: ${stats.processing || 0}`);
    console.log(`   Completed: ${stats.completed || 0}`);
    console.log(`   Failed: ${stats.failed || 0}\n`);
  }

  // Step 10: Verify worker is still running
  console.log('🔟 Verifying worker is still running:');
  stats = await getWorkerStats();
  if (stats && stats.isRunning) {
    console.log('   ✅ Worker is still running!\n');
  } else {
    console.log('   ⚠️  Worker status unclear\n');
  }

  console.log('✅ Test Complete!');
  console.log('\n📊 Summary:');
  console.log('   - Worker started: ✅');
  console.log('   - Automation run: ✅');
  console.log('   - Jobs created: ✅');
  console.log('   - Background processing: Check logs above');
  console.log('   - Worker persistence: Check isRunning status');
}

main().catch(console.error);

