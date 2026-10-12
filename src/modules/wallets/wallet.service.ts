import { prisma } from '../../config/database';
import { AppError } from '../../middleware/error.middleware';
import {
  AdminCreditWalletDto,
  AdminDebitWalletDto,
  SetWalletLimitDto,
  UpdateQrStatusDto,
} from './wallet.dto';
import { Prisma, WalletTransactionType } from '@prisma/client';
import {
  getActiveGatewayCredentials,
  getRazorpayClient,
  verifyRazorpaySignatureAsync,
  getPlatformEnvironmentCredentials,
  getPlatformRazorpayClient,
  verifyPlatformRechargeSignature,
} from '../../config/razorpay';
import { env } from '../../config/env';

export class WalletService {
  /**
   * Get or create a shopkeeper wallet ensuring 1-to-1 uniqueness
   */
  async getOrCreateWallet(shopkeeperId: number) {
    const existing = await prisma.shopkeeperWallet.findUnique({
      where: { shopkeeperId },
      include: {
        shopkeeper: {
          select: {
            id: true,
            name: true,
            email: true,
            mobile: true,
            isActive: true,
            shop: {
              select: { id: true, name: true, slug: true, subdomain: true, isActive: true },
            },
          },
        },
      },
    });

    if (existing) return existing;

    // Verify shopkeeper exists
    const shopkeeper = await prisma.shopkeeper.findUnique({
      where: { id: shopkeeperId },
      include: { shop: true },
    });

    if (!shopkeeper) {
      throw new AppError(`Shopkeeper #${shopkeeperId} not found.`, 404);
    }

    // Create default wallet
    return prisma.shopkeeperWallet.create({
      data: {
        shopkeeperId,
        balance: new Prisma.Decimal(0),
        minWalletLimit: new Prisma.Decimal(0),
        isQrEnabled: true,
        totalCredits: new Prisma.Decimal(0),
        totalDebits: new Prisma.Decimal(0),
      },
      include: {
        shopkeeper: {
          select: {
            id: true,
            name: true,
            email: true,
            mobile: true,
            isActive: true,
            shop: {
              select: { id: true, name: true, slug: true, subdomain: true, isActive: true },
            },
          },
        },
      },
    });
  }

  /**
   * List all shopkeeper wallets with filters and pagination
   */
  async getWallets(params: {
    search?: string;
    lowBalanceOnly?: boolean;
    qrEnabledOnly?: boolean;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));
    const skip = (page - 1) * limit;

    const where: any = {};

    if (params.qrEnabledOnly !== undefined) {
      where.isQrEnabled = params.qrEnabledOnly;
    }

    if (params.search) {
      const q = params.search.trim();
      where.shopkeeper = {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
          { shop: { name: { contains: q, mode: 'insensitive' } } },
        ],
      };
    }

    // Ensure all existing shopkeepers have a wallet row
    const allShopkeepers = await prisma.shopkeeper.findMany({
      select: { id: true, wallet: { select: { id: true } } },
    });
    for (const sk of allShopkeepers) {
      if (!sk.wallet) {
        await this.getOrCreateWallet(sk.id).catch(() => {});
      }
    }

    const [total, rawWallets] = await Promise.all([
      prisma.shopkeeperWallet.count({ where }),
      prisma.shopkeeperWallet.findMany({
        where,
        skip,
        take: limit,
        include: {
          shopkeeper: {
            select: {
              id: true,
              name: true,
              email: true,
              mobile: true,
              isActive: true,
              shop: {
                select: { id: true, name: true, slug: true, subdomain: true, isActive: true },
              },
            },
          },
          transactions: {
            take: 1,
            orderBy: { createdAt: 'desc' },
          },
        },
        orderBy: { updatedAt: 'desc' },
      }),
    ]);

    let wallets = rawWallets.map((w) => {
      const bal = Number(w.balance);
      const minLimit = Number(w.minWalletLimit);
      const isBreached = bal < minLimit;
      return {
        id: w.id,
        shopkeeperId: w.shopkeeperId,
        shopkeeper: w.shopkeeper,
        balance: bal,
        minWalletLimit: minLimit,
        isQrEnabled: w.isQrEnabled,
        isBreached,
        totalCredits: Number(w.totalCredits),
        totalDebits: Number(w.totalDebits),
        createdAt: w.createdAt,
        updatedAt: w.updatedAt,
        lastTransaction: w.transactions[0] || null,
      };
    });

    if (params.lowBalanceOnly) {
      wallets = wallets.filter((w) => w.isBreached);
    }

    return {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      wallets,
    };
  }

  /**
   * Get single wallet details and recent transaction ledger
   */
  async getWalletByShopkeeperId(shopkeeperId: number) {
    const wallet = await this.getOrCreateWallet(shopkeeperId);

    const recentTransactions = await prisma.walletTransaction.findMany({
      where: { walletId: wallet.id },
      take: 20,
      orderBy: { createdAt: 'desc' },
    });

    return {
      ...wallet,
      balance: Number(wallet.balance),
      minWalletLimit: Number(wallet.minWalletLimit),
      totalCredits: Number(wallet.totalCredits),
      totalDebits: Number(wallet.totalDebits),
      isBreached: Number(wallet.balance) < Number(wallet.minWalletLimit),
      recentTransactions: recentTransactions.map((tx) => ({
        ...tx,
        amount: Number(tx.amount),
        previousBalance: Number(tx.previousBalance),
        newBalance: Number(tx.newBalance),
      })),
    };
  }

  /**
   * Admin Wallet Credit with Row-level locking & Idempotency protection
   */
  async adminCredit(shopkeeperId: number, adminId: number, dto: AdminCreditWalletDto) {
    if (dto.amount <= 0) {
      throw new AppError('Credit amount must be greater than zero.', 400);
    }

    const wallet = await this.getOrCreateWallet(shopkeeperId);
    const amountDec = new Prisma.Decimal(dto.amount);
    const reference =
      dto.reference?.trim() ||
      `ADM-CR-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;

    const idempotencyKey =
      dto.idempotencyKey?.trim() ||
      `ADM-CR-KEY-${shopkeeperId}-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

    return prisma.$transaction(
      async (tx) => {
        // 1. Idempotency Check
        if (dto.idempotencyKey) {
          const existingTx = await tx.walletTransaction.findUnique({
            where: { idempotencyKey: dto.idempotencyKey },
          });
          if (existingTx) {
            const currentWallet = await tx.shopkeeperWallet.findUnique({
              where: { id: wallet.id },
            });
            return {
              isDuplicate: true,
              wallet: currentWallet,
              transaction: existingTx,
              message: 'Transaction already processed (Idempotent replay)',
            };
          }
        }

        // 2. Strict Row-level locking on wallet row
        await tx.$executeRaw`SELECT id FROM "shopkeeper_wallets" WHERE id = ${wallet.id} FOR UPDATE;`;

        // 3. Re-read current balance under lock
        const lockedWallet = await tx.shopkeeperWallet.findUnique({
          where: { id: wallet.id },
        });

        if (!lockedWallet) {
          throw new AppError('Wallet record not found during transaction lock.', 404);
        }

        const previousBalance = lockedWallet.balance;
        const newBalance = previousBalance.add(amountDec);

        // 4. Update Wallet Balance atomically
        const updatedWallet = await tx.shopkeeperWallet.update({
          where: { id: wallet.id },
          data: {
            balance: newBalance,
            totalCredits: { increment: amountDec },
          },
        });

        // 5. Append Immutable Ledger Entry
        const transaction = await tx.walletTransaction.create({
          data: {
            walletId: wallet.id,
            type: WalletTransactionType.CREDIT,
            amount: amountDec,
            previousBalance,
            newBalance,
            reference,
            idempotencyKey,
            adminId,
            notes: dto.notes?.trim() || 'Admin manual wallet credit',
          },
        });

        return {
          isDuplicate: false,
          wallet: {
            ...updatedWallet,
            balance: Number(updatedWallet.balance),
            minWalletLimit: Number(updatedWallet.minWalletLimit),
          },
          transaction: {
            ...transaction,
            amount: Number(transaction.amount),
            previousBalance: Number(transaction.previousBalance),
            newBalance: Number(transaction.newBalance),
          },
          message: `Successfully credited ₹${Number(amountDec).toFixed(2)} to wallet #${wallet.id}`,
        };
      },
      { timeout: 15000, maxWait: 10000 }
    );
  }

  /**
   * Admin Wallet Manual Adjustment / Debit
   */
  async adminDebit(shopkeeperId: number, adminId: number, dto: AdminDebitWalletDto) {
    if (dto.amount <= 0) {
      throw new AppError('Debit amount must be greater than zero.', 400);
    }

    const wallet = await this.getOrCreateWallet(shopkeeperId);
    const amountDec = new Prisma.Decimal(dto.amount);
    const reference =
      dto.reference?.trim() ||
      `ADM-DB-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;

    const idempotencyKey =
      dto.idempotencyKey?.trim() ||
      `ADM-DB-KEY-${shopkeeperId}-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

    return prisma.$transaction(
      async (tx) => {
        // 1. Idempotency Check
        if (dto.idempotencyKey) {
          const existingTx = await tx.walletTransaction.findUnique({
            where: { idempotencyKey: dto.idempotencyKey },
          });
          if (existingTx) {
            const currentWallet = await tx.shopkeeperWallet.findUnique({
              where: { id: wallet.id },
            });
            return {
              isDuplicate: true,
              wallet: currentWallet,
              transaction: existingTx,
              message: 'Transaction already processed (Idempotent replay)',
            };
          }
        }

        // 2. Strict Row-level locking on wallet row
        await tx.$executeRaw`SELECT id FROM "shopkeeper_wallets" WHERE id = ${wallet.id} FOR UPDATE;`;

        // 3. Re-read current balance under lock
        const lockedWallet = await tx.shopkeeperWallet.findUnique({
          where: { id: wallet.id },
        });

        if (!lockedWallet) {
          throw new AppError('Wallet record not found during transaction lock.', 404);
        }

        const previousBalance = lockedWallet.balance;
        const newBalance = previousBalance.sub(amountDec);

        // 4. Update Wallet Balance atomically
        const updatedWallet = await tx.shopkeeperWallet.update({
          where: { id: wallet.id },
          data: {
            balance: newBalance,
            totalDebits: { increment: amountDec },
          },
        });

        // 5. Append Immutable Ledger Entry
        const transaction = await tx.walletTransaction.create({
          data: {
            walletId: wallet.id,
            type: WalletTransactionType.ADJUSTMENT,
            amount: amountDec,
            previousBalance,
            newBalance,
            reference,
            idempotencyKey,
            adminId,
            notes: dto.notes?.trim() || 'Admin manual wallet debit adjustment',
          },
        });

        return {
          isDuplicate: false,
          wallet: {
            ...updatedWallet,
            balance: Number(updatedWallet.balance),
            minWalletLimit: Number(updatedWallet.minWalletLimit),
          },
          transaction: {
            ...transaction,
            amount: Number(transaction.amount),
            previousBalance: Number(transaction.previousBalance),
            newBalance: Number(transaction.newBalance),
          },
          message: `Successfully debited ₹${Number(amountDec).toFixed(2)} from wallet #${wallet.id}`,
        };
      },
      { timeout: 15000, maxWait: 10000 }
    );
  }

  /**
   * Set individual minimum wallet limit for a shopkeeper
   */
  async setWalletLimit(shopkeeperId: number, dto: SetWalletLimitDto) {
    const wallet = await this.getOrCreateWallet(shopkeeperId);

    const updated = await prisma.shopkeeperWallet.update({
      where: { id: wallet.id },
      data: {
        minWalletLimit: new Prisma.Decimal(dto.minWalletLimit),
      },
    });

    return {
      walletId: updated.id,
      shopkeeperId,
      minWalletLimit: Number(updated.minWalletLimit),
      balance: Number(updated.balance),
      isBreached: Number(updated.balance) < Number(updated.minWalletLimit),
      message: `Minimum wallet limit set to ₹${Number(updated.minWalletLimit).toFixed(2)}`,
    };
  }

  /**
   * Enable or disable QR payment ordering status for a shopkeeper
   */
  async updateQrStatus(shopkeeperId: number, dto: UpdateQrStatusDto) {
    const wallet = await this.getOrCreateWallet(shopkeeperId);

    const updated = await prisma.shopkeeperWallet.update({
      where: { id: wallet.id },
      data: {
        isQrEnabled: dto.isQrEnabled,
      },
    });

    return {
      walletId: updated.id,
      shopkeeperId,
      isQrEnabled: updated.isQrEnabled,
      message: `QR online payment ordering ${updated.isQrEnabled ? 'ENABLED' : 'DISABLED'} for shopkeeper #${shopkeeperId}`,
    };
  }

  /**
   * Get immutable transaction ledger with search and filters
   */
  async getTransactions(params: {
    walletId?: number;
    shopkeeperId?: number;
    type?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));
    const skip = (page - 1) * limit;

    const where: any = {};

    if (params.walletId) {
      where.walletId = params.walletId;
    }

    if (params.shopkeeperId) {
      where.wallet = { shopkeeperId: params.shopkeeperId };
    }

    if (params.type && params.type !== 'ALL') {
      where.type = params.type as WalletTransactionType;
    }

    if (params.startDate || params.endDate) {
      where.createdAt = {};
      if (params.startDate) where.createdAt.gte = new Date(params.startDate);
      if (params.endDate) where.createdAt.lte = new Date(params.endDate);
    }

    const [total, transactions] = await Promise.all([
      prisma.walletTransaction.count({ where }),
      prisma.walletTransaction.findMany({
        where,
        skip,
        take: limit,
        include: {
          wallet: {
            include: {
              shopkeeper: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  shop: { select: { id: true, name: true, slug: true } },
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      transactions: transactions.map((t) => ({
        id: t.id,
        walletId: t.walletId,
        shopkeeper: t.wallet.shopkeeper,
        type: t.type,
        amount: Number(t.amount),
        previousBalance: Number(t.previousBalance),
        newBalance: Number(t.newBalance),
        reference: t.reference,
        idempotencyKey: t.idempotencyKey,
        adminId: t.adminId,
        orderId: t.orderId,
        notes: t.notes,
        createdAt: t.createdAt,
      })),
    };
  }

  /**
   * Core QR Payment Validation Rule:
   * Called before every QR payment initiation / checkout
   */
  async checkQrPaymentAllowed(shopId: number) {
    // 1. Resolve active Shopkeeper for the Shop
    const shopkeeper = await prisma.shopkeeper.findFirst({
      where: { shopId, isActive: true },
      include: { wallet: true, shop: true },
      orderBy: { id: 'asc' }, // primary shopkeeper
    });

    if (!shopkeeper) {
      throw new AppError(
        'The restaurant does not have an active manager assigned. Online QR orders are paused.',
        400
      );
    }

    if (!shopkeeper.shop || !shopkeeper.shop.isActive) {
      throw new AppError('This restaurant outlet is currently inactive.', 404);
    }

    // 2. Ensure wallet exists
    let wallet = shopkeeper.wallet;
    if (!wallet) {
      wallet = await this.getOrCreateWallet(shopkeeper.id);
    }

    // 3. Check QR Enabled status
    if (!wallet.isQrEnabled) {
      throw new AppError(
        'Online QR ordering is currently disabled for this restaurant. Please order directly at the counter.',
        403
      );
    }

    // 4. Check Wallet Balance >= Individual Minimum Limit
    const currentBalance = Number(wallet.balance);
    const minLimit = Number(wallet.minWalletLimit);

    if (currentBalance < minLimit) {
      throw new AppError(
        `Online QR ordering is temporarily paused for this restaurant due to low wallet balance limit. (Current balance: ₹${currentBalance.toFixed(2)}, Required: ₹${minLimit.toFixed(2)}). Please order at the counter.`,
        402
      );
    }

    return {
      allowed: true,
      shopkeeper,
      wallet: {
        ...wallet,
        balance: currentBalance,
        minWalletLimit: minLimit,
      },
    };
  }

  /**
   * Safe status query to determine if public QR ordering should be open or closed
   */
  async getShopQrStatus(shopId: number): Promise<{ isQrActive: boolean; reason: string | null }> {
    try {
      const shopkeeper = await prisma.shopkeeper.findFirst({
        where: { shopId, isActive: true },
        include: { wallet: true, shop: true },
        orderBy: { id: 'asc' },
      });

      if (!shopkeeper || !shopkeeper.shop || !shopkeeper.shop.isActive) {
        return {
          isQrActive: false,
          reason: 'This restaurant outlet is currently inactive.',
        };
      }

      let wallet = shopkeeper.wallet;
      if (!wallet) {
        wallet = await this.getOrCreateWallet(shopkeeper.id);
      }

      if (!wallet.isQrEnabled) {
        return {
          isQrActive: false,
          reason: 'Online QR ordering is currently paused by administration.',
        };
      }

      const currentBalance = Number(wallet.balance);
      const minLimit = Number(wallet.minWalletLimit);
      if (currentBalance < minLimit) {
        return {
          isQrActive: false,
          reason: `Online QR ordering is temporarily paused due to minimum wallet balance limit. (Current: ₹${currentBalance.toFixed(2)}, Required: ₹${minLimit.toFixed(2)}).`,
        };
      }

      return {
        isQrActive: true,
        reason: null,
      };
    } catch (err: any) {
      return {
        isQrActive: false,
        reason: err.message || 'Unable to verify QR ordering status.',
      };
    }
  }

  /**
   * Atomic Platform Fee Debit on verified payment
   */
  async debitPlatformFeeForOrder(
    tx: Prisma.TransactionClient,
    orderId: number,
    shopId: number,
    orderTotal: number,
    orderCode: string
  ) {
    // 1. Check if fee was already debited for this order (Idempotency)
    const existingDebit = await tx.walletTransaction.findFirst({
      where: { orderId, type: WalletTransactionType.DEBIT },
    });
    if (existingDebit) {
      return existingDebit;
    }

    // 2. Resolve Gateway Fee Configuration
    const creds = await getActiveGatewayCredentials();
    let feeAmount = 0;
    if (creds.platformFeeType === 'PERCENT') {
      feeAmount = Math.round(((orderTotal * creds.platformFeeValue) / 100) * 100) / 100;
    } else {
      feeAmount = Number(creds.platformFeeValue);
    }

    if (feeAmount <= 0) {
      return null;
    }

    // 3. Resolve shopkeeper and wallet
    const shopkeeper = await tx.shopkeeper.findFirst({
      where: { shopId, isActive: true },
      include: { wallet: true },
      orderBy: { id: 'asc' },
    });

    if (!shopkeeper || !shopkeeper.wallet) {
      return null;
    }

    const walletId = shopkeeper.wallet.id;

    // 4. Row-level lock on wallet row
    await tx.$executeRaw`SELECT id FROM "shopkeeper_wallets" WHERE id = ${walletId} FOR UPDATE;`;

    const lockedWallet = await tx.shopkeeperWallet.findUnique({
      where: { id: walletId },
    });

    if (!lockedWallet) return null;

    const previousBalance = lockedWallet.balance;
    const feeDec = new Prisma.Decimal(feeAmount);
    const newBalance = previousBalance.sub(feeDec);

    // 5. Update wallet balance
    await tx.shopkeeperWallet.update({
      where: { id: walletId },
      data: {
        balance: newBalance,
        totalDebits: { increment: feeDec },
      },
    });

    // 6. Record immutable transaction
    const transaction = await tx.walletTransaction.create({
      data: {
        walletId,
        type: WalletTransactionType.DEBIT,
        amount: feeDec,
        previousBalance,
        newBalance,
        reference: `FEE-${orderCode}`,
        idempotencyKey: `DEBIT-ORD-${orderId}`,
        orderId,
        notes: `Platform service fee (${creds.platformFeeValue}${creds.platformFeeType === 'PERCENT' ? '%' : ' INR'}) for Order #${orderCode} (Total: ₹${orderTotal})`,
      },
    });

    return transaction;
  }

  /**
   * Shopkeeper: Create Razorpay Order to Recharge Wallet using Global Gateway
   */
  async createRechargeOrder(shopkeeperId: number, amount: number) {
    if (!amount || isNaN(amount) || amount < 10) {
      throw new AppError('Minimum recharge amount is ₹10.00', 400);
    }
    if (amount > 100000) {
      throw new AppError('Maximum recharge amount per transaction is ₹1,00,000.00', 400);
    }

    // Ensure wallet exists
    await this.getOrCreateWallet(shopkeeperId);

    // Load credentials strictly from server / Vercel environment variables
    const platformCreds = getPlatformEnvironmentCredentials();
    const platformRzpClient = getPlatformRazorpayClient();
    const amountInPaise = Math.round(amount * 100);
    const receipt = `RCH_${shopkeeperId}_${Date.now()}`;

    try {
      const rzpOrder = await platformRzpClient.orders.create({
        amount: amountInPaise,
        currency: 'INR',
        receipt,
        notes: {
          type: 'WALLET_RECHARGE',
          shopkeeperId: String(shopkeeperId),
        },
      });

      return {
        orderId: rzpOrder.id,
        amount,
        amountInPaise,
        currency: 'INR',
        keyId: platformCreds.keyId,
      };
    } catch (err: any) {
      console.warn('Razorpay wallet recharge order creation error:', err?.message || err);
      if (env.NODE_ENV !== 'production') {
        return {
          orderId: `rzp_mock_rch_${Date.now()}`,
          amount,
          amountInPaise,
          currency: 'INR',
          keyId: platformCreds.keyId,
        };
      }
      throw new AppError('Failed to initiate wallet recharge with payment gateway.', 502);
    }
  }

  /**
   * Shopkeeper: Verify Razorpay Payment and Credit Wallet
   */
  async verifyAndCreditRecharge(
    shopkeeperId: number,
    params: {
      razorpay_order_id: string;
      razorpay_payment_id: string;
      razorpay_signature: string;
      amount: number;
    }
  ) {
    const razorpay_order_id = params.razorpay_order_id || (params as any).razorpayOrderId;
    const razorpay_payment_id = params.razorpay_payment_id || (params as any).razorpayPaymentId;
    const razorpay_signature = params.razorpay_signature || (params as any).razorpaySignature;
    const amount = Number(params.amount);

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !amount || amount <= 0) {
      throw new AppError('Incomplete payment verification payload.', 400);
    }

    // Verify signature strictly against server / Vercel platform environment secret
    const isValid = verifyPlatformRechargeSignature(
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    );

    if (!isValid) {
      throw new AppError('Payment signature verification failed.', 400);
    }

    const existingWallet = await this.getOrCreateWallet(shopkeeperId);
    const walletId = existingWallet.id;
    const idempotencyKey = `RCH_${razorpay_payment_id}`;

    // Atomic transaction with row locking
    const result = await prisma.$transaction(async (tx) => {
      // Check for duplicate payment replay
      const duplicate = await tx.walletTransaction.findUnique({
        where: { idempotencyKey },
      });
      if (duplicate) {
        const currentWallet = await tx.shopkeeperWallet.findUnique({ where: { id: walletId } });
        return {
          wallet: currentWallet,
          transaction: duplicate,
          alreadyCredited: true,
        };
      }

      await tx.$executeRaw`SELECT id FROM "shopkeeper_wallets" WHERE id = ${walletId} FOR UPDATE;`;

      const lockedWallet = await tx.shopkeeperWallet.findUnique({
        where: { id: walletId },
      });

      if (!lockedWallet) {
        throw new AppError('Shopkeeper wallet record not found.', 404);
      }

      const previousBalance = lockedWallet.balance;
      const creditDecimal = new Prisma.Decimal(amount);
      const newBalance = previousBalance.add(creditDecimal);

      const updatedWallet = await tx.shopkeeperWallet.update({
        where: { id: walletId },
        data: {
          balance: newBalance,
          totalCredits: { increment: creditDecimal },
        },
      });

      const transaction = await tx.walletTransaction.create({
        data: {
          walletId,
          type: WalletTransactionType.CREDIT,
          amount: creditDecimal,
          previousBalance,
          newBalance,
          reference: razorpay_payment_id,
          idempotencyKey,
          notes: `Online Wallet Recharge via Razorpay (${razorpay_payment_id})`,
          metadata: {
            razorpayOrderId: razorpay_order_id,
            razorpayPaymentId: razorpay_payment_id,
          },
        },
      });

      return {
        wallet: updatedWallet,
        transaction,
        alreadyCredited: false,
      };
    });

    return result;
  }
}

export const walletService = new WalletService();
