import { Request, Response, NextFunction } from 'express';
import { walletService } from './wallet.service';
import { sendSuccess } from '../../utils/response';
import { AppError } from '../../middleware/error.middleware';

export class WalletController {
  /**
   * Admin: List all shopkeeper wallets
   */
  async getWallets(req: Request, res: Response, next: NextFunction) {
    try {
      const search = req.query.search as string;
      const lowBalanceOnly = req.query.lowBalanceOnly === 'true';
      const qrEnabledOnly =
        req.query.qrEnabledOnly !== undefined
          ? req.query.qrEnabledOnly === 'true'
          : undefined;
      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;

      const result = await walletService.getWallets({
        search,
        lowBalanceOnly,
        qrEnabledOnly,
        page,
        limit,
      });

      sendSuccess(res, result, 'Shopkeeper wallets retrieved successfully');
    } catch (err) {
      next(err);
    }
  }

  /**
   * Admin: Get single shopkeeper wallet
   */
  async getWalletByShopkeeperId(req: Request, res: Response, next: NextFunction) {
    try {
      const shopkeeperId = parseInt(req.params.shopkeeperId, 10);
      if (isNaN(shopkeeperId)) {
        throw new AppError('Invalid shopkeeper ID parameter.', 400);
      }

      const wallet = await walletService.getWalletByShopkeeperId(shopkeeperId);
      sendSuccess(res, { wallet }, 'Shopkeeper wallet details retrieved');
    } catch (err) {
      next(err);
    }
  }

  /**
   * Admin: Credit amount to shopkeeper wallet
   */
  async adminCredit(req: Request, res: Response, next: NextFunction) {
    try {
      const shopkeeperId = parseInt(req.params.shopkeeperId, 10);
      if (isNaN(shopkeeperId)) {
        throw new AppError('Invalid shopkeeper ID parameter.', 400);
      }
      const adminId = (req as any).user?.id || 1;

      const result = await walletService.adminCredit(shopkeeperId, adminId, req.body);
      sendSuccess(res, result, result.message);
    } catch (err) {
      next(err);
    }
  }

  /**
   * Admin: Debit / manual adjustment
   */
  async adminDebit(req: Request, res: Response, next: NextFunction) {
    try {
      const shopkeeperId = parseInt(req.params.shopkeeperId, 10);
      if (isNaN(shopkeeperId)) {
        throw new AppError('Invalid shopkeeper ID parameter.', 400);
      }
      const adminId = (req as any).user?.id || 1;

      const result = await walletService.adminDebit(shopkeeperId, adminId, req.body);
      sendSuccess(res, result, result.message);
    } catch (err) {
      next(err);
    }
  }

  /**
   * Admin: Set individual minimum wallet limit
   */
  async setWalletLimit(req: Request, res: Response, next: NextFunction) {
    try {
      const shopkeeperId = parseInt(req.params.shopkeeperId, 10);
      if (isNaN(shopkeeperId)) {
        throw new AppError('Invalid shopkeeper ID parameter.', 400);
      }

      const result = await walletService.setWalletLimit(shopkeeperId, req.body);
      sendSuccess(res, result, result.message);
    } catch (err) {
      next(err);
    }
  }

  /**
   * Admin: Update QR payment enabled status
   */
  async updateQrStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const shopkeeperId = parseInt(req.params.shopkeeperId, 10);
      if (isNaN(shopkeeperId)) {
        throw new AppError('Invalid shopkeeper ID parameter.', 400);
      }

      const result = await walletService.updateQrStatus(shopkeeperId, req.body);
      sendSuccess(res, result, result.message);
    } catch (err) {
      next(err);
    }
  }

  /**
   * Admin: Get transactions ledger
   */
  async getTransactions(req: Request, res: Response, next: NextFunction) {
    try {
      const walletId = req.query.walletId ? parseInt(req.query.walletId as string, 10) : undefined;
      const shopkeeperId = req.query.shopkeeperId
        ? parseInt(req.query.shopkeeperId as string, 10)
        : undefined;
      const type = req.query.type as string;
      const startDate = req.query.startDate as string;
      const endDate = req.query.endDate as string;
      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;

      const result = await walletService.getTransactions({
        walletId,
        shopkeeperId,
        type,
        startDate,
        endDate,
        page,
        limit,
      });

      sendSuccess(res, result, 'Wallet transactions retrieved successfully');
    } catch (err) {
      next(err);
    }
  }

  /**
   * Shopkeeper: View own wallet balance, limit, QR status, and transactions
   */
  async getMyWallet(req: Request, res: Response, next: NextFunction) {
    try {
      const shopkeeperId = (req as any).user?.id;
      if (!shopkeeperId) {
        throw new AppError('Authentication required.', 401);
      }

      const wallet = await walletService.getWalletByShopkeeperId(shopkeeperId);
      sendSuccess(res, { wallet }, 'My wallet details retrieved');
    } catch (err) {
      next(err);
    }
  }

  /**
   * Shopkeeper: Create online Razorpay order to recharge wallet
   */
  async createRechargeOrder(req: Request, res: Response, next: NextFunction) {
    try {
      const shopkeeperId = (req as any).user?.id;
      if (!shopkeeperId) {
        throw new AppError('Authentication required.', 401);
      }

      const { amount } = req.body;
      const parsedAmount = parseFloat(amount);
      if (isNaN(parsedAmount) || parsedAmount < 10) {
        throw new AppError('Please provide a valid recharge amount (min ₹10.00).', 400);
      }

      const rechargeOrder = await walletService.createRechargeOrder(shopkeeperId, parsedAmount);
      sendSuccess(res, rechargeOrder, 'Wallet recharge order created successfully');
    } catch (err) {
      next(err);
    }
  }

  /**
   * Shopkeeper: Verify Razorpay payment and credit wallet
   */
  async verifyRecharge(req: Request, res: Response, next: NextFunction) {
    try {
      const shopkeeperId = (req as any).user?.id;
      if (!shopkeeperId) {
        throw new AppError('Authentication required.', 401);
      }

      const { razorpay_order_id, razorpay_payment_id, razorpay_signature, amount } = req.body;
      const parsedAmount = parseFloat(amount);
      if (isNaN(parsedAmount) || parsedAmount <= 0) {
        throw new AppError('Valid amount is required for verification.', 400);
      }

      const result = await walletService.verifyAndCreditRecharge(shopkeeperId, {
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
        amount: parsedAmount,
      });

      sendSuccess(res, result, 'Wallet topped up successfully!');
    } catch (err) {
      next(err);
    }
  }
}

export const walletController = new WalletController();
