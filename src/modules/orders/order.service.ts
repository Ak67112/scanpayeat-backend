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
    const numSubtotal = Number(subtotal);

    // 3.5 Calculate Discounts (Coupon code & Today's Milestone Customer Rewards)
    let discountAmount = new Prisma.Decimal(0);
    let appliedCouponCode: string | null = null;
    const discountReasons: string[] = [];

    // A) Process Coupon if provided
    if (dto.couponCode && dto.couponCode.trim()) {
      const cleanCode = dto.couponCode.trim().toUpperCase();
      const coupon = await prisma.coupon.findFirst({
        where: {
          code: cleanCode,
          isActive: true,
          OR: [{ shopId: null }, { shopId: shop.id }],
        },
      });

      if (coupon) {
        if (numSubtotal >= Number(coupon.minOrderAmount)) {
          let cDiscount = 0;
          if (coupon.discountType === 'PERCENT') {
            cDiscount = (numSubtotal * Number(coupon.discountValue)) / 100;
            if (coupon.maxDiscount) {
              cDiscount = Math.min(cDiscount, Number(coupon.maxDiscount));
            }
          } else {
            cDiscount = Number(coupon.discountValue);
          }
          cDiscount = Math.min(numSubtotal, Math.round(cDiscount * 100) / 100);
          if (cDiscount > 0) {
            discountAmount = discountAmount.add(new Prisma.Decimal(cDiscount));
            appliedCouponCode = cleanCode;
            discountReasons.push(`Coupon: ${cleanCode} (-₹${cDiscount})`);
            prisma.coupon
              .update({
                where: { id: coupon.id },
                data: { usageCount: { increment: 1 } },
              })
              .catch(() => {});
          }
        }
      } else {
        const otherCoupon = await prisma.coupon.findFirst({
          where: { code: cleanCode, isActive: true },
        });
        if (otherCoupon && otherCoupon.shopId && otherCoupon.shopId !== shop.id) {
          throw new AppError(
            `Coupon '${cleanCode}' is exclusive to another store and cannot be applied here.`,
            400
          );
        }
      }
    }

    // B) Process Today's Milestone Customer Reward (e.g., 10th customer, 100th customer)
    try {
      const rewardRule = await prisma.shopRewardRule.findUnique({
        where: { shopId: shop.id },
      });

      if (rewardRule && rewardRule.isActive && rewardRule.milestoneCount > 0) {
        const now = new Date();
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

        const todayPaidOrdersCount = await prisma.order.count({
          where: {
            shopId: shop.id,
            createdAt: { gte: startOfToday },
            paymentStatus: { in: [PaymentStatus.PAID, PaymentStatus.PENDING] },
          },
        });

        const todayCustomerNumber = todayPaidOrdersCount + 1;
        const targetMilestone = rewardRule.milestoneCount;

        const isMilestoneMatch =
          todayCustomerNumber === targetMilestone ||
          (targetMilestone > 0 && todayCustomerNumber % targetMilestone === 0);

        if (isMilestoneMatch && numSubtotal >= Number(rewardRule.minOrderAmount)) {
          const remainingSubtotal = Math.max(0, numSubtotal - Number(discountAmount));
          const mDiscount = Math.min(remainingSubtotal, Number(rewardRule.discountAmount));
          if (mDiscount > 0) {
            discountAmount = discountAmount.add(new Prisma.Decimal(mDiscount));
            if (!appliedCouponCode) {
              appliedCouponCode = `MILESTONE-${todayCustomerNumber}`;
            }
            discountReasons.push(
              rewardRule.title
                ? `${rewardRule.title} (-₹${mDiscount})`
                : `Today's ${todayCustomerNumber}th Customer Celebration Reward (-₹${mDiscount})`
            );
          }
        }
      }
    } catch (err) {
      console.warn('Milestone evaluation warning:', err);
    }

    // Cap total discount to subtotal
    if (Number(discountAmount) > numSubtotal) {
      discountAmount = new Prisma.Decimal(numSubtotal);
    }

    const discountReason = discountReasons.length > 0 ? discountReasons.join(' + ') : null;
    const finalAmountVal = Math.max(0, numSubtotal - Number(discountAmount) + Number(tax));
    const totalAmount = new Prisma.Decimal(finalAmountVal);

    // 4. Generate unique orderCode
    const orderCode = `ORD${Date.now()}${Math.floor(100 + Math.random() * 900)}`;

    // 5. Create Razorpay order
    let razorpayOrderId = `rzp_mock_${Date.now()}`;
    const amountInPaise = Math.round(finalAmountVal * 100);

    try {
      const rzpOrder = await razorpayClient.orders.create({
        amount: amountInPaise,
        currency: 'INR',
        receipt: orderCode,
        notes: {
          shopId: String(shop.id),
          shopName: shop.name,
          orderCode,
          discountAmount: String(discountAmount),
          couponCode: appliedCouponCode || 'none',
        },
      });
      if (rzpOrder && rzpOrder.id) {
        razorpayOrderId = rzpOrder.id;
      }
    } catch (rzpErr: any) {
      console.warn('⚠️ Razorpay order creation warning:', rzpErr.message || rzpErr);
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
          discountAmount,
          couponCode: appliedCouponCode,
          discountReason,
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
        discountAmount: Number(order.discountAmount),
        couponCode: order.couponCode,
        discountReason: order.discountReason,
        items: order.items,
      },
      razorpayOrder: {
        id: razorpayOrderId,
        amount: amountInPaise,
        currency: 'INR',
      },
      totalAmount: Number(order.totalAmount),
      subtotal: Number(order.subtotal),
      discountAmount: Number(order.discountAmount),
      couponCode: order.couponCode,
      discountReason: order.discountReason,
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
   * Public / Customer: Get single order details by numeric ID or orderCode for live tracking
   */
  async getOrderByIdOrCode(idOrCode: string | number) {
    const isNumeric = !isNaN(Number(idOrCode));
    const order = await prisma.order.findFirst({
      where: isNumeric
        ? { id: parseInt(String(idOrCode), 10) }
        : { orderCode: String(idOrCode) },
      include: {
        shop: {
          select: {
            id: true,
            name: true,
            slug: true,
            phone: true,
            logoUrl: true,
            address: true,
          },
        },
        items: true,
        payments: true,
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
          COALESCE(SUM("discountAmount") FILTER (WHERE "createdAt" >= ${startOfToday} AND "paymentStatus" = 'PAID'), 0)::float as today_discounts,
          COALESCE(SUM("subtotal") FILTER (WHERE "createdAt" >= ${startOfToday} AND "paymentStatus" = 'PAID'), 0)::float as today_gross_sales,
          COUNT(*) FILTER (WHERE "createdAt" >= ${sevenDaysAgo} AND "paymentStatus" = 'PAID')::int as week_orders,
          COALESCE(SUM("totalAmount") FILTER (WHERE "createdAt" >= ${sevenDaysAgo} AND "paymentStatus" = 'PAID'), 0)::float as week_revenue,
          COUNT(*) FILTER (WHERE "createdAt" >= ${startOfMonth} AND "paymentStatus" = 'PAID')::int as month_orders,
          COALESCE(SUM("totalAmount") FILTER (WHERE "createdAt" >= ${startOfMonth} AND "paymentStatus" = 'PAID'), 0)::float as month_revenue,
          COUNT(*)::int as total_orders,
          COALESCE(SUM("totalAmount") FILTER (WHERE "paymentStatus" = 'PAID'), 0)::float as total_revenue,
          COALESCE(SUM("discountAmount") FILTER (WHERE "paymentStatus" = 'PAID'), 0)::float as total_discounts,
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
    const todayDiscounts = Number(row.today_discounts || 0);
    const todayGrossSales = Number(row.today_gross_sales || todayRevenue + todayDiscounts);
    const weekRevenue = Number(row.week_revenue || 0);
    const monthRevenue = Number(row.month_revenue || 0);
    const totalRevenue = Number(row.total_revenue || 0);
    const totalDiscounts = Number(row.total_discounts || 0);

    return {
      todayOrders: Number(row.today_orders || 0),
      todayRevenue,
      todaySales: todayRevenue,
      todayDiscounts,
      todayGrossSales,
      weekOrders: Number(row.week_orders || 0),
      weekRevenue,
      weekSales: weekRevenue,
      monthOrders: Number(row.month_orders || 0),
      monthRevenue,
      monthSales: monthRevenue,
      totalOrders: Number(row.total_orders || 0),
      totalRevenue,
      totalSales: totalRevenue,
      totalDiscounts,
      activeOrders: Number(row.active_orders || 0),
      currentToken: tokenRecord ? tokenRecord.lastSequence : 0,
    };
  }

  /**
   * Public: Check coupon code validity and milestone discount eligibility
   */
  async checkDiscounts(params: {
    shopId?: number;
    shopSlug?: string;
    subtotal: number;
    couponCode?: string;
  }) {
    let resolvedShopId = params.shopId;
    if (!resolvedShopId && params.shopSlug) {
      const s = await prisma.shop.findFirst({
        where: {
          OR: [
            { slug: params.shopSlug.toLowerCase() },
            { subdomain: params.shopSlug.toLowerCase() },
          ],
        },
        select: { id: true },
      });
      if (s) resolvedShopId = s.id;
    }

    const subtotal = Math.max(0, Number(params.subtotal || 0));
    let discountAmount = 0;
    let appliedCoupon: any = null;
    let couponError: string | null = null;
    const reasons: string[] = [];

    // Check coupon
    if (params.couponCode && params.couponCode.trim()) {
      const cleanCode = params.couponCode.trim().toUpperCase();
      const coupon = await prisma.coupon.findFirst({
        where: {
          code: cleanCode,
          isActive: true,
          OR: resolvedShopId
            ? [{ shopId: null }, { shopId: resolvedShopId }]
            : [{ shopId: null }],
        },
      });

      if (!coupon) {
        const otherCoupon = await prisma.coupon.findFirst({
          where: { code: cleanCode, isActive: true },
        });
        if (otherCoupon && otherCoupon.shopId && otherCoupon.shopId !== resolvedShopId) {
          couponError = `Coupon '${cleanCode}' is exclusive to another restaurant and cannot be applied here`;
        } else {
          couponError = 'Invalid or expired coupon code';
        }
      } else if (subtotal < Number(coupon.minOrderAmount)) {
        couponError = `Minimum order amount of ₹${coupon.minOrderAmount} required for ${cleanCode}`;
      } else {
        let cDiscount = 0;
        if (coupon.discountType === 'PERCENT') {
          cDiscount = (subtotal * Number(coupon.discountValue)) / 100;
          if (coupon.maxDiscount) {
            cDiscount = Math.min(cDiscount, Number(coupon.maxDiscount));
          }
        } else {
          cDiscount = Number(coupon.discountValue);
        }
        cDiscount = Math.min(subtotal, Math.round(cDiscount * 100) / 100);
        discountAmount += cDiscount;
        appliedCoupon = {
          code: cleanCode,
          discountAmount: cDiscount,
          type: coupon.discountType,
          value: Number(coupon.discountValue),
        };
        reasons.push(`Coupon: ${cleanCode} (-₹${cDiscount})`);
      }
    }

    // Check Milestone rule
    let milestoneInfo: any = null;
    if (resolvedShopId) {
      try {
        const rule = await prisma.shopRewardRule.findUnique({
          where: { shopId: resolvedShopId },
        });

        if (rule && rule.isActive && rule.milestoneCount > 0) {
          const now = new Date();
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

          const todayPaidOrdersCount = await prisma.order.count({
            where: {
              shopId: resolvedShopId,
              createdAt: { gte: startOfToday },
              paymentStatus: { in: [PaymentStatus.PAID, PaymentStatus.PENDING] },
            },
          });

          const nextCustomerNumber = todayPaidOrdersCount + 1;
          const isMilestoneMatch =
            nextCustomerNumber === rule.milestoneCount ||
            (rule.milestoneCount > 0 && nextCustomerNumber % rule.milestoneCount === 0);

          const isEligible = isMilestoneMatch && subtotal >= Number(rule.minOrderAmount);
          let mDiscount = 0;
          if (isEligible) {
            const remaining = Math.max(0, subtotal - discountAmount);
            mDiscount = Math.min(remaining, Number(rule.discountAmount));
            discountAmount += mDiscount;
            reasons.push(
              rule.title
                ? `${rule.title} (-₹${mDiscount})`
                : `Today's ${nextCustomerNumber}th Customer Celebration Reward (-₹${mDiscount})`
            );
          }

          milestoneInfo = {
            active: true,
            todayCustomerNumber: nextCustomerNumber,
            targetMilestone: rule.milestoneCount,
            isEligible,
            discountAmount: Number(rule.discountAmount),
            minOrderAmount: Number(rule.minOrderAmount),
            title: rule.title || `Today's ${rule.milestoneCount}th Customer Reward`,
          };
        }
      } catch (err) {
        console.warn('Milestone discount check warning:', err);
      }
    }

    discountAmount = Math.min(subtotal, discountAmount);
    const finalAmount = Math.max(0, subtotal - discountAmount);

    return {
      subtotal,
      discountAmount,
      finalAmount,
      appliedCoupon,
      couponError,
      milestone: milestoneInfo,
      reason: reasons.length > 0 ? reasons.join(' + ') : null,
    };
  }

  /**
   * Shopkeeper: Get or initialize Milestone Reward Rule
   */
  async getShopRewardRule(shopId: number) {
    let rule = await prisma.shopRewardRule.findUnique({
      where: { shopId },
    });
    if (!rule) {
      rule = await prisma.shopRewardRule.create({
        data: {
          shopId,
          milestoneCount: 10,
          discountAmount: 50,
          minOrderAmount: 100,
          isActive: true,
          title: "Today's 10th Customer Celebration Reward",
        },
      });
    }
    return rule;
  }

  /**
   * Shopkeeper: Update Milestone Reward Rule
   */
  async updateShopRewardRule(
    shopId: number,
    data: {
      milestoneCount?: number;
      discountAmount?: number;
      minOrderAmount?: number;
      isActive?: boolean;
      title?: string;
    }
  ) {
    return prisma.shopRewardRule.upsert({
      where: { shopId },
      update: {
        ...(data.milestoneCount !== undefined ? { milestoneCount: data.milestoneCount } : {}),
        ...(data.discountAmount !== undefined ? { discountAmount: data.discountAmount } : {}),
        ...(data.minOrderAmount !== undefined ? { minOrderAmount: data.minOrderAmount } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        ...(data.title ? { title: data.title } : {}),
      },
      create: {
        shopId,
        milestoneCount: data.milestoneCount ?? 10,
        discountAmount: data.discountAmount ?? 50,
        minOrderAmount: data.minOrderAmount ?? 100,
        isActive: data.isActive ?? true,
        title: data.title ?? "Today's 10th Customer Celebration Reward",
      },
    });
  }

  /**
   * Shopkeeper: Get Coupons (Store exclusive + Global platform offers)
   */
  async getShopCoupons(shopId: number) {
    const coupons = await prisma.coupon.findMany({
      where: {
        OR: [{ shopId }, { shopId: null }],
      },
      orderBy: { createdAt: 'desc' },
    });

    return coupons.map((c) => ({
      ...c,
      isGlobal: c.shopId === null,
      canDelete: c.shopId === shopId,
    }));
  }

  /**
   * Shopkeeper: Create Store-Exclusive Coupon
   */
  async createShopCoupon(
    shopId: number,
    data: {
      code: string;
      discountType?: string;
      discountValue: number;
      minOrderAmount?: number;
      maxDiscount?: number;
      isActive?: boolean;
    }
  ) {
    const code = data.code.trim().toUpperCase();
    const existing = await prisma.coupon.findUnique({ where: { code } });
    if (existing) {
      throw new AppError(`Coupon code ${code} already exists`, 400);
    }
    const coupon = await prisma.coupon.create({
      data: {
        shopId, // Tying strictly to this shopkeeper!
        code,
        discountType: data.discountType || 'FIXED',
        discountValue: data.discountValue,
        minOrderAmount: data.minOrderAmount ?? 0,
        maxDiscount: data.maxDiscount ?? null,
        isActive: data.isActive ?? true,
      },
    });

    return {
      ...coupon,
      isGlobal: false,
      canDelete: true,
    };
  }

  /**
   * Shopkeeper: Delete Store-Exclusive Coupon (Cannot delete global coupons)
   */
  async deleteShopCoupon(shopId: number, id: number) {
    const coupon = await prisma.coupon.findFirst({
      where: { id, shopId },
    });
    if (!coupon) {
      throw new AppError(
        'Store can only delete its own store coupons. Global platform coupons cannot be deleted by storekeepers.',
        403
      );
    }
    await prisma.coupon.delete({ where: { id } });
    return { success: true };
  }

  /**
   * Public: Get available active coupons for a restaurant menu
   */
  async getPublicShopCoupons(slug: string) {
    const shop = await prisma.shop.findUnique({ where: { slug } });
    if (!shop) {
      throw new AppError('Shop not found', 404);
    }
    const coupons = await prisma.coupon.findMany({
      where: {
        isActive: true,
        OR: [{ shopId: shop.id }, { shopId: null }],
      },
      select: {
        id: true,
        code: true,
        discountType: true,
        discountValue: true,
        minOrderAmount: true,
        maxDiscount: true,
        shopId: true,
      },
      orderBy: { discountValue: 'desc' },
    });

    return coupons.map((c) => ({
      ...c,
      isGlobal: c.shopId === null,
    }));
  }
}

export const orderService = new OrderService();

