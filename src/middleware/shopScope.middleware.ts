import { Request, Response, NextFunction } from 'express';
import { AppError } from './error.middleware';

/**
 * Enforces shop scoping:
 * For shopkeepers, req.shopId is strictly derived from req.user.shopId (never trusted from request body).
 * For admins, req.shopId can be optionally specified via params/query.
 */
export function shopScope(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    return next(new AppError('Authentication required for shop scope.', 401));
  }

  if (req.user.role === 'SHOPKEEPER') {
    if (!req.user.shopId) {
      return next(new AppError('Shopkeeper account is not associated with any shop.', 403));
    }
    req.shopId = req.user.shopId;
    return next();
  }

  if (req.user.role === 'ADMIN') {
    const rawShopId = req.params.shopId || req.query.shopId || req.body?.shopId;
    if (rawShopId) {
      const parsed = parseInt(String(rawShopId), 10);
      if (isNaN(parsed)) {
        return next(new AppError('Invalid shopId format.', 400));
      }
      req.shopId = parsed;
    }
    return next();
  }

  return next(new AppError('Unauthorized access to shop-scoped resource.', 403));
}
