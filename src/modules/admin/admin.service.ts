import { prisma } from '../../config/database';
import { hashPassword } from '../../utils/password';
import { AppError } from '../../middleware/error.middleware';
import {
  CreateShopDto,
  UpdateShopDto,
  CreateShopkeeperDto,
  UpdateShopkeeperDto,
} from './admin.dto';
import { env } from '../../config/env';
import { OrderStatus, PaymentStatus, Prisma } from '@prisma/client';
import { encryptSecret, decryptSecret, maskSecret } from '../../utils/encryption';
import { invalidateGatewayCache } from '../../config/razorpay';
import Razorpay from 'razorpay';

export class AdminService {
  /**
   * Create a new shop and generate its QR ordering URL
   */
  async createShop(dto: CreateShopDto) {
    const slug = dto.slug.toLowerCase().trim();
    const subdomain = dto.subdomain.toLowerCase().trim();

    // Check slug and subdomain uniqueness
    const existing = await prisma.shop.findFirst({
      where: {
        OR: [{ slug }, { subdomain }],
      },
    });

    if (existing) {
      throw new AppError('A shop with this slug or subdomain already exists.', 409);
    }

    // Generate shop QR ordering URL
    const baseUrl = env.FRONTEND_URL.includes('localhost')
      ? `http://${subdomain}.localhost:3000`
      : `https://${subdomain}.scanpayeat.com`;
    const qrUrl = baseUrl;

    return prisma.shop.create({
      data: {
        name: dto.name,
        slug,
        subdomain,
        address: dto.address,
        phone: dto.phone,
        qrUrl,
      },
    });
  }

  /**
   * List shops with filtering and summary metrics
   */
  async getShops(params: { search?: string; isActive?: boolean; page?: number; limit?: number }) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));
    const skip = (page - 1) * limit;

    const where: any = {};
    if (params.search) {
      where.OR = [
        { name: { contains: params.search, mode: 'insensitive' } },
        { slug: { contains: params.search, mode: 'insensitive' } },
      ];
    }
    if (params.isActive !== undefined) {
      where.isActive = params.isActive;
    }

    const [total, shops] = await Promise.all([
      prisma.shop.count({ where }),
      prisma.shop.findMany({
        where,
        skip,
        take: limit,
        include: {
          _count: {
            select: {
              products: true,
              orders: true,
              shopkeepers: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return { total, page, limit, totalPages: Math.ceil(total / limit), shops };
  }

  async getShopById(id: number) {
    const shop = await prisma.shop.findUnique({
      where: { id },
      include: {
        shopkeepers: {
          select: { id: true, name: true, email: true, mobile: true, isActive: true },
        },
        _count: {
          select: { products: true, orders: true, categories: true },
        },
      },
    });
    if (!shop) throw new AppError('Shop not found.', 404);
    return shop;
  }

  async updateShop(id: number, dto: UpdateShopDto) {
    const shop = await prisma.shop.findUnique({ where: { id } });
    if (!shop) throw new AppError('Shop not found.', 404);

    if (dto.slug && dto.slug !== shop.slug) {
      const existing = await prisma.shop.findFirst({
        where: { slug: dto.slug.toLowerCase(), id: { not: id } },
      });
      if (existing) throw new AppError('Slug is already in use.', 409);
    }

    let qrUrl = shop.qrUrl;
    if (dto.subdomain && dto.subdomain !== shop.subdomain) {
      const existingSub = await prisma.shop.findFirst({
        where: { subdomain: dto.subdomain.toLowerCase(), id: { not: id } },
      });
      if (existingSub) throw new AppError('Subdomain is already in use.', 409);

      const baseUrl = env.FRONTEND_URL.includes('localhost')
        ? `http://${dto.subdomain.toLowerCase()}.localhost:3000`
        : `https://${dto.subdomain.toLowerCase()}.scanpayeat.com`;
      qrUrl = baseUrl;
    }

    return prisma.shop.update({
      where: { id },
      data: {
        ...dto,
        ...(dto.slug ? { slug: dto.slug.toLowerCase() } : {}),
        ...(dto.subdomain ? { subdomain: dto.subdomain.toLowerCase(), qrUrl } : {}),
      },
    });
  }

  async updateShopStatus(id: number, isActive: boolean) {
    const shop = await prisma.shop.findUnique({ where: { id } });
    if (!shop) throw new AppError('Shop not found.', 404);

    return prisma.shop.update({
      where: { id },
      data: { isActive },
    });
  }

  async deleteShop(id: number) {
    const shop = await prisma.shop.findUnique({ where: { id } });
    if (!shop) throw new AppError('Shop not found.', 404);

    await prisma.$transaction(async (tx) => {
      // 1. Delete webhook events & payments
      await tx.payment.deleteMany({ where: { shopId: id } });

      // 2. Orders and dependent items / status history
      const shopOrders = await tx.order.findMany({
        where: { shopId: id },
        select: { id: true },
      });
      const orderIds = shopOrders.map((o) => o.id);
      if (orderIds.length > 0) {
        await tx.orderStatusHistory.deleteMany({ where: { orderId: { in: orderIds } } });
        await tx.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
        await tx.order.deleteMany({ where: { shopId: id } });
      }

      // 3. Products
      await tx.product.deleteMany({ where: { shopId: id } });

      // 4. Categories
      await tx.category.deleteMany({ where: { shopId: id } });

      // 5. Token counters
      await tx.tokenCounter.deleteMany({ where: { shopId: id } });

      // 6. Shopkeepers
      await tx.shopkeeper.deleteMany({ where: { shopId: id } });

      // 7. Finally delete the shop
      await tx.shop.delete({ where: { id } });
    });

    return { message: 'Shop and all associated records deleted successfully.' };
  }

  /**
   * Create a shopkeeper assigned to a shop
   */
  async createShopkeeper(dto: CreateShopkeeperDto) {
    const shop = await prisma.shop.findUnique({ where: { id: dto.shopId } });
    if (!shop) {
      throw new AppError('Shop not found. Please assign to an existing shop.', 404);
    }

    const existingEmail = await prisma.shopkeeper.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    if (existingEmail) {
      throw new AppError('A shopkeeper with this email already exists.', 409);
    }

    const passwordHash = await hashPassword(dto.password);

    const shopkeeper = await prisma.shopkeeper.create({
      data: {
        name: dto.name,
        email: dto.email.toLowerCase(),
        mobile: dto.mobile,
        shopId: dto.shopId,
        passwordHash,
        wallet: {
          create: {
            balance: 0,
            minWalletLimit: 0,
            isQrEnabled: true,
          },
        },
      },
      select: {
        id: true,
        shopId: true,
        name: true,
        email: true,
        mobile: true,
        isActive: true,
        createdAt: true,
        shop: {
          select: { id: true, name: true, slug: true, subdomain: true },
        },
        wallet: {
          select: {
            id: true,
            balance: true,
            minWalletLimit: true,
            isQrEnabled: true,
            totalCredits: true,
            totalDebits: true,
          },
        },
      },
    });

    return {
      ...shopkeeper,
      wallet: shopkeeper.wallet
        ? {
            ...shopkeeper.wallet,
            balance: Number(shopkeeper.wallet.balance),
            minWalletLimit: Number(shopkeeper.wallet.minWalletLimit),
            totalCredits: Number(shopkeeper.wallet.totalCredits),
            totalDebits: Number(shopkeeper.wallet.totalDebits),
            isBreached:
              Number(shopkeeper.wallet.balance) < Number(shopkeeper.wallet.minWalletLimit),
          }
        : null,
    };
  }

  async getShopkeepers(params: { shopId?: number; page?: number; limit?: number }) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));
    const skip = (page - 1) * limit;

    const where: any = {};
    if (params.shopId) {
      where.shopId = params.shopId;
    }

    const [total, shopkeepers] = await Promise.all([
      prisma.shopkeeper.count({ where }),
      prisma.shopkeeper.findMany({
        where,
        skip,
        take: limit,
        select: {
          id: true,
          shopId: true,
          name: true,
          email: true,
          mobile: true,
          isActive: true,
          createdAt: true,
          shop: {
            select: {
              id: true,
              name: true,
              slug: true,
              subdomain: true,
              razorpayKeyId: true,
              isCustomGatewayEnabled: true,
              gstEnabled: true,
              cgstRate: true,
              sgstRate: true,
              gstNumber: true,
              razorpayKeySecret: true,
            },
          },
          wallet: {
            select: {
              id: true,
              balance: true,
              minWalletLimit: true,
              isQrEnabled: true,
              totalCredits: true,
              totalDebits: true,
              updatedAt: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const formatted = shopkeepers.map((sk) => ({
      ...sk,
      shop: sk.shop
        ? {
            id: sk.shop.id,
            name: sk.shop.name,
            slug: sk.shop.slug,
            subdomain: sk.shop.subdomain,
            razorpayKeyId: sk.shop.razorpayKeyId,
            isCustomGatewayEnabled: sk.shop.isCustomGatewayEnabled,
            gstEnabled: sk.shop.gstEnabled,
            cgstRate: Number(sk.shop.cgstRate ?? 2.5),
            sgstRate: Number(sk.shop.sgstRate ?? 2.5),
            gstNumber: sk.shop.gstNumber,
            hasKeySecret: Boolean(sk.shop.razorpayKeySecret),
          }
        : null,
      wallet: sk.wallet
        ? {
            ...sk.wallet,
            balance: Number(sk.wallet.balance),
            minWalletLimit: Number(sk.wallet.minWalletLimit),
            totalCredits: Number(sk.wallet.totalCredits),
            totalDebits: Number(sk.wallet.totalDebits),
            isBreached:
              Number(sk.wallet.balance) < Number(sk.wallet.minWalletLimit),
          }
        : null,
    }));

    return { total, page, limit, totalPages: Math.ceil(total / limit), shopkeepers: formatted };
  }

  async updateShopkeeper(id: number, dto: UpdateShopkeeperDto) {
    const shopkeeper = await prisma.shopkeeper.findUnique({ where: { id } });
    if (!shopkeeper) throw new AppError('Shopkeeper not found.', 404);

    let passwordHash: string | undefined;
    if (dto.password) {
      passwordHash = await hashPassword(dto.password);
    }

    return prisma.shopkeeper.update({
      where: { id },
      data: {
        ...(dto.name ? { name: dto.name } : {}),
        ...(dto.email ? { email: dto.email.toLowerCase() } : {}),
        ...(dto.mobile !== undefined ? { mobile: dto.mobile } : {}),
        ...(dto.shopId ? { shopId: dto.shopId } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(passwordHash ? { passwordHash } : {}),
      },
      select: {
        id: true,
        shopId: true,
        name: true,
        email: true,
        mobile: true,
        isActive: true,
        updatedAt: true,
        shop: {
          select: { id: true, name: true, slug: true },
        },
      },
    });
  }

  async updateShopkeeperStatus(id: number, isActive: boolean) {
    const shopkeeper = await prisma.shopkeeper.findUnique({ where: { id } });
    if (!shopkeeper) throw new AppError('Shopkeeper not found.', 404);

    return prisma.shopkeeper.update({
      where: { id },
      data: { isActive },
      select: { id: true, name: true, email: true, isActive: true },
    });
  }

  async deleteShopkeeper(id: number) {
    const shopkeeper = await prisma.shopkeeper.findUnique({ where: { id } });
    if (!shopkeeper) throw new AppError('Shopkeeper not found.', 404);

    await prisma.shopkeeper.delete({ where: { id } });
    return { message: 'Shopkeeper deleted successfully.' };
  }

  /**
   * Admin Dashboard Analytics: Multi-period sales & Per-shop revenue tracking
   */
  async getDashboardStats() {
    const now = new Date();
    // Restaurant POS Business Day: Shifts running past midnight roll over at 4:00 AM
    const isEarlyMorning = now.getHours() < 4;
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      isEarlyMorning ? now.getDate() - 1 : now.getDate(),
      4,
      0,
      0,
      0
    );
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [globalStatsRows, entityCountsRows, allShops, shopOrderAggregates] = await Promise.all([
      prisma.$queryRaw<any[]>`
        SELECT
          COUNT(*) FILTER (WHERE "orderStatus" != 'CANCELLED')::int as total_orders,
          COUNT(*) FILTER (WHERE "paymentStatus" = 'PAID' AND "orderStatus" != 'CANCELLED')::int as paid_orders,
          COUNT(*) FILTER (WHERE "paymentStatus" = 'PENDING' AND "orderStatus" != 'CANCELLED')::int as pending_orders,
          COALESCE(SUM("totalAmount") FILTER (WHERE "paymentStatus" = 'PAID' AND "orderStatus" != 'CANCELLED'), 0)::float as total_revenue,
          COUNT(*) FILTER (WHERE "createdAt" >= ${startOfToday} AND "paymentStatus" = 'PAID' AND "orderStatus" != 'CANCELLED')::int as today_orders,
          COALESCE(SUM("totalAmount") FILTER (WHERE "createdAt" >= ${startOfToday} AND "paymentStatus" = 'PAID' AND "orderStatus" != 'CANCELLED'), 0)::float as today_revenue,
          COUNT(*) FILTER (WHERE "createdAt" >= ${sevenDaysAgo} AND "paymentStatus" = 'PAID' AND "orderStatus" != 'CANCELLED')::int as week_orders,
          COALESCE(SUM("totalAmount") FILTER (WHERE "createdAt" >= ${sevenDaysAgo} AND "paymentStatus" = 'PAID' AND "orderStatus" != 'CANCELLED'), 0)::float as week_revenue,
          COUNT(*) FILTER (WHERE "createdAt" >= ${startOfMonth} AND "paymentStatus" = 'PAID' AND "orderStatus" != 'CANCELLED')::int as month_orders,
          COALESCE(SUM("totalAmount") FILTER (WHERE "createdAt" >= ${startOfMonth} AND "paymentStatus" = 'PAID' AND "orderStatus" != 'CANCELLED'), 0)::float as month_revenue
        FROM "orders";
      `,
      prisma.$queryRaw<any[]>`
        SELECT
          (SELECT COUNT(*)::int FROM "shops") as total_shops,
          (SELECT COUNT(*)::int FROM "shops" WHERE "isActive" = true) as active_shops,
          (SELECT COUNT(*)::int FROM "shopkeepers") as total_shopkeepers,
          (SELECT COUNT(*)::int FROM "customers") as total_customers;
      `,
      prisma.shop.findMany({
        select: {
          id: true,
          name: true,
          slug: true,
          subdomain: true,
          isActive: true,
          createdAt: true,
          shopkeepers: {
            select: { id: true, name: true, email: true, mobile: true, isActive: true },
          },
          _count: {
            select: { products: true, orders: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.$queryRaw<any[]>`
        SELECT
          "shopId",
          COUNT(*) FILTER (WHERE "paymentStatus" = 'PAID' AND "orderStatus" != 'CANCELLED')::int as paid_orders,
          COALESCE(SUM("totalAmount") FILTER (WHERE "paymentStatus" = 'PAID' AND "orderStatus" != 'CANCELLED'), 0)::float as total_revenue,
          COUNT(*) FILTER (WHERE "createdAt" >= ${startOfToday} AND "paymentStatus" = 'PAID' AND "orderStatus" != 'CANCELLED')::int as today_orders,
          COALESCE(SUM("totalAmount") FILTER (WHERE "createdAt" >= ${startOfToday} AND "paymentStatus" = 'PAID' AND "orderStatus" != 'CANCELLED'), 0)::float as today_revenue,
          COUNT(*) FILTER (WHERE "createdAt" >= ${sevenDaysAgo} AND "paymentStatus" = 'PAID' AND "orderStatus" != 'CANCELLED')::int as week_orders,
          COALESCE(SUM("totalAmount") FILTER (WHERE "createdAt" >= ${sevenDaysAgo} AND "paymentStatus" = 'PAID' AND "orderStatus" != 'CANCELLED'), 0)::float as week_revenue,
          COUNT(*) FILTER (WHERE "createdAt" >= ${startOfMonth} AND "paymentStatus" = 'PAID' AND "orderStatus" != 'CANCELLED')::int as month_orders,
          COALESCE(SUM("totalAmount") FILTER (WHERE "createdAt" >= ${startOfMonth} AND "paymentStatus" = 'PAID' AND "orderStatus" != 'CANCELLED'), 0)::float as month_revenue
        FROM "orders"
        GROUP BY "shopId";
      `,
    ]);

    const gRow = globalStatsRows?.[0] || {};
    const eRow = entityCountsRows?.[0] || {};

    const shopAggMap = new Map(
      (shopOrderAggregates || []).map((row: any) => [row.shopId, row])
    );

    const shopSales = allShops.map((s) => {
      const agg = shopAggMap.get(s.id) || {};
      return {
        shopId: s.id,
        shopName: s.name,
        slug: s.slug,
        subdomain: s.subdomain,
        isActive: s.isActive,
        shopkeepers: s.shopkeepers,
        productsCount: s._count.products,
        totalOrders: s._count.orders,
        paidOrders: Number(agg.paid_orders || 0),
        totalRevenue: Number(agg.total_revenue || 0),
        todaySales: Number(agg.today_revenue || 0),
        todayOrders: Number(agg.today_orders || 0),
        weekSales: Number(agg.week_revenue || 0),
        weekOrders: Number(agg.week_orders || 0),
        monthSales: Number(agg.month_revenue || 0),
        monthOrders: Number(agg.month_orders || 0),
      };
    });

    const totalRevenue = Number(gRow.total_revenue || 0);
    const todaySales = Number(gRow.today_revenue || 0);
    const weekSales = Number(gRow.week_revenue || 0);
    const monthSales = Number(gRow.month_revenue || 0);

    return {
      totalShops: Number(eRow.total_shops || 0),
      activeShops: Number(eRow.active_shops || 0),
      totalShopkeepers: Number(eRow.total_shopkeepers || 0),
      totalCustomers: Number(eRow.total_customers || 0),
      totalOrders: Number(gRow.total_orders || 0),
      paidOrders: Number(gRow.paid_orders || 0),
      pendingOrders: Number(gRow.pending_orders || 0),
      totalRevenue,
      revenue: totalRevenue,
      todaySales,
      todayRevenue: todaySales,
      todayOrders: Number(gRow.today_orders || 0),
      weekSales,
      weekRevenue: weekSales,
      weekOrders: Number(gRow.week_orders || 0),
      monthSales,
      monthRevenue: monthSales,
      monthOrders: Number(gRow.month_orders || 0),
      shopSales,
    };
  }

  /**
   * Admin Order listing across all shops with filters
   */
  async getAdminOrders(params: {
    shopId?: number;
    status?: OrderStatus;
    paymentStatus?: PaymentStatus;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));
    const skip = (page - 1) * limit;

    const where: any = {};
    if (params.shopId) where.shopId = params.shopId;
    if (params.status) where.orderStatus = params.status;
    if (params.paymentStatus) where.paymentStatus = params.paymentStatus;

    const [total, orders] = await Promise.all([
      prisma.order.count({ where }),
      prisma.order.findMany({
        where,
        skip,
        take: limit,
        include: {
          shop: { select: { id: true, name: true, slug: true } },
          customer: { select: { id: true, name: true, email: true, mobile: true } },
          items: true,
          payments: { select: { id: true, status: true, amount: true, razorpayPaymentId: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return { total, page, limit, totalPages: Math.ceil(total / limit), orders };
  }

  /**
   * Admin Payment Transactions
   */
  async getAdminTransactions(params: {
    shopId?: number;
    status?: PaymentStatus;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));
    const skip = (page - 1) * limit;

    const where: any = {};
    if (params.shopId) where.shopId = params.shopId;
    if (params.status) where.status = params.status;

    const [total, transactions] = await Promise.all([
      prisma.payment.count({ where }),
      prisma.payment.findMany({
        where,
        skip,
        take: limit,
        include: {
          shop: { select: { id: true, name: true, slug: true } },
          order: { select: { id: true, orderCode: true, totalAmount: true, orderStatus: true } },
          customer: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return { total, page, limit, totalPages: Math.ceil(total / limit), transactions };
  }

  /**
   * Admin: List all coupons across the platform
   */
  async getCoupons(params?: { shopId?: number; search?: string }) {
    const where: any = {};
    if (params?.shopId) where.shopId = params.shopId;
    if (params?.search) {
      where.code = { contains: params.search.toUpperCase() };
    }
    const coupons = await prisma.coupon.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    const shopIds = Array.from(
      new Set(coupons.map((c) => c.shopId).filter((id): id is number => id !== null))
    );
    const shops =
      shopIds.length > 0
        ? await prisma.shop.findMany({
            where: { id: { in: shopIds } },
            select: { id: true, name: true, slug: true },
          })
        : [];
    const shopMap = new Map(shops.map((s) => [s.id, s]));

    return coupons.map((c) => ({
      ...c,
      isGlobal: c.shopId === null,
      shop: c.shopId ? shopMap.get(c.shopId) || null : null,
    }));
  }

  /**
   * Admin: Create a new coupon (global if shopId is null/omitted, or store-specific)
   */
  async createCoupon(data: {
    code: string;
    discountType?: string;
    discountValue: number;
    minOrderAmount?: number;
    maxDiscount?: number;
    shopId?: number | null;
    isActive?: boolean;
  }) {
    const code = data.code.trim().toUpperCase();
    const existing = await prisma.coupon.findUnique({ where: { code } });
    if (existing) {
      throw new AppError(`Coupon code ${code} already exists`, 400);
    }
    return prisma.coupon.create({
      data: {
        code,
        discountType: data.discountType || 'FIXED',
        discountValue: data.discountValue,
        minOrderAmount: data.minOrderAmount ?? 0,
        maxDiscount: data.maxDiscount ?? null,
        shopId: data.shopId ? Number(data.shopId) : null,
        isActive: data.isActive ?? true,
      },
    });
  }

  /**
   * Admin: Delete coupon
   */
  async deleteCoupon(id: number) {
    const coupon = await prisma.coupon.findUnique({ where: { id } });
    if (!coupon) throw new AppError('Coupon not found', 404);
    await prisma.coupon.delete({ where: { id } });
    return { success: true };
  }

  /**
   * Admin: Toggle coupon active status
   */
  async toggleCouponStatus(id: number, isActive: boolean) {
    const coupon = await prisma.coupon.findUnique({ where: { id } });
    if (!coupon) throw new AppError('Coupon not found', 404);
    return prisma.coupon.update({
      where: { id },
      data: { isActive },
    });
  }

  /**
   * Admin: Get Shopkeeper's Razorpay Gateway & GST settings
   */
  async getShopkeeperGatewayGst(id: number) {
    const shopkeeper = await prisma.shopkeeper.findUnique({
      where: { id },
      include: { shop: true },
    });
    if (!shopkeeper || !shopkeeper.shop) {
      throw new AppError('Shopkeeper or associated shop not found.', 404);
    }
    const shop = shopkeeper.shop;
    return {
      shopkeeperId: shopkeeper.id,
      shopkeeperName: shopkeeper.name,
      shopId: shop.id,
      shopName: shop.name,
      isCustomGatewayEnabled: shop.isCustomGatewayEnabled,
      razorpayKeyId: shop.razorpayKeyId,
      hasKeySecret: Boolean(shop.razorpayKeySecret),
      keySecretMasked: shop.razorpayKeySecret
        ? maskSecret(decryptSecret(shop.razorpayKeySecret))
        : null,
      gstEnabled: shop.gstEnabled,
      gstNumber: shop.gstNumber,
      cgstRate: Number(shop.cgstRate ?? 2.5),
      sgstRate: Number(shop.sgstRate ?? 2.5),
    };
  }

  /**
   * Admin: Update Shopkeeper's Razorpay Gateway & GST settings
   */
  async updateShopkeeperGatewayGst(
    id: number,
    data: {
      isCustomGatewayEnabled?: boolean;
      razorpayKeyId?: string | null;
      razorpayKeySecret?: string | null;
      gstEnabled?: boolean;
      gstNumber?: string | null;
      cgstRate?: number;
      sgstRate?: number;
    }
  ) {
    const shopkeeper = await prisma.shopkeeper.findUnique({
      where: { id },
      include: { shop: true },
    });
    if (!shopkeeper || !shopkeeper.shop) {
      throw new AppError('Shopkeeper or associated shop not found.', 404);
    }

    const updateData: any = {};
    if (data.isCustomGatewayEnabled !== undefined) {
      updateData.isCustomGatewayEnabled = data.isCustomGatewayEnabled;
    }
    if (data.razorpayKeyId !== undefined) {
      updateData.razorpayKeyId = data.razorpayKeyId ? data.razorpayKeyId.trim() : null;
    }
    if (data.razorpayKeySecret !== undefined) {
      if (data.razorpayKeySecret && data.razorpayKeySecret.trim()) {
        const trimmedSecret = data.razorpayKeySecret.trim();
        updateData.razorpayKeySecret = encryptSecret(trimmedSecret);
      } else if (data.razorpayKeySecret === null || data.razorpayKeySecret === '') {
        // If explicitly cleared
        updateData.razorpayKeySecret = null;
      }
    }
    if (data.gstEnabled !== undefined) {
      updateData.gstEnabled = data.gstEnabled;
    }
    if (data.gstNumber !== undefined) {
      updateData.gstNumber = data.gstNumber ? data.gstNumber.trim().toUpperCase() : null;
    }
    if (data.cgstRate !== undefined) {
      updateData.cgstRate = new Prisma.Decimal(Math.max(0, Number(data.cgstRate)));
    }
    if (data.sgstRate !== undefined) {
      updateData.sgstRate = new Prisma.Decimal(Math.max(0, Number(data.sgstRate)));
    }

    const updatedShop = await prisma.shop.update({
      where: { id: shopkeeper.shop.id },
      data: updateData,
    });

    invalidateGatewayCache();

    return {
      shopkeeperId: shopkeeper.id,
      shopkeeperName: shopkeeper.name,
      shopId: updatedShop.id,
      shopName: updatedShop.name,
      isCustomGatewayEnabled: updatedShop.isCustomGatewayEnabled,
      razorpayKeyId: updatedShop.razorpayKeyId,
      hasKeySecret: Boolean(updatedShop.razorpayKeySecret),
      keySecretMasked: updatedShop.razorpayKeySecret
        ? maskSecret(decryptSecret(updatedShop.razorpayKeySecret))
        : null,
      gstEnabled: updatedShop.gstEnabled,
      gstNumber: updatedShop.gstNumber,
      cgstRate: Number(updatedShop.cgstRate ?? 2.5),
      sgstRate: Number(updatedShop.sgstRate ?? 2.5),
    };
  }

  /**
   * Admin: Test Razorpay credentials for a shopkeeper
   */
  async testShopkeeperGateway(
    id: number,
    data?: { keyId?: string; keySecret?: string }
  ) {
    const shopkeeper = await prisma.shopkeeper.findUnique({
      where: { id },
      include: { shop: true },
    });
    if (!shopkeeper || !shopkeeper.shop) {
      throw new AppError('Shopkeeper or associated shop not found.', 404);
    }

    let keyId = data?.keyId?.trim();
    let keySecret = data?.keySecret?.trim();

    if (!keyId || !keySecret) {
      keyId = shopkeeper.shop.razorpayKeyId || '';
      keySecret = shopkeeper.shop.razorpayKeySecret
        ? decryptSecret(shopkeeper.shop.razorpayKeySecret)
        : '';
    }

    if (!keyId || !keySecret) {
      throw new AppError('Both Key ID and Key Secret are required to test connection.', 400);
    }

    try {
      const client = new Razorpay({ key_id: keyId, key_secret: keySecret });
      await client.orders.all({ count: 1 });
      return { success: true, message: 'Razorpay API credentials verified successfully!' };
    } catch (err: any) {
      return {
        success: false,
        message: err?.error?.description || err?.message || 'Connection test failed. Check key credentials.',
      };
    }
  }
}

export const adminService = new AdminService();
