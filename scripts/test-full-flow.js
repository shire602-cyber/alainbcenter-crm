// Test full authentication flow including middleware
const http = require('http');

function testFullFlow() {
  console.log('=== FULL AUTHENTICATION FLOW TEST ===\n');

  // Step 1: Login
  console.log('Step 1: Attempting login...');
  const loginData = JSON.stringify({
    email: 'admin@alainbcenter.com',
    password: 'admin123'
  });

  const loginOptions = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/auth/login',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(loginData)
    }
  };

  return new Promise((resolve) => {
    const loginReq = http.request(loginOptions, (loginRes) => {
      let data = '';
      loginRes.on('data', (chunk) => { data += chunk; });
      loginRes.on('end', () => {
        if (loginRes.statusCode === 200) {
          console.log('✅ Login successful');
          
          // Extract cookie
          const setCookie = loginRes.headers['set-cookie'];
          if (!setCookie || !setCookie[0]) {
            console.log('❌ No cookie in response!');
            resolve();
            return;
          }

          const cookieMatch = setCookie[0].match(/alaincrm_session=([^;]+)/);
          if (!cookieMatch) {
            console.log('❌ Could not extract cookie!');
            resolve();
            return;
          }

          // Extract just the cookie value (will be URL-decoded by browser)
          let cookieValue = cookieMatch[1];
          try {
            cookieValue = decodeURIComponent(cookieValue);
          } catch (e) {
            // Already decoded
          }

          console.log('✅ Cookie extracted, testing protected route...\n');

          // Step 2: Test accessing protected route with cookie
          const protectedOptions = {
            hostname: 'localhost',
            port: 3000,
            path: '/api/leads',
            method: 'GET',
            headers: {
              'Cookie': `alaincrm_session=${cookieValue}`
            }
          };

          const protectedReq = http.request(protectedOptions, (protectedRes) => {
            let protectedData = '';
            protectedRes.on('data', (chunk) => { protectedData += chunk; });
            protectedRes.on('end', () => {
              if (protectedRes.statusCode === 200) {
                console.log('✅ Protected route accessible!');
                console.log('   Status:', protectedRes.statusCode);
                console.log('   Response length:', protectedData.length, 'bytes');
              } else if (protectedRes.statusCode === 401) {
                console.log('❌ Protected route returned 401 Unauthorized');
                console.log('   Response:', protectedData);
              } else if (protectedRes.statusCode === 302 || protectedRes.statusCode === 307) {
                console.log('⚠️  Protected route redirected (expected for pages)');
                console.log('   Location:', protectedRes.headers.location);
              } else {
                console.log('❌ Unexpected status:', protectedRes.statusCode);
                console.log('   Response:', protectedData);
              }
              resolve();
            });
          });

          protectedReq.on('error', (e) => {
            console.log('❌ Request error:', e.message);
            resolve();
          });

          protectedReq.end();

        } else {
          console.log('❌ Login failed:', loginRes.statusCode);
          console.log('   Response:', data);
          resolve();
        }
      });
    });

    loginReq.on('error', (e) => {
      console.log('❌ Login request error:', e.message);
      console.log('   Is the dev server running on port 3000?');
      resolve();
    });

    loginReq.write(loginData);
    loginReq.end();
  });
}

testFullFlow();

