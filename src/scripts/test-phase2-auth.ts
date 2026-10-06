import request from 'supertest';
import app from '../app';
import { prisma, disconnectDatabase } from '../config/database';

async function testPhase2() {
  console.log('🧪 Starting Phase 2 (Auth & RBAC) Verification...\n');

  const testEmail = `cust_${Date.now()}@test.com`;
  const password = 'Password@123';

  try {
    // 1. Customer Registration
    console.log('1️⃣ Testing Customer Registration...');
    const regRes = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Test Customer',
        email: testEmail,
        mobile: '9876543210',
        password,
      });

    if (regRes.status !== 201) {
      throw new Error(`Registration failed: ${regRes.status} ${JSON.stringify(regRes.body)}`);
    }
    console.log('✅ Registration successful:', regRes.body.data.user);
    const accessToken = regRes.body.data.accessToken;
    const cookies = regRes.headers['set-cookie'] || [];
    console.log('✅ Set-Cookie headers received:', cookies.length);

    // 2. Prevent duplicate registration
    console.log('\n2️⃣ Testing Duplicate Registration Prevention...');
    const dupRes = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Duplicate Customer',
        email: testEmail,
        password,
      });
    if (dupRes.status !== 409) {
      throw new Error(`Expected 409 Conflict, got ${dupRes.status}`);
    }
    console.log('✅ Duplicate registration correctly rejected with 409 Conflict');

    // 3. Customer Login
    console.log('\n3️⃣ Testing Customer Login...');
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: testEmail,
        password,
      });
    if (loginRes.status !== 200) {
      throw new Error(`Login failed: ${loginRes.status} ${JSON.stringify(loginRes.body)}`);
    }
    console.log('✅ Login successful:', loginRes.body.data.user);

    // 4. Invalid Password Rejection
    console.log('\n4️⃣ Testing Invalid Password Rejection...');
    const wrongPassRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: testEmail,
        password: 'WrongPassword',
      });
    if (wrongPassRes.status !== 401) {
      throw new Error(`Expected 401 Unauthorized, got ${wrongPassRes.status}`);
    }
    console.log('✅ Wrong password correctly rejected with 401');

    // 5. Test Authenticated Profile Route (/api/auth/me)
    console.log('\n5️⃣ Testing Authenticated /api/auth/me...');
    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);
    if (meRes.status !== 200) {
      throw new Error(`Failed to fetch /me: ${meRes.status} ${JSON.stringify(meRes.body)}`);
    }
    console.log('✅ Profile retrieved successfully:', meRes.body.data.user);

    // 6. Test Token Refresh
    console.log('\n6️⃣ Testing Refresh Token Rotation...');
    const cookieArray = Array.isArray(cookies) ? cookies : [cookies];
    const refreshCookie = cookieArray.find((c: string) => typeof c === 'string' && c.startsWith('refreshToken='));
    const refreshRes = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', [refreshCookie || '']);
    if (refreshRes.status !== 200) {
      throw new Error(`Token refresh failed: ${refreshRes.status} ${JSON.stringify(refreshRes.body)}`);
    }
    console.log('✅ Refresh token successfully rotated, new access token generated');

    // 7. Test Logout
    console.log('\n7️⃣ Testing Logout...');
    const logoutRes = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', [refreshCookie || '']);
    if (logoutRes.status !== 200) {
      throw new Error(`Logout failed: ${logoutRes.status}`);
    }
    console.log('✅ Logout successful');

    console.log('\n🎉 Phase 2 (Authentication & RBAC) passed all tests successfully!\n');
  } catch (error) {
    console.error('❌ Phase 2 test failure:', error);
    process.exit(1);
  } finally {
    // Cleanup test user
    await prisma.customer.deleteMany({ where: { email: testEmail } });
    await disconnectDatabase();
  }
}

testPhase2();
