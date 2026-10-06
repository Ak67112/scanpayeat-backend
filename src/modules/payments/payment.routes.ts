import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { paymentController } from './payment.controller';
import { validateRequest } from '../../middleware/validate.middleware';
import { verifyPaymentSchema } from './payment.dto';

const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: {
    success: false,
    message: 'Too many payment requests, please try again later.',
  },
});

const router = Router();

router.post(
  '/verify',
  paymentLimiter,
  validateRequest({ body: verifyPaymentSchema }),
  paymentController.verifyPayment
);

export default router;
