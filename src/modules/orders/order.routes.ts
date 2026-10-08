import { Router, Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { orderController } from './order.controller';
import { validateRequest } from '../../middleware/validate.middleware';
import { verifyAccessToken } from '../../utils/jwt';
import { checkoutSchema } from './order.dto';

const checkoutLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: {
    success: false,
    message: 'Too many checkout requests. Please try again later.',
  },
});

// Optional auth extractor (attaches req.user if customer is signed in, otherwise allows guest checkout)
function optionalAuth(req: Request, res: Response, next: NextFunction): void {
  try {
    const authHeader = req.headers.authorization;
    const token =
      (authHeader && authHeader.startsWith('Bearer ') && authHeader.split(' ')[1]) ||
      req.cookies?.accessToken;

    if (token) {
      const payload = verifyAccessToken(token);
      req.user = {
        id: parseInt(payload.sub, 10),
        email: payload.email,
        role: payload.role as any,
      };
    }
  } catch {
    // Ignore invalid token and treat as guest
  }
  next();
}

const router = Router();

router.post(
  '/checkout',
  checkoutLimiter,
  optionalAuth,
  validateRequest({ body: checkoutSchema }),
  orderController.checkout
);

// Public / Customer live order tracking by ID or orderCode
router.get('/:id', optionalAuth, orderController.getOrderById);

export default router;
