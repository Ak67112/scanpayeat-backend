import { prisma } from '../config/database';
import { env } from '../config/env';
import { encryptSecret } from '../utils/encryption';
import { Prisma } from '@prisma/client';

export async function initWalletAndGateway() {
  console.log('🔄 Initializing Payment Gateway & Shopkeeper Wallets...');

  // 1. Initialize Payment Gateway Settings if none exists
  const existingGateway = await prisma.paymentGatewaySetting.findFirst();
  if (!existingGateway) {
    const createdGateway = await prisma.paymentGatewaySetting.create({
      data: {
        provider: 'RAZORPAY',
        keyId: env.RAZORPAY_KEY_ID || 'rzp_test_T1r1kA5pHql9g7',
        keySecret: encryptSecret(env.RAZORPAY_KEY_SECRET || 'eZVwVdLc1rYYZxs6hnwPOetg'),
        webhookSecret: encryptSecret(env.RAZORPAY_WEBHOOK_SECRET || 'sample_webhook_secret'),
        environment: 'TEST',
        currency: 'INR',
        platformFeeType: 'PERCENT',
        platformFeeValue: new Prisma.Decimal(2.0),
        isActive: true,
      },
    });
    console.log(`✅ Created default Payment Gateway Setting with ID ${createdGateway.id}`);
  } else {
    console.log(`ℹ️ Payment Gateway Setting already exists (ID: ${existingGateway.id})`);
  }

  // 2. Initialize Wallets for all existing Shopkeepers
  const shopkeepers = await prisma.shopkeeper.findMany({
    include: { wallet: true, shop: true },
  });

  for (const sk of shopkeepers) {
    if (!sk.wallet) {
      const initialBalance = new Prisma.Decimal(500.0);
      const minLimit = new Prisma.Decimal(100.0);

      const wallet = await prisma.$transaction(async (tx) => {
        const createdWallet = await tx.shopkeeperWallet.create({
          data: {
            shopkeeperId: sk.id,
            balance: initialBalance,
            minWalletLimit: minLimit,
            isQrEnabled: true,
            totalCredits: initialBalance,
            totalDebits: new Prisma.Decimal(0),
          },
        });

        await tx.walletTransaction.create({
          data: {
            walletId: createdWallet.id,
            type: 'CREDIT',
            amount: initialBalance,
            previousBalance: new Prisma.Decimal(0),
            newBalance: initialBalance,
            reference: `INIT-SETUP-${sk.id}-${Date.now()}`,
            idempotencyKey: `INIT-SK-${sk.id}`,
            notes: `Initial complimentary onboarding credit for ${sk.name} (${sk.shop?.name || 'Shop'})`,
          },
        });

        return createdWallet;
      });

      console.log(`✅ Initialized wallet for Shopkeeper #${sk.id} (${sk.name}) - Balance: ₹500.00, Limit: ₹100.00`);
    } else {
      console.log(`ℹ️ Wallet already exists for Shopkeeper #${sk.id} (${sk.name}) - Balance: ₹${sk.wallet.balance}`);
    }
  }

  console.log('🎉 Payment Gateway & Wallets initialization complete.');
}

if (require.main === module) {
  initWalletAndGateway()
    .catch((err) => {
      console.error('❌ Initialization error:', err);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
