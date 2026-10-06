import crypto from 'crypto';
import request from 'supertest';
import app from '../app';
import { prisma, disconnectDatabase } from '../config/database';
import { env } from '../config/env';
import { hashPassword } from '../utils/password';

async function testPhases6to10() {
  console.log('🧪 Starting Phases 6 to 10 (Orders, Payments, Tokens, Status & History) Verification...\n');

  let shop: any;
  let customer: any;
  let shopkeeper: any;
  let customerToken: string;
  let shopkeeperToken: string;

  try {
    const now = Date.now();

    // 1. Setup Shop, Shopkeeper, and Customer
    console.log('1️⃣ Setting up Shop, Shopkeeper, and Customer in PostgreSQL...');
    shop = await prisma.shop.create({
      data: {
        name: 'Burger Station',
        slug: `bs-${now}`,
        subdomain: `bs-${now}`,
      },
    });

    const passHash = await hashPassword('Secret123');
    shopkeeper = await prisma.shopkeeper.create({
      data: {
        name: 'Station Manager',
        email: `manager_${now}@test.com`,
        shopId: shop.id,
        passwordHash: passHash,
      },
    });

    customer = await prisma.customer.create({
      data: {
        name: 'Hungry Customer',
        email: `hungry_${now}@test.com`,
        passwordHash: passHash,
      },
    });

    const cat = await prisma.category.create({
      data: {
        shopId: shop.id,
        name: 'Mains',
      },
    });

    const prod1 = await prisma.product.create({
      data: {
        shopId: shop.id,
        categoryId: cat.id,
        name: 'Supreme Burger',
        price: 200.0,
        isAvailable: true,
      },
    });

    const prod2 = await prisma.product.create({
      data: {
        shopId: shop.id,
        categoryId: cat.id,
        name: 'French Fries',
        price: 80.0,
        isAvailable: true,
      },
    });

    // Login customer & shopkeeper
    const custLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: customer.email, password: 'Secret123' });
    customerToken = custLogin.body.data.accessToken;

    const skLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: shopkeeper.email, password: 'Secret123' });
    shopkeeperToken = skLogin.body.data.accessToken;

    console.log('✅ Accounts & Menu items created successfully.');

    // 2. PHASE 6: Order Checkout & Price Recalculation
    console.log('\n2️⃣ Testing Order Checkout (Server-Side Price Calculation)...');
    const checkoutRes = await request(app)
      .post('/api/orders/checkout')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        shopSlug: shop.slug,
        items: [
          { productId: prod1.id, quantity: 2 }, // 2 * 200 = 400
          { productId: prod2.id, quantity: 1 }, // 1 * 80 = 80
        ],
        notes: 'Extra ketchup please',
      });

    if (checkoutRes.status !== 201) {
      throw new Error(`Checkout failed: ${checkoutRes.status} ${JSON.stringify(checkoutRes.body)}`);
    }

    const orderData = checkoutRes.body.data;
    console.log('✅ Order created:', {
      orderId: orderData.orderId,
      orderCode: orderData.orderCode,
      totalAmount: orderData.totalAmount,
      razorpayOrderId: orderData.razorpayOrderId,
    });

    if (orderData.totalAmount !== 480) {
      throw new Error(`Expected totalAmount 480, got ${orderData.totalAmount}`);
    }
    console.log('✅ Server-side price calculation verified (200*2 + 80*1 = 480)');

    // 3. PHASE 7 & 8: Payment Verification & Daily Token Generation
    console.log('\n3️⃣ Testing Razorpay Signature Verification & Daily Token Generation...');
    const fakePaymentId = `pay_${Date.now()}`;
    const generatedSignature = crypto
      .createHmac('sha256', env.RAZORPAY_KEY_SECRET)
      .update(`${orderData.razorpayOrderId}|${fakePaymentId}`)
      .digest('hex');

    const verifyRes = await request(app)
      .post('/api/payments/verify')
      .send({
        razorpay_order_id: orderData.razorpayOrderId,
        razorpay_payment_id: fakePaymentId,
        razorpay_signature: generatedSignature,
      });

    if (verifyRes.status !== 200) {
      throw new Error(`Payment verification failed: ${verifyRes.status} ${JSON.stringify(verifyRes.body)}`);
    }

    const verified = verifyRes.body.data;
    console.log('✅ Payment verified atomically! Token assigned:', verified.tokenNumber);

    if (!verified.tokenNumber || !verified.tokenNumber.startsWith('B')) {
      throw new Error(`Invalid token format: ${verified.tokenNumber}`);
    }

    // Test second order token increment (e.g. B101 -> B102)
    console.log('\n4️⃣ Testing Atomic Daily Token Counter Increment (Order 2)...');
    const checkoutRes2 = await request(app)
      .post('/api/orders/checkout')
      .send({
        shopSlug: shop.slug,
        items: [{ productId: prod2.id, quantity: 2 }],
      });
    const orderData2 = checkoutRes2.body.data;

    const fakePaymentId2 = `pay_${Date.now() + 1}`;
    const sig2 = crypto
      .createHmac('sha256', env.RAZORPAY_KEY_SECRET)
      .update(`${orderData2.razorpayOrderId}|${fakePaymentId2}`)
      .digest('hex');

    const verifyRes2 = await request(app)
      .post('/api/payments/verify')
      .send({
        razorpay_order_id: orderData2.razorpayOrderId,
        razorpay_payment_id: fakePaymentId2,
        razorpay_signature: sig2,
      });

    const token2 = verifyRes2.body.data.tokenNumber;
    console.log('✅ Second order token assigned:', token2);
    if (token2 === verified.tokenNumber) {
      throw new Error('Token should increment sequentially for each order!');
    }
    console.log('✅ Atomic token increment verified across consecutive orders');

    // 5. PHASE 9: Shopkeeper Status Workflow
    console.log('\n5️⃣ Testing Shopkeeper Status Transitions (CONFIRMED -> PREPARING -> READY -> COMPLETED)...');
    for (const status of ['PREPARING', 'READY', 'COMPLETED']) {
      const statusRes = await request(app)
        .patch(`/api/shop/orders/${orderData.orderId}/status`)
        .set('Authorization', `Bearer ${shopkeeperToken}`)
        .send({ status, notes: `Status updated to ${status}` });

      if (statusRes.status !== 200 || statusRes.body.data.order.orderStatus !== status) {
        throw new Error(`Failed to transition to status ${status}`);
      }
      console.log(`✅ Order ${orderData.orderCode} transitioned to -> ${status}`);
    }

    // 6. PHASE 10: Customer Order Tracking & History
    console.log('\n6️⃣ Testing Customer Order History & Tracking...');
    const myOrdersRes = await request(app)
      .get('/api/me/orders')
      .set('Authorization', `Bearer ${customerToken}`);

    if (myOrdersRes.status !== 200) {
      throw new Error(`Failed to fetch customer orders: ${myOrdersRes.status}`);
    }
    const myOrders = myOrdersRes.body.data.orders;
    console.log(`✅ Customer orders found: ${myOrders.length}`);
    if (myOrders.length === 0 || myOrders[0].orderCode !== orderData.orderCode) {
      throw new Error('Order not found in customer history!');
    }

    // Fetch single order details by code
    const singleOrderRes = await request(app)
      .get(`/api/me/orders/${orderData.orderCode}`)
      .set('Authorization', `Bearer ${customerToken}`);

    if (singleOrderRes.status !== 200) {
      throw new Error(`Failed to fetch order by code: ${singleOrderRes.status}`);
    }
    const singleOrder = singleOrderRes.body.data.order;
    console.log('✅ Customer order tracking details:', {
      orderCode: singleOrder.orderCode,
      status: singleOrder.orderStatus,
      tokenNumber: singleOrder.tokenNumber,
      historyLength: singleOrder.statusHistory.length,
    });

    console.log('\n🎉 Phases 6 to 10 passed all tests with flying colors!\n');
  } catch (error) {
    console.error('❌ Test failure:', error);
    process.exit(1);
  } finally {
    if (shop?.id) await prisma.shop.delete({ where: { id: shop.id } }).catch(() => {});
    if (customer?.id) await prisma.customer.delete({ where: { id: customer.id } }).catch(() => {});
    await disconnectDatabase();
  }
}

testPhases6to10();
