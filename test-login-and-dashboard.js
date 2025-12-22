// Quick test script to verify login API works
const http = require('http');

const testLogin = () => {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      email: 'admin@alainbcenter.com',
      password: 'CHANGE_ME'
    });

    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/api/auth/login',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode === 200) {
          console.log('✅ Login API Test: PASSED');
          console.log('   Status:', res.statusCode);
          console.log('   Response:', JSON.parse(body));
          console.log('   Cookie Set:', res.headers['set-cookie'] ? 'Yes' : 'No');
          resolve(true);
        } else {
          console.log('❌ Login API Test: FAILED');
          console.log('   Status:', res.statusCode);
          console.log('   Response:', body);
          reject(new Error(`Login failed with status ${res.statusCode}`));
        }
      });
    });

    req.on('error', (e) => {
      console.error('❌ Login API Test: ERROR');
      console.error('   Error:', e.message);
      reject(e);
    });

    req.write(data);
    req.end();
  });
};

testLogin()
  .then(() => {
    console.log('\n✅ Login API is working correctly!');
    console.log('📝 To test the dashboard:');
    console.log('   1. Open http://localhost:3000/login in your browser');
    console.log('   2. Enter: admin@alainbcenter.com / CHANGE_ME');
    console.log('   3. Click Sign in');
    console.log('   4. You should be redirected to the dashboard');
    console.log('\n🎯 Dashboard Features to Test:');
    console.log('   - KPI cards with sparklines and trends');
    console.log('   - Compact "My Day" panel');
    console.log('   - Pipeline overview');
    console.log('   - Renewals list');
    console.log('   - Lead quality indicators');
    console.log('   - Quick Actions floating menu (bottom-right)');
    console.log('   - Hover effects on cards');
    console.log('   - Dense, professional layout (8px grid)');
  })
  .catch((err) => {
    console.error('\n❌ Login API test failed:', err.message);
    process.exit(1);
  });


