import { prisma } from '../../config/database';
import { razorpayClient } from '../../config/razorpay';
import { env } from '../../config/env';
import { AppError } from '../../middleware/error.middleware';
import { CheckoutDto, UpdateOrderStatusDto } from './order.dto';
import { emitOrderStatusUpdate } from '../../socket/socket.server';
import { OrderStatus, PaymentStatus, Prisma, UserRole } from '@prisma/client';

export class OrderService {
  /**
   * Checkout Flow:
   * 1. Re-read all products from DB (never trust frontend prices)
   * 2. Verify all products belong to the specified shop and are available
   * 3. Calculate subtotal & total
   * 4. Create pending order & order_item snapshots
   * 5. Create Razorpay order & pending Payment record
   */
  async checkout(dto: CheckoutDto, customer?: { id: number; email: string; name?: string }) {
    // 1. Resolve Shop
    const shop = await prisma.shop.findFirst({
      where: {
        ...(dto.shopId ? { id: dto.shopId } : {}),
        ...(dto.shopSlug
          ? {
              OR: [
                { slug: dto.shopSlug.toLowerCase() },
                { subdomain: dto.shopSlug.toLowerCase() },
              ],
            }
          : {}),
      },
    });

    if (!shop || !shop.isActive) {
      throw new AppError('The requested shop is not available for orders.', 404);
    }

    // 2. Fetch and Validate Products strictly from DB
    const requestedProductIds = dto.items.map((i) => i.productId);
    const dbProducts = await prisma.product.findMany({
      where: {
        id: { in: requestedProductIds },
        shopId: shop.id,
      },
    });

    if (dbProducts.length !== requestedProductIds.length) {
      throw new AppError(
        'One or more selected products are invalid or do not belong to this shop.',
        400
      );
    }

    // Check availability
    const unavailableProducts = dbProducts.filter((p) => !p.isAvailable);
    if (unavailableProducts.length > 0) {
      const names = unavailableProducts.map((p) => p.name).join(', ');
      throw new AppError(
        `The following items are currently sold out: ${names}. Please update your order.`,
        400
      );
    }

    // 3. Calculate Totals and prepare item snapshots
    const productMap = new Map(dbProducts.map((p) => [p.id, p]));
    let subtotal = new Prisma.Decimal(0);

    const snapshotItems = dto.items.map((item) => {
      const prod = productMap.get(item.productId)!;
      const unitPrice = new Prisma.Decimal(prod.price);
      const lineTotal = unitPrice.mul(item.quantity);
      subtotal = subtotal.add(lineTotal);

      return {
        productId: prod.id,
        productName: prod.name,
        unitPrice,
        quantity: item.quantity,
        lineTotal,
      };
    });

    const tax = new Prisma.Decimal(0); // Configurable tax if needed
    const totalAmount = subtotal.add(tax);

    // 4. Generate unique orderCode
    const orderCode = `ORD${Date.now()}${Math.floor(100 + Math.random() * 900)}`;

    // 5. Create Razorpay order
    let razorpayOrderId = `rzp_mock_${Date.now()}`;
    const amountInPaise = Math.round(Number(totalAmount) * 100);

    try {
      const rzpOrder = await razorpayClient.orders.create({
        amount: amountInPaise,
        currency: 'INR',
        receipt: orderCode,
        notes: {
          shopId: String(shop.id),
          shopName: shop.name,
          orderCode,
        },
      });
      if (rzpOrder && rzpOrder.id) {
        razorpayOrderId = rzpOrder.id;
      }
    } catch (rzpErr: any) {
      console.warn('⚠️ Razorpay order creation warning:', rzpErr.message || rzpErr);
      // In dev/test if razorpay fails or has placeholder keys, continue with fallback mock order ID
      if (env.NODE_ENV === 'production') {
        throw new AppError('Payment gateway communication failed. Please try again.', 502);
      }
    }

    // 6. Atomically persist Order, OrderItems, and initial Payment record
    const { order, payment } = await prisma.$transaction(async (tx) => {
      const createdOrder = await tx.order.create({
        data: {
          orderCode,
          shopId: shop.id,
          customerId: customer?.id ?? null,
          customerName: dto.customerName ?? customer?.name ?? 'Guest Customer',
          customerPhone: dto.customerPhone ?? null,
          orderStatus: OrderStatus.PENDING,
          paymentStatus: PaymentStatus.PENDING,
          subtotal,
          tax,
          totalAmount,
          notes: dto.notes ?? null,
          items: {
            create: snapshotItems,
          },
        },
        include: {
          items: true,
        },
      });

      const createdPayment = await tx.payment.create({
        data: {
          orderId: createdOrder.id,
          shopId: shop.id,
          customerId: customer?.id ?? null,
          amount: totalAmount,
          currency: 'INR',
          provider: 'RAZORPAY',
          razorpayOrderId,
          status: PaymentStatus.PENDING,
        },
      });

      return { order: createdOrder, payment: createdPayment };
    }, { timeout: 15000, maxWait: 10000 });

    return {
      orderId: order.id,
      orderCode: order.orderCode,
      order: {
        id: order.id,
        orderCode: order.orderCode,
        total: Number(order.totalAmount),
        subtotal: Number(order.subtotal),
        items: order.items,
      },
      razorpayOrder: {
        id: razorpayOrderId,
        amount: amountInPaise,
        currency: 'INR',
      },
      totalAmount: Number(order.totalAmount),
      subtotal: Number(order.subtotal),
      items: order.items,
      razorpayOrderId,
      amountInPaise,
      currency: 'INR',
      keyId: env.RAZORPAY_KEY_ID,
      razorpayKeyId: env.RAZORPAY_KEY_ID,
      shop: {
        id: shop.id,
        name: shop.name,
        slug: shop.slug,
      },
    };
  }

  /**
   * Shopkeeper: List shop-scoped orders
   */
  async getShopOrders(
    shopId: number,
    params: {
      status?: OrderStatus;
      paymentStatus?: PaymentStatus;
      page?: number;
      limit?: number;
    }
  ) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));
    const skip = (page - 1) * limit;

    const where: any = { shopId };
    if (params.status) where.orderStatus = params.status;
    if (params.paymentStatus) where.paymentStatus = params.paymentStatus;

    const [total, orders] = await Promise.all([
      prisma.order.count({ where }),
      prisma.order.findMany({
        where,
        skip,
        take: limit,
        include: {
          items: true,
          payments: {
            select: {
              id: true,
              status: true,
              razorpayPaymentId: true,
              amount: true,
            },
          },
          statusHistory: {
            orderBy: { createdAt: 'asc' },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return { total, page, limit, totalPages: Math.ceil(total / limit), orders };
  }

  /**
   * Shopkeeper: Get single shop-scoped order details
   */
  async getShopOrderById(shopId: number, id: number) {
    const order = await prisma.order.findFirst({
      where: { id, shopId },
      include: {
        items: true,
        payments: true,
        statusHistory: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!order) {
      throw new AppError('Order not found or does not belong to your shop.', 404);
    }

    return order;
  }

  /**
   * Shopkeeper: Update order status (CONFIRMED -> PREPARING -> READY -> COMPLETED)
   */
  async updateOrderStatus(
    shopId: number,
    id: number,
    dto: UpdateOrderStatusDto,
    changedBy: { id: number; role: UserRole }
  ) {
    const existing = await prisma.order.findFirst({
      where: { id, shopId },
    });

    if (!existing) {
      throw new AppError('Order not found or does not belong to your shop.', 404);
    }

    const updated = await prisma.$transaction(async (tx) => {
      const order = await tx.order.update({
        where: { id },
        data: {
          orderStatus: dto.status,
        },
        include: {
          items: true,
          statusHistory: true,
        },
      });

      await tx.orderStatusHistory.create({
        data: {
          orderId: id,
          status: dto.status,
          notes: dto.notes ?? null,
          changedById: changedBy.id,
          changedByRole: changedBy.role,
        },
      });

      return order;
    }, { timeout: 15000, maxWait: 10000 });

    // Real-time broadcast to shopkeeper dashboard and customer order screen
    emitOrderStatusUpdate(shopId, updated.id, {
      orderId: updated.id,
      orderCode: updated.orderCode,
      status: updated.orderStatus,
      tokenNumber: updated.tokenNumber,
      updatedAt: updated.updatedAt,
    });

    return updated;
  }

  /**
   * Customer: Order history across all shops
   */
  async getCustomerOrders(
    customerId: number,
    params: { page?: number; limit?: number }
  ) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));
    const skip = (page - 1) * limit;

    const where = { customerId };

    const [total, orders] = await Promise.all([
      prisma.order.count({ where }),
      prisma.order.findMany({
        where,
        skip,
        take: limit,
        include: {
          shop: {
            select: { id: true, name: true, slug: true, phone: true },
          },
          items: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return { total, page, limit, totalPages: Math.ceil(total / limit), orders };
  }

  /**
   * Customer: Single order details by orderCode
   */
  async getCustomerOrderByCode(customerId: number, orderCode: string) {
    const order = await prisma.order.findFirst({
      where: { orderCode, customerId },
      include: {
        shop: {
          select: { id: true, name: true, slug: true, phone: true },
        },
        items: true,
        statusHistory: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!order) {
      throw new AppError('Order not found.', 404);
    }

    return order;
  }

  /**
   * Shopkeeper: Real-time sales statistics (Today, Week, Month, All-Time)
   */
  async getShopStats(shopId: number) {
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

    const todayStr = startOfToday.toISOString().slice(0, 10);

    const [statsResult, tokenRecord] = await Promise.all([
      prisma.$queryRaw<any[]>`
        SELECT
          COUNT(*) FILTER (WHERE "createdAt" >= ${startOfToday} AND "paymentStatus" = 'PAID')::int as today_orders,
          COALESCE(SUM("totalAmount") FILTER (WHERE "createdAt" >= ${startOfToday} AND "paymentStatus" = 'PAID'), 0)::float as today_revenue,
          COUNT(*) FILTER (WHERE "createdAt" >= ${sevenDaysAgo} AND "paymentStatus" = 'PAID')::int as week_orders,
          COALESCE(SUM("totalAmount") FILTER (WHERE "createdAt" >= ${sevenDaysAgo} AND "paymentStatus" = 'PAID'), 0)::float as week_revenue,
          COUNT(*) FILTER (WHERE "createdAt" >= ${startOfMonth} AND "paymentStatus" = 'PAID')::int as month_orders,
          COALESCE(SUM("totalAmount") FILTER (WHERE "createdAt" >= ${startOfMonth} AND "paymentStatus" = 'PAID'), 0)::float as month_revenue,
          COUNT(*)::int as total_orders,
          COALESCE(SUM("totalAmount") FILTER (WHERE "paymentStatus" = 'PAID'), 0)::float as total_revenue,
          COUNT(*) FILTER (WHERE "orderStatus" IN ('PENDING', 'CONFIRMED', 'PREPARING', 'READY'))::int as active_orders
        FROM "orders"
        WHERE "shopId" = ${shopId};
      `,
      prisma.tokenCounter.findFirst({
        where: { shopId, date: todayStr },
      }),
    ]);

    const row = statsResult?.[0] || {};
    const todayRevenue = Number(row.today_revenue || 0);
    const weekRevenue = Number(row.week_revenue || 0);
    const monthRevenue = Number(row.month_revenue || 0);
    const totalRevenue = Number(row.total_revenue || 0);

    return {
      todayOrders: Number(row.today_orders || 0),
      todayRevenue,
      todaySales: todayRevenue,
      weekOrders: Number(row.week_orders || 0),
      weekRevenue,
      weekSales: weekRevenue,
      monthOrders: Number(row.month_orders || 0),
      monthRevenue,
      monthSales: monthRevenue,
      totalOrders: Number(row.total_orders || 0),
      totalRevenue,
      totalSales: totalRevenue,
      activeOrders: Number(row.active_orders || 0),
      currentToken: tokenRecord ? tokenRecord.lastSequence : 0,
    };
  }
}

export const orderService = new OrderService();

