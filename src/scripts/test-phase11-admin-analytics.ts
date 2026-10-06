import crypto from 'crypto';
import request from 'supertest';
import app from '../app';
import { prisma, disconnectDatabase } from '../config/database';
import { env } from '../config/env';
import { hashPassword } from '../utils/password';

async function testPhase11AndWebhook() {
  console.log('🧪 Starting Phase 11 (Admin Analytics & Webhook Idempotency) Verification...\n');

  let admin: any;
  let adminToken: string;

  try {
    const now = Date.now();
    const adminPass = 'Admin@Pass123';
    const passHash = await hashPassword(adminPass);

    admin = await prisma.admin.create({
      data: {
        name: 'Head Admin',
        email: `head_admin_${now}@test.com`,
        passwordHash: passHash,
      },
    });

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: admin.email, password: adminPass });
    adminToken = loginRes.body.data.accessToken;

    // 1. Test Admin Dashboard with real orders/revenue
    console.log('1️⃣ Testing Admin Dashboard Aggregates...');
    const dashRes = await request(app)
      .get('/api/admin/dashboard')
      .set('Authorization', `Bearer ${adminToken}`);

    if (dashRes.status !== 200) {
      throw new Error(`Dashboard failed: ${dashRes.status}`);
    }
    const stats = dashRes.body.data.stats;
    console.log('✅ Dashboard Stats:', stats);

    // 2. Test Admin Orders Listing
    console.log('\n2️⃣ Testing Admin Orders with Filters...');
    const ordersRes = await request(app)
      .get('/api/admin/orders')
      .set('Authorization', `Bearer ${adminToken}`);

    if (ordersRes.status !== 200) {
      throw new Error(`Orders listing failed: ${ordersRes.status}`);
    }
    console.log(`✅ Admin retrieved ${ordersRes.body.data.orders.length} total orders across platform.`);

    // 3. Test Admin Transactions Listing
    console.log('\n3️⃣ Testing Admin Transactions Listing...');
    const txRes = await request(app)
      .get('/api/admin/transactions')
      .set('Authorization', `Bearer ${adminToken}`);

    if (txRes.status !== 200) {
      throw new Error(`Transactions listing failed: ${txRes.status}`);
    }
    console.log(`✅ Admin retrieved ${txRes.body.data.transactions.length} total transactions.`);

    // 4. Test Razorpay Webhook with Signature Verification & Idempotency
    console.log('\n4️⃣ Testing Razorpay Webhook & Idempotency...');
    const webhookEventId = `evt_${Date.now()}`;
    const webhookPayload = {
      id: webhookEventId,
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: `pay_hook_${Date.now()}`,
            order_id: 'rzp_mock_webhook_order',
            amount: 50000,
            status: 'captured',
          },
        },
      },
    };

    const rawPayload = JSON.stringify(webhookPayload);
    const webhookSig = crypto
      .createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET)
      .update(rawPayload)
      .digest('hex');

    // First Webhook Call
    const hook1 = await request(app)
      .post('/api/webhooks/razorpay')
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', webhookSig)
      .send(rawPayload);

    if (hook1.status !== 200) {
      throw new Error(`Webhook failed: ${hook1.status} ${JSON.stringify(hook1.body)}`);
    }
    console.log('✅ First webhook event processed successfully');

    // Duplicate Webhook Call (Testing Idempotency)
    const hook2 = await request(app)
      .post('/api/webhooks/razorpay')
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', webhookSig)
      .send(rawPayload);

    if (hook2.status !== 200 || hook2.body.status !== 'already_processed') {
      throw new Error(`Webhook idempotency failed: ${JSON.stringify(hook2.body)}`);
    }
    console.log('✅ Duplicate webhook detected and safely ignored (Idempotency confirmed)');

    console.log('\n🎉 Phase 11 & Webhook Idempotency passed all tests successfully!\n');
  } catch (error) {
    console.error('❌ Test failure:', error);
    process.exit(1);
  } finally {
    if (admin?.id) await prisma.admin.delete({ where: { id: admin.id } }).catch(() => {});
    await disconnectDatabase();
  }
}

testPhase11AndWebhook();
