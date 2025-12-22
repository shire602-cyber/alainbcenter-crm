// Comprehensive auth testing script
const http = require('http');
const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');

const prisma = new PrismaClient();

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

function createSessionToken(userId, email, role) {
  const SECRET = 'alain-crm-secret-key-change-in-production';
  const payload = {
    userId,
    email,
    role,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
  };
  const payloadStr = JSON.stringify(payload);
  const encoded = Buffer.from(payloadStr).toString('base64');
  const signature = crypto.createHmac('sha256', SECRET).update(encoded).digest('hex');
  return `${encoded}.${signature}`;
}

function decodeSessionToken(token) {
  try {
    const SECRET = 'alain-crm-secret-key-change-in-production';
    // URL-decode in case it was encoded
    let decodedToken = token;
    try {
      decodedToken = decodeURIComponent(token);
    } catch {
      decodedToken = token;
    }
    const [encoded, signature] = decodedToken.split('.');
    if (!encoded || !signature) return null;
    const expectedSignature = crypto.createHmac('sha256', SECRET).update(encoded).digest('hex');
    if (signature !== expectedSignature) {
      console.log('   Signature mismatch!');
      return null;
    }
    const payloadStr = Buffer.from(encoded, 'base64').toString('utf-8');
    const payload = JSON.parse(payloadStr);
    if (payload.exp < Math.floor(Date.now() / 1000)) {
      console.log('   Token expired!');
      return null;
    }
    return payload;
  } catch (e) {
    console.log('   Decode error:', e.message);
    return null;
  }
}

async function testAuth() {
  console.log('=== AUTHENTICATION TEST ===\n');

  // 1. Check user exists
  console.log('1. Checking user in database...');
  const user = await prisma.user.findUnique({
    where: { email: 'admin@alainbcenter.com' }
  });
  if (!user) {
    console.log('❌ User not found!');
    await prisma.$disconnect();
    return;
  }
  console.log('✅ User found:', user.email, user.role);

  // 2. Test password hash
  console.log('\n2. Testing password verification...');
  const testHash = hashPassword('admin123');
  const passwordValid = user.password === testHash;
  console.log(passwordValid ? '✅ Password hash matches' : '❌ Password hash mismatch');
  console.log('   Stored:', user.password.substring(0, 20) + '...');
  console.log('   Test:  ', testHash.substring(0, 20) + '...');

  // 3. Test session token creation
  console.log('\n3. Testing session token creation...');
  const token = createSessionToken(user.id, user.email, user.role);
  console.log('✅ Token created, length:', token.length);
  console.log('   Token:', token.substring(0, 50) + '...');

  // 4. Test session token decoding
  console.log('\n4. Testing session token decoding...');
  const decoded = decodeSessionToken(token);
  if (decoded) {
    console.log('✅ Token decoded successfully');
    console.log('   UserId:', decoded.userId);
    console.log('   Email:', decoded.email);
    console.log('   Role:', decoded.role);
  } else {
    console.log('❌ Token decode failed!');
  }

  // 5. Test login API endpoint
  console.log('\n5. Testing login API endpoint...');
  const loginData = JSON.stringify({
    email: 'admin@alainbcenter.com',
    password: 'admin123'
  });

  const options = {
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
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        console.log('   Status:', res.statusCode);
        console.log('   Headers:', JSON.stringify(res.headers['set-cookie'], null, 2));
        
        if (res.statusCode === 200) {
          const response = JSON.parse(data);
          console.log('✅ Login API responded successfully');
          console.log('   Response:', JSON.stringify(response, null, 2));
          
          // Extract cookie from Set-Cookie header
          const setCookie = res.headers['set-cookie'];
          if (setCookie && setCookie[0]) {
            const cookieMatch = setCookie[0].match(/alaincrm_session=([^;]+)/);
            if (cookieMatch) {
              let cookieToken = cookieMatch[1];
              // URL-decode the token (browsers will decode it automatically when sending back)
              try {
                cookieToken = decodeURIComponent(cookieToken);
              } catch (e) {
                // Already decoded or can't decode
              }
              console.log('\n6. Testing cookie token...');
              console.log('   Raw token from header:', cookieMatch[1].substring(0, 80) + '...');
              console.log('   Decoded token:', cookieToken.substring(0, 80) + '...');
              const cookieDecoded = decodeSessionToken(cookieToken);
              if (cookieDecoded) {
                console.log('✅ Cookie token is valid!');
                console.log('   UserId:', cookieDecoded.userId);
                console.log('   Email:', cookieDecoded.email);
                console.log('   Role:', cookieDecoded.role);
              } else {
                console.log('❌ Cookie token is invalid!');
              }
            }
          }
        } else {
          console.log('❌ Login API failed');
          console.log('   Response:', data);
        }
        
        prisma.$disconnect().then(() => resolve());
      });
    });

    req.on('error', (e) => {
      console.log('❌ Request error:', e.message);
      console.log('   Is the dev server running on port 3000?');
      prisma.$disconnect().then(() => resolve());
    });

    req.write(loginData);
    req.end();
  });
}

testAuth().catch(console.error);

