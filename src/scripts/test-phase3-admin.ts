import request from 'supertest';
import app from '../app';
import { prisma, disconnectDatabase } from '../config/database';
import { hashPassword } from '../utils/password';
import { generateAccessToken } from '../utils/jwt';

async function testPhase3() {
  console.log('🧪 Starting Phase 3 (Admin Management) Verification...\n');

  const adminEmail = `admin_${Date.now()}@test.com`;
  const adminPassword = 'AdminPassword@123';
  let adminId: number;
  let adminToken: string;

  try {
    // 1. Setup Admin Account in DB
    console.log('1️⃣ Seeding Test Admin Account in PostgreSQL...');
    const passwordHash = await hashPassword(adminPassword);
    const admin = await prisma.admin.create({
      data: {
        name: 'Platform Superadmin',
        email: adminEmail,
        passwordHash,
      },
    });
    adminId = admin.id;

    // Login via Auth API to get real JWT
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: adminEmail, password: adminPassword });

    if (loginRes.status !== 200) {
      throw new Error(`Admin login failed: ${loginRes.status} ${JSON.stringify(loginRes.body)}`);
    }
    adminToken = loginRes.body.data.accessToken;
    console.log('✅ Admin login successful, JWT obtained.');

    // 2. RBAC check: Unauthenticated or Customer attempt must be blocked
    console.log('\n2️⃣ Testing RBAC enforcement (Unauthorized access must return 401/403)...');
    const unauthRes = await request(app).get('/api/admin/shops');
    if (unauthRes.status !== 401) {
      throw new Error(`Expected 401 Unauthorized, got ${unauthRes.status}`);
    }
    console.log('✅ Unauthenticated request blocked with 401');

    const fakeCustomerToken = generateAccessToken({
      sub: '999',
      role: 'CUSTOMER',
      email: 'customer@test.com',
    });
    const forbiddenRes = await request(app)
      .get('/api/admin/shops')
      .set('Authorization', `Bearer ${fakeCustomerToken}`);
    if (forbiddenRes.status !== 401 && forbiddenRes.status !== 403) {
      throw new Error(`Expected 403 Forbidden, got ${forbiddenRes.status}`);
    }
    console.log('✅ Non-admin user blocked from admin routes');

    // 3. Admin Creates Shop
    console.log('\n3️⃣ Testing Admin Shop Creation...');
    const slug = `abc-${Date.now()}`;
    const shopRes = await request(app)
      .post('/api/admin/shops')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'ABC Restaurant',
        slug,
        subdomain: slug,
        address: '123 Food Street, Downtown',
        phone: '9876543210',
      });

    if (shopRes.status !== 201) {
      throw new Error(`Shop creation failed: ${shopRes.status} ${JSON.stringify(shopRes.body)}`);
    }
    const shop = shopRes.body.data.shop;
    console.log('✅ Shop created successfully:', {
      id: shop.id,
      name: shop.name,
      slug: shop.slug,
      qrUrl: shop.qrUrl,
    });

    // 4. Admin Creates Shopkeeper
    console.log('\n4️⃣ Testing Admin Shopkeeper Creation...');
    const skEmail = `sk_${Date.now()}@test.com`;
    const skRes = await request(app)
      .post('/api/admin/shopkeepers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'John Doe',
        email: skEmail,
        mobile: '9123456789',
        shopId: shop.id,
        password: 'ShopkeeperPass@123',
      });

    if (skRes.status !== 201) {
      throw new Error(`Shopkeeper creation failed: ${skRes.status} ${JSON.stringify(skRes.body)}`);
    }
    const shopkeeper = skRes.body.data.shopkeeper;
    console.log('✅ Shopkeeper created successfully:', {
      id: shopkeeper.id,
      name: shopkeeper.name,
      email: shopkeeper.email,
      shopId: shopkeeper.shopId,
    });

    // 5. Test Shopkeeper Login to verify assigned shop
    console.log('\n5️⃣ Testing Shopkeeper Login...');
    const skLoginRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: skEmail,
        password: 'ShopkeeperPass@123',
      });

    if (skLoginRes.status !== 200) {
      throw new Error(`Shopkeeper login failed: ${skLoginRes.status} ${JSON.stringify(skLoginRes.body)}`);
    }
    console.log('✅ Shopkeeper logged in with shopId:', skLoginRes.body.data.user.shopId);

    // 6. Test Admin Dashboard
    console.log('\n6️⃣ Testing Admin Dashboard...');
    const dashRes = await request(app)
      .get('/api/admin/dashboard')
      .set('Authorization', `Bearer ${adminToken}`);

    if (dashRes.status !== 200) {
      throw new Error(`Dashboard fetch failed: ${dashRes.status}`);
    }
    console.log('✅ Dashboard metrics retrieved:', dashRes.body.data.stats);

    // 7. Test Admin Toggle Shop Status
    console.log('\n7️⃣ Testing Toggle Shop Status...');
    const toggleRes = await request(app)
      .patch(`/api/admin/shops/${shop.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: false });

    if (toggleRes.status !== 200 || toggleRes.body.data.shop.isActive !== false) {
      throw new Error('Failed to deactivate shop');
    }
    console.log('✅ Shop deactivated successfully');

    // Verify shopkeeper of deactivated shop is blocked on login
    const blockedSkLogin = await request(app)
      .post('/api/auth/login')
      .send({
        email: skEmail,
        password: 'ShopkeeperPass@123',
      });
    if (blockedSkLogin.status !== 403) {
      throw new Error(`Expected 403 Forbidden for inactive shop, got ${blockedSkLogin.status}`);
    }
    console.log('✅ Inactive shop shopkeeper correctly blocked with 403');

    // Reactivate shop
    await request(app)
      .patch(`/api/admin/shops/${shop.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: true });
    console.log('✅ Shop reactivated successfully');

    console.log('\n🎉 Phase 3 (Admin Management) passed all tests successfully!\n');
  } catch (error) {
    console.error('❌ Phase 3 test failure:', error);
    process.exit(1);
  } finally {
    // Cleanup
    if (adminId!) {
      await prisma.admin.deleteMany({ where: { id: adminId } });
    }
    await disconnectDatabase();
  }
}

testPhase3();
