import { Request, Response, NextFunction } from 'express';
import { paymentGatewayService } from './payment-gateway.service';
import { sendSuccess } from '../../utils/response';

export class PaymentGatewayController {
  async getSettings(req: Request, res: Response, next: NextFunction) {
    try {
      const settings = await paymentGatewayService.getSettings();
      sendSuccess(res, { settings }, 'Payment gateway settings retrieved successfully');
    } catch (err) {
      next(err);
    }
  }

  async updateSettings(req: Request, res: Response, next: NextFunction) {
    try {
      const adminId = (req as any).user?.id || 1;
      const settings = await paymentGatewayService.updateSettings(adminId, req.body);
      sendSuccess(res, { settings }, 'Payment gateway settings updated successfully');
    } catch (err) {
      next(err);
    }
  }

  async testConnection(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await paymentGatewayService.testConnection(req.body);
      sendSuccess(res, result, result.message);
    } catch (err) {
      next(err);
    }
  }
}

export const paymentGatewayController = new PaymentGatewayController();
