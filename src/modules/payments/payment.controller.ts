import { Request, Response, NextFunction } from 'express';
import { paymentService } from './payment.service';
import { sendSuccess } from '../../utils/response';

export class PaymentController {
  async verifyPayment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await paymentService.verifyPayment(req.body);
      sendSuccess(res, result, 'Payment verified and order confirmed successfully', 200);
    } catch (error) {
      next(error);
    }
  }

  async handleWebhook(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const signature = req.headers['x-razorpay-signature'] as string;
      const rawBody = (req as any).rawBody || JSON.stringify(req.body);

      const result = await paymentService.handleWebhook(rawBody, signature, req.body);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }
}

export const paymentController = new PaymentController();
