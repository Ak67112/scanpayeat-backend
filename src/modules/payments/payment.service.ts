import { prisma } from '../../config/database';
import {
  verifyRazorpaySignature,
  verifyRazorpayWebhookSignature,
} from '../../config/razorpay';
import { generateDailyToken } from '../../utils/tokenGenerator';
import { emitNewOrder } from '../../socket/socket.server';
import { AppError } from '../../middleware/error.middleware';
import { VerifyPaymentDto } from './payment.dto';
import { OrderStatus, PaymentStatus } from '@prisma/client';

export class PaymentService {
  /**
   * Verify Razorpay Payment Signature and execute atomic success transaction
   */
  async verifyPayment(dto: VerifyPaymentDto) {
    // 1. Verify cryptographic signature
    const isValid = verifyRazorpaySignature(
      dto.razorpay_order_id,
      dto.razorpay_payment_id,
      dto.razorpay_signature
    );

    if (!isValid) {
      throw new AppError('Payment signature verification failed.', 400);
    }

    // 2. Fetch payment and order
    const payment = await prisma.payment.findUnique({
      where: { razorpayOrderId: dto.razorpay_order_id },
      include: {
        order: {
          include: { items: true },
        },
        shop: true,
      },
    });

    if (!payment) {
      throw new AppError('Associated payment record not found.', 404);
    }

    // If already processed, return idempotent response
    if (payment.status === PaymentStatus.PAID) {
      return {
        success: true,
        orderId: payment.order.id,
        orderCode: payment.order.orderCode,
        tokenNumber: payment.order.tokenNumber,
        status: payment.order.orderStatus,
      };
    }

    // 3. ATOMIC TRANSACTION: Payment PAID -> Order PAID/CONFIRMED -> Token Generated -> Status History
    const result = await prisma.$transaction(async (tx) => {
      // Mark payment = PAID
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.PAID,
          razorpayPaymentId: dto.razorpay_payment_id,
          razorpaySignature: dto.razorpay_signature,
        },
      });

      // Atomically generate shop token sequence (e.g. A101, A102)
      const tokenNumber = await generateDailyToken(
        tx,
        payment.shopId,
        payment.shop.name
      );

      // Mark order = CONFIRMED & PAID with token
      const updatedOrder = await tx.order.update({
        where: { id: payment.orderId },
        data: {
          paymentStatus: PaymentStatus.PAID,
          orderStatus: OrderStatus.CONFIRMED,
          tokenNumber,
        },
        include: {
          items: true,
        },
      });

      // Insert status history
      await tx.orderStatusHistory.create({
        data: {
          orderId: payment.orderId,
          status: OrderStatus.CONFIRMED,
          notes: 'Payment verified successfully via Razorpay',
        },
      });

      return { order: updatedOrder, tokenNumber };
    }, { timeout: 15000, maxWait: 10000 });

    // 4. Realtime Notification to Shopkeeper Dashboard
    emitNewOrder(payment.shopId, {
      orderId: result.order.id,
      orderCode: result.order.orderCode,
      tokenNumber: result.tokenNumber,
      subtotal: Number(result.order.subtotal),
      discountAmount: Number(result.order.discountAmount || 0),
      couponCode: result.order.couponCode,
      discountReason: result.order.discountReason,
      totalAmount: Number(result.order.totalAmount),
      items: result.order.items,
      createdAt: result.order.createdAt,
    });

    return {
      success: true,
      orderId: result.order.id,
      orderCode: result.order.orderCode,
      tokenNumber: result.tokenNumber,
      status: result.order.orderStatus,
    };
  }

  /**
   * Handle Razorpay Webhooks with Signature Verification and Idempotency
   */
  async handleWebhook(rawBody: string | Buffer, signature: string, payload: any) {
    // 1. Verify Webhook Signature
    const isValid = verifyRazorpayWebhookSignature(rawBody, signature);
    if (!isValid) {
      throw new AppError('Invalid webhook signature.', 400);
    }

    const eventId = payload.id;
    const eventType = payload.event;

    // 2. Check Idempotency (prevent duplicate webhook processing)
    const existingEvent = await prisma.paymentWebhookEvent.findUnique({
      where: { eventId },
    });
    if (existingEvent) {
      return { status: 'already_processed' };
    }

    // 3. Process Event
    if (eventType === 'payment.captured') {
      const paymentEntity = payload.payload?.payment?.entity;
      const razorpayOrderId = paymentEntity?.order_id;
      const razorpayPaymentId = paymentEntity?.id;

      if (razorpayOrderId) {
        const payment = await prisma.payment.findUnique({
          where: { razorpayOrderId },
          include: { order: true, shop: true },
        });

        if (payment && payment.status !== PaymentStatus.PAID) {
          await prisma.$transaction(async (tx) => {
            await tx.payment.update({
              where: { id: payment.id },
              data: {
                status: PaymentStatus.PAID,
                razorpayPaymentId,
              },
            });

            const tokenNumber = await generateDailyToken(
              tx,
              payment.shopId,
              payment.shop.name
            );

            const updatedOrder = await tx.order.update({
              where: { id: payment.orderId },
              data: {
                paymentStatus: PaymentStatus.PAID,
                orderStatus: OrderStatus.CONFIRMED,
                tokenNumber,
              },
              include: { items: true },
            });

            await tx.orderStatusHistory.create({
              data: {
                orderId: payment.orderId,
                status: OrderStatus.CONFIRMED,
                notes: 'Payment captured via Razorpay Webhook',
              },
            });

            emitNewOrder(payment.shopId, {
              orderId: updatedOrder.id,
              orderCode: updatedOrder.orderCode,
              tokenNumber,
              totalAmount: Number(updatedOrder.totalAmount),
              items: updatedOrder.items,
              createdAt: updatedOrder.createdAt,
            });
          }, { timeout: 15000, maxWait: 10000 });
        }
      }
    } else if (eventType === 'payment.failed') {
      const paymentEntity = payload.payload?.payment?.entity;
      const razorpayOrderId = paymentEntity?.order_id;
      if (razorpayOrderId) {
        await prisma.payment.updateMany({
          where: { razorpayOrderId },
          data: { status: PaymentStatus.FAILED },
        });
      }
    }

    // 4. Save Event for Idempotency
    await prisma.paymentWebhookEvent.create({
      data: {
        eventId,
        eventType,
        payload,
        status: 'PROCESSED',
      },
    });

    return { status: 'success' };
  }
}

export const paymentService = new PaymentService();
