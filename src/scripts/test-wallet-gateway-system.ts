import request from 'supertest';
import app from '../app';
import { prisma } from '../config/database';
import { generateAccessToken } from '../utils/jwt';
import { hashPassword } from '../utils/password';
import { generateDailyToken } from '../utils/tokenGenerator';
import { Prisma } from '@prisma/client';
import { walletService } from '../modules/wallets/wallet.service';
import { paymentGatewayService } from '../modules/payment-gateway/payment-gateway.service';
import crypto from 'crypto';

async function runTests() {
  console.log('🧪 Starting Payment Gateway and Shopkeeper Wallet Management Verification Suite...\n');

  let adminToken: string;
  let shopA: any;
  let shopB: any;
  let shopkeeperA: any;
  let shopkeeperB: any;
  let customer: any;
  let productA: any;
  let productB: any;

  try {
    const timestamp = Date.now();

    // 0. Setup test Admin, Shops, Shopkeepers, Customer, and Products
    console.log('0️⃣ Setting up test fixtures in database...');
    const passHash = await hashPassword('Test@1234');

    let admin = await prisma.admin.findFirst();
    if (!admin) {
      admin = await prisma.admin.create({
        data: {
          name: 'Super Admin',
          email: `admin_${timestamp}@scanpayeat.com`,
          passwordHash: passHash,
        },
      });
    }
    adminToken = generateAccessToken({ sub: String(admin.id), role: 'ADMIN', email: admin.email });

    // Shop A
    shopA = await prisma.shop.create({
      data: {
        name: `Wallet Test Cafe A ${timestamp}`,
        slug: `shop-a-${timestamp}`,
        subdomain: `shop-a-${timestamp}`,
      },
    });

    shopkeeperA = await prisma.shopkeeper.create({
      data: {
        name: 'Manager A',
        email: `manager_a_${timestamp}@test.com`,
        shopId: shopA.id,
        passwordHash: passHash,
      },
    });

    // Shop B (for isolation test)
    shopB = await prisma.shop.create({
      data: {
        name: `Wallet Test Cafe B ${timestamp}`,
        slug: `shop-b-${timestamp}`,
        subdomain: `shop-b-${timestamp}`,
      },
    });

    shopkeeperB = await prisma.shopkeeper.create({
      data: {
        name: 'Manager B',
        email: `manager_b_${timestamp}@test.com`,
        shopId: shopB.id,
        passwordHash: passHash,
      },
    });

    // Customer
    customer = await prisma.customer.create({
      data: {
        name: 'Alice Diner',
        email: `alice_${timestamp}@test.com`,
        passwordHash: passHash,
      },
    });

    // Categories & Products
    const catA = await prisma.category.create({
      data: { shopId: shopA.id, name: 'Snacks' },
    });
    productA = await prisma.product.create({
      data: {
        shopId: shopA.id,
        categoryId: catA.id,
        name: 'Crispy Fries',
        price: 100.0,
      },
    });

    const catB = await prisma.category.create({
      data: { shopId: shopB.id, name: 'Meals' },
    });
    productB = await prisma.product.create({
      data: {
        shopId: shopB.id,
        categoryId: catB.id,
        name: 'Veg Platter',
        price: 250.0,
      },
    });

    console.log('✅ Test fixtures created successfully.\n');

    // TEST 1: Admin Payment Gateway Settings (Security & Never exposing secret)
    console.log('=================================================================');
    console.log('TEST 1: Admin Payment Gateway Settings & Secret Protection');
    console.log('=================================================================');

    const updateGwRes = await request(app)
      .put('/api/admin/payment-gateway')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        keyId: 'rzp_test_SecTest123',
        keySecret: 'SuperSecretKeyFromAdminXYZ99',
        webhookSecret: 'SuperWebhookSecretABC88',
        environment: 'TEST',
        currency: 'INR',
        platformFeeType: 'PERCENT',
        platformFeeValue: 2.5,
        isActive: true,
      });

    if (updateGwRes.status !== 200) {
      throw new Error(`Failed to update gateway settings: ${JSON.stringify(updateGwRes.body)}`);
    }

    const savedSettings = updateGwRes.body.data.settings;
    console.log('Returned keyId:', savedSettings.keyId);
    console.log('Returned keySecretMasked:', savedSettings.keySecretMasked);

    // CRITICAL: Verify plain secret is NEVER exposed to frontend
    if (savedSettings.keySecret) {
      throw new Error('SECURITY VIOLATION: Plain keySecret was exposed in response!');
    }
    if (!savedSettings.keySecretMasked.startsWith('••••')) {
      throw new Error('SECURITY VIOLATION: keySecret was not masked!');
    }
    if (savedSettings.keySecretMasked.includes('SuperSecretKeyFromAdminXYZ99')) {
      throw new Error('SECURITY VIOLATION: Full secret leaked in masked string!');
    }
    console.log('🔒 Verified: Gateway Key Secret is stored securely and never exposed in plain text.\n');

    // TEST 2: Individual Shopkeeper Wallets (Creation & Uniqueness)
    console.log('=================================================================');
    console.log('TEST 2: Individual Shopkeeper Wallets & Duplicate Prevention');
    console.log('=================================================================');

    const walletA = await walletService.getOrCreateWallet(shopkeeperA.id);
    const walletB = await walletService.getOrCreateWallet(shopkeeperB.id);

    console.log(`Wallet A ID: ${walletA.id}, Shopkeeper: ${walletA.shopkeeperId}`);
    console.log(`Wallet B ID: ${walletB.id}, Shopkeeper: ${walletB.shopkeeperId}`);

    if (walletA.id === walletB.id) {
      throw new Error('FAIL: Shopkeepers must have separate unique wallets!');
    }

    // Try creating duplicate wallet for same shopkeeper
    let duplicateCaught = false;
    try {
      await prisma.shopkeeperWallet.create({
        data: {
          shopkeeperId: shopkeeperA.id,
          balance: new Prisma.Decimal(100),
        },
      });
    } catch (e: any) {
      duplicateCaught = true;
      console.log('🔒 Verified: Duplicate wallet creation rejected by database unique constraint.');
    }
    if (!duplicateCaught) {
      throw new Error('FAIL: Database failed to prevent duplicate wallet for same shopkeeper!');
    }
    console.log('✅ Unique wallets verified.\n');

    // TEST 3: Admin Credit & Immutable Transaction Ledger
    console.log('=================================================================');
    console.log('TEST 3: Admin Wallet Credit & Ledger Verification');
    console.log('=================================================================');

    const creditAmount = 500.0;
    const creditRes = await request(app)
      .post(`/api/admin/wallets/${shopkeeperA.id}/credit`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        amount: creditAmount,
        reference: 'TEST-REF-CREDIT-001',
        notes: 'Monthly starter credit',
        idempotencyKey: `IDEM-CREDIT-TEST-${timestamp}`,
      });

    if (creditRes.status !== 200) {
      throw new Error(`Admin credit failed: ${JSON.stringify(creditRes.body)}`);
    }

    const creditData = creditRes.body.data;
    console.log(`Wallet A balance after credit: ₹${creditData.wallet.balance}`);
    console.log(`Transaction ID: ${creditData.transaction.id}, Type: ${creditData.transaction.type}`);
    console.log(`Previous Balance: ₹${creditData.transaction.previousBalance}, New: ₹${creditData.transaction.newBalance}`);

    if (Number(creditData.wallet.balance) !== 500.0) {
      throw new Error(`Expected balance 500.0, got ${creditData.wallet.balance}`);
    }
    if (creditData.transaction.reference !== 'TEST-REF-CREDIT-001') {
      throw new Error('Transaction reference mismatch!');
    }

    // Idempotency: Retrying with same idempotencyKey should NOT duplicate credit
    const retryCreditRes = await request(app)
      .post(`/api/admin/wallets/${shopkeeperA.id}/credit`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        amount: creditAmount,
        reference: 'TEST-REF-CREDIT-001',
        notes: 'Monthly starter credit retry',
        idempotencyKey: `IDEM-CREDIT-TEST-${timestamp}`,
      });

    if (retryCreditRes.body.data.isDuplicate !== true) {
      throw new Error('FAIL: Idempotent replay was not recognized!');
    }
    const checkWalletA = await walletService.getWalletByShopkeeperId(shopkeeperA.id);
    if (checkWalletA.balance !== 500.0) {
      throw new Error(`FAIL: Idempotent duplicate credit added money twice! Balance: ${checkWalletA.balance}`);
    }
    console.log('🔒 Verified: Duplicate credit blocked; idempotency preserved.\n');

    // TEST 4: Separate Wallet Limits & QR Payment Blocking
    console.log('=================================================================');
    console.log('TEST 4: Separate Wallet Limits & Insufficient Balance Blocking');
    console.log('=================================================================');

    // Set Shopkeeper A minimum limit to ₹800 (current balance is ₹500, so 500 < 800)
    const setLimitRes = await request(app)
      .patch(`/api/admin/wallets/${shopkeeperA.id}/limit`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ minWalletLimit: 800.0 });

    if (setLimitRes.status !== 200) {
      throw new Error(`Failed to set wallet limit: ${JSON.stringify(setLimitRes.body)}`);
    }
    console.log(`Shopkeeper A limit set to ₹800.00 (Current balance: ₹500.00)`);

    // Customer attempts QR Checkout at Shop A -> Must be BLOCKED
    const blockedCheckoutRes = await request(app)
      .post('/api/orders/checkout')
      .send({
        shopId: shopA.id,
        items: [{ productId: productA.id, quantity: 1 }],
        customerName: 'Alice Diner',
      });

    console.log(`Checkout Status with Insufficient Balance: ${blockedCheckoutRes.status}`);
    console.log(`Checkout Response:`, blockedCheckoutRes.body.message);

    if (blockedCheckoutRes.status !== 402 && blockedCheckoutRes.status !== 400) {
      throw new Error(`FAIL: Expected 402/400 Payment Required, got ${blockedCheckoutRes.status}`);
    }
    if (!blockedCheckoutRes.body.message.toLowerCase().includes('wallet balance limit')) {
      throw new Error(`FAIL: Error message did not indicate wallet limit: ${blockedCheckoutRes.body.message}`);
    }
    console.log('🔒 Verified: QR Checkout strictly BLOCKED when wallet balance < minimum limit.\n');

    // TEST 5: Exact-Limit Balance (balance == minWalletLimit) Allows Payment
    console.log('=================================================================');
    console.log('TEST 5: Exact-Limit Balance (balance == limit) Allows Payment');
    console.log('=================================================================');

    // Credit ₹300 so balance becomes exactly ₹800.00 (which equals limit 800.00)
    await walletService.adminCredit(shopkeeperA.id, admin.id, {
      amount: 300.0,
      reference: 'TOPUP-TO-EXACT-LIMIT',
    });
    const exactWallet = await walletService.getWalletByShopkeeperId(shopkeeperA.id);
    console.log(`Current Balance: ₹${exactWallet.balance}, Minimum Limit: ₹${exactWallet.minWalletLimit}`);

    const allowedCheckoutRes = await request(app)
      .post('/api/orders/checkout')
      .send({
        shopId: shopA.id,
        items: [{ productId: productA.id, quantity: 1 }],
        customerName: 'Alice Diner',
      });

    console.log(`Checkout Status at Exact Limit: ${allowedCheckoutRes.status}`);
    if (allowedCheckoutRes.status !== 201 && allowedCheckoutRes.status !== 200) {
      throw new Error(`FAIL: Checkout should be ALLOWED when balance == limit! Got ${allowedCheckoutRes.status}: ${JSON.stringify(allowedCheckoutRes.body)}`);
    }
    console.log('✅ Verified: QR Checkout allowed when balance is exactly equal to minimum limit.\n');

    // TEST 6: Shopkeeper Isolation (Shop A limit does NOT affect Shop B)
    console.log('=================================================================');
    console.log('TEST 6: Shopkeeper Isolation (Shop A vs Shop B)');
    console.log('=================================================================');

    // Shopkeeper B currently has balance 0 and limit 0 (0 >= 0 is allowed)
    const checkB = await walletService.getWalletByShopkeeperId(shopkeeperB.id);
    console.log(`Shopkeeper B Balance: ₹${checkB.balance}, Limit: ₹${checkB.minWalletLimit}`);

    const shopBCheckoutRes = await request(app)
      .post('/api/orders/checkout')
      .send({
        shopId: shopB.id,
        items: [{ productId: productB.id, quantity: 1 }],
        customerName: 'Bob Diner',
      });

    console.log(`Shop B Checkout Status: ${shopBCheckoutRes.status}`);
    if (shopBCheckoutRes.status !== 201 && shopBCheckoutRes.status !== 200) {
      throw new Error(`FAIL: Shop B checkout failed unexpectedly: ${JSON.stringify(shopBCheckoutRes.body)}`);
    }
    console.log('🔒 Verified: Complete isolation between shopkeepers confirmed.\n');

    // TEST 7: QR Status Toggle (Enable / Disable)
    console.log('=================================================================');
    console.log('TEST 7: QR Enable / Disable Status');
    console.log('=================================================================');

    // Disable QR for Shopkeeper A
    await request(app)
      .patch(`/api/admin/wallets/${shopkeeperA.id}/qr-status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isQrEnabled: false });

    const qrDisabledRes = await request(app)
      .post('/api/orders/checkout')
      .send({
        shopId: shopA.id,
        items: [{ productId: productA.id, quantity: 1 }],
        customerName: 'Alice Diner',
      });

    console.log(`Checkout Status with QR Disabled: ${qrDisabledRes.status}`);
    if (qrDisabledRes.status !== 403) {
      throw new Error(`FAIL: Expected 403 Forbidden with QR disabled, got ${qrDisabledRes.status}`);
    }
    console.log('🔒 Verified: QR Checkout blocked when isQrEnabled is false.\n');

    // Re-enable QR
    await request(app)
      .patch(`/api/admin/wallets/${shopkeeperA.id}/qr-status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isQrEnabled: true });

    // TEST 8: Verified Payment & Correct Platform Fee Wallet Debit Rule
    console.log('=================================================================');
    console.log('TEST 8: Verified Payment Platform Fee Debit (Not Full Amount)');
    console.log('=================================================================');

    // Place new order for Shop A: ₹200 order
    const checkoutRes = await request(app)
      .post('/api/orders/checkout')
      .send({
        shopId: shopA.id,
        items: [{ productId: productA.id, quantity: 2 }], // 2 * 100 = ₹200
        customerName: 'Alice Diner',
      });

    const orderId = checkoutRes.body.data.orderId;
    const rzpOrderId = checkoutRes.body.data.razorpayOrderId;
    const orderTotal = checkoutRes.body.data.totalAmount;
    console.log(`Order created: #${orderId}, Total Amount: ₹${orderTotal}`);

    const prePaymentWallet = await walletService.getWalletByShopkeeperId(shopkeeperA.id);
    const preBalance = prePaymentWallet.balance;
    console.log(`Pre-payment wallet balance: ₹${preBalance}`);

    // Simulate payment signature verification
    // Platform fee setting is 2.5% of ₹200 = ₹5.00
    // Business rule: Deduct ONLY ₹5.00 platform fee from wallet, NOT full ₹200 customer payment!
    const testSecret = 'SuperSecretKeyFromAdminXYZ99';
    const fakePaymentId = `pay_test_${timestamp}`;
    const generatedSig = crypto
      .createHmac('sha256', testSecret)
      .update(`${rzpOrderId}|${fakePaymentId}`)
      .digest('hex');

    const verifyRes = await request(app)
      .post('/api/payments/verify')
      .send({
        orderId,
        razorpay_order_id: rzpOrderId,
        razorpay_payment_id: fakePaymentId,
        razorpay_signature: generatedSig,
      });

    console.log(`Payment Verify Status: ${verifyRes.status}`);
    if (verifyRes.status !== 200) {
      throw new Error(`Payment verification failed: ${JSON.stringify(verifyRes.body)}`);
    }

    const postPaymentWallet = await walletService.getWalletByShopkeeperId(shopkeeperA.id);
    const postBalance = postPaymentWallet.balance;
    const debited = preBalance - postBalance;
    console.log(`Post-payment wallet balance: ₹${postBalance}`);
    console.log(`Actual wallet deduction: ₹${debited.toFixed(2)}`);

    if (Math.abs(debited - 5.0) > 0.01) {
      throw new Error(`FAIL: Incorrect wallet deduction rule! Expected ₹5.00 platform fee (2.5% of ₹200), got ₹${debited}`);
    }

    console.log('🔒 Verified: Deducted correct ₹5.00 platform fee (2.5%), preserving full customer revenue!\n');

    console.log('=================================================================');
    console.log('🎉 ALL 8 TESTS PASSED WITH 100% SUCCESS!');
    console.log('=================================================================');
  } catch (err: any) {
    console.error('❌ TEST SUITE FAILED:', err.message || err);
    throw err;
  } finally {
    // Cleanup test shops and records
    if (shopA) {
      await prisma.walletTransaction.deleteMany({
        where: { wallet: { shopkeeper: { shopId: shopA.id } } },
      }).catch(() => {});
      await prisma.shopkeeperWallet.deleteMany({
        where: { shopkeeper: { shopId: shopA.id } },
      }).catch(() => {});
      await prisma.payment.deleteMany({ where: { shopId: shopA.id } }).catch(() => {});
      await prisma.orderStatusHistory.deleteMany({ where: { order: { shopId: shopA.id } } }).catch(() => {});
      await prisma.orderItem.deleteMany({ where: { order: { shopId: shopA.id } } }).catch(() => {});
      await prisma.order.deleteMany({ where: { shopId: shopA.id } }).catch(() => {});
      await prisma.product.deleteMany({ where: { shopId: shopA.id } }).catch(() => {});
      await prisma.category.deleteMany({ where: { shopId: shopA.id } }).catch(() => {});
      await prisma.shopkeeper.deleteMany({ where: { shopId: shopA.id } }).catch(() => {});
      await prisma.shop.delete({ where: { id: shopA.id } }).catch(() => {});
    }
    if (shopB) {
      await prisma.walletTransaction.deleteMany({
        where: { wallet: { shopkeeper: { shopId: shopB.id } } },
      }).catch(() => {});
      await prisma.shopkeeperWallet.deleteMany({
        where: { shopkeeper: { shopId: shopB.id } },
      }).catch(() => {});
      await prisma.payment.deleteMany({ where: { shopId: shopB.id } }).catch(() => {});
      await prisma.orderStatusHistory.deleteMany({ where: { order: { shopId: shopB.id } } }).catch(() => {});
      await prisma.orderItem.deleteMany({ where: { order: { shopId: shopB.id } } }).catch(() => {});
      await prisma.order.deleteMany({ where: { shopId: shopB.id } }).catch(() => {});
      await prisma.product.deleteMany({ where: { shopId: shopB.id } }).catch(() => {});
      await prisma.category.deleteMany({ where: { shopId: shopB.id } }).catch(() => {});
      await prisma.shopkeeper.deleteMany({ where: { shopId: shopB.id } }).catch(() => {});
      await prisma.shop.delete({ where: { id: shopB.id } }).catch(() => {});
    }
    if (customer) {
      await prisma.customer.delete({ where: { id: customer.id } }).catch(() => {});
    }
    await prisma.$disconnect();
  }
}

runTests();
