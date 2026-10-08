import { Request, Response, NextFunction } from 'express';
import { orderService } from './order.service';
import { sendSuccess } from '../../utils/response';

export class OrderController {
  // Checkout (Public or Authenticated Customer)
  async checkout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const customer = req.user
        ? { id: req.user.id, email: req.user.email }
        : undefined;
      const result = await orderService.checkout(req.body, customer);
      sendSuccess(res, result, 'Order created successfully. Proceed to payment.', 201);
    } catch (error) {
      next(error);
    }
  }

  // Shopkeeper: List Orders
  async getShopOrders(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const status = req.query.status as any;
      const paymentStatus = req.query.paymentStatus as any;
      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;

      const result = await orderService.getShopOrders(req.shopId!, {
        status,
        paymentStatus,
        page,
        limit,
      });
      sendSuccess(res, result, 'Shop orders retrieved successfully', 200);
    } catch (error) {
      next(error);
    }
  }

  // Shopkeeper: Get Single Order
  async getShopOrderById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = parseInt(req.params.id, 10);
      const order = await orderService.getShopOrderById(req.shopId!, id);
      sendSuccess(res, { order }, 'Order details retrieved successfully', 200);
    } catch (error) {
      next(error);
    }
  }

  // Shopkeeper: Update Status
  async updateOrderStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = parseInt(req.params.id, 10);
      const order = await orderService.updateOrderStatus(
        req.shopId!,
        id,
        req.body,
        { id: req.user!.id, role: req.user!.role }
      );
      sendSuccess(res, { order }, 'Order status updated successfully', 200);
    } catch (error) {
      next(error);
    }
  }

  // Customer: Order History
  async getMyOrders(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;

      const result = await orderService.getCustomerOrders(req.user!.id, { page, limit });
      sendSuccess(res, result, 'Customer order history retrieved successfully', 200);
    } catch (error) {
      next(error);
    }
  }

  // Customer: Single Order by Order Code
  async getMyOrderByCode(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { orderCode } = req.params;
      const order = await orderService.getCustomerOrderByCode(req.user!.id, orderCode);
      sendSuccess(res, { order }, 'Order details retrieved successfully', 200);
    } catch (error) {
      next(error);
    }
  }

  // Shopkeeper: Live Sales Statistics (Today, Week, Month, All-Time)
  async getShopStats(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const stats = await orderService.getShopStats(req.shopId!);
      sendSuccess(res, { stats }, 'Shopkeeper statistics retrieved successfully', 200);
    } catch (error) {
      next(error);
    }
  }

  // Public: Check Discounts & Milestone Rewards
  async checkDiscounts(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const shopId = req.query.shopId ? parseInt(req.query.shopId as string, 10) : undefined;
      const shopSlug = req.query.shopSlug as string | undefined;
      const subtotal = req.query.subtotal ? parseFloat(req.query.subtotal as string) : 0;
      const couponCode = req.query.couponCode as string | undefined;

      const result = await orderService.checkDiscounts({
        shopId,
        shopSlug,
        subtotal,
        couponCode,
      });
      sendSuccess(res, result, 'Discount eligibility retrieved successfully', 200);
    } catch (error) {
      next(error);
    }
  }

  // Shopkeeper: Get Reward Rule
  async getRewardRule(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const rule = await orderService.getShopRewardRule(req.shopId!);
      sendSuccess(res, { rule }, 'Shop reward rule retrieved successfully', 200);
    } catch (error) {
      next(error);
    }
  }

  // Shopkeeper: Update Reward Rule
  async updateRewardRule(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const rule = await orderService.updateShopRewardRule(req.shopId!, req.body);
      sendSuccess(res, { rule }, 'Shop reward rule updated successfully', 200);
    } catch (error) {
      next(error);
    }
  }

  // Shopkeeper: Get Coupons
  async getCoupons(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const coupons = await orderService.getShopCoupons(req.shopId!);
      sendSuccess(res, { coupons }, 'Coupons retrieved successfully', 200);
    } catch (error) {
      next(error);
    }
  }

  // Shopkeeper: Create Coupon
  async createCoupon(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const coupon = await orderService.createShopCoupon(req.shopId!, req.body);
      sendSuccess(res, { coupon }, 'Coupon created successfully', 201);
    } catch (error) {
      next(error);
    }
  }

  // Shopkeeper: Delete Coupon
  async deleteCoupon(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = parseInt(req.params.id, 10);
      const result = await orderService.deleteShopCoupon(req.shopId!, id);
      sendSuccess(res, result, 'Coupon deleted successfully', 200);
    } catch (error) {
      next(error);
    }
  }

  // Public: Get Available Coupons for a Shop Menu
  async getPublicShopCoupons(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const slug = req.params.slug;
      const coupons = await orderService.getPublicShopCoupons(slug);
      sendSuccess(res, { coupons }, 'Available coupons retrieved successfully', 200);
    } catch (error) {
      next(error);
    }
  }

  // Public / Tracking: Get single order by numeric ID or orderCode
  async getOrderById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const order = await orderService.getOrderByIdOrCode(id);
      sendSuccess(res, { order }, 'Order details retrieved successfully', 200);
    } catch (error) {
      next(error);
    }
  }
}

export const orderController = new OrderController();

