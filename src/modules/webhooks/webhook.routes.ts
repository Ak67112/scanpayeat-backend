import { Router, Request, Response, NextFunction } from 'express';
import express from 'express';
import { paymentController } from '../payments/payment.controller';

const router = Router();

// Razorpay sends webhooks as raw json payload
router.post(
  '/razorpay',
  express.raw({ type: 'application/json' }),
  (req: Request, res: Response, next: NextFunction) => {
    // Preserve raw buffer for signature verification
    if (Buffer.isBuffer(req.body)) {
      (req as any).rawBody = req.body.toString('utf8');
      try {
        req.body = JSON.parse((req as any).rawBody);
      } catch {
        // Leave body as is
      }
    }
    next();
  },
  paymentController.handleWebhook
);

export default router;
