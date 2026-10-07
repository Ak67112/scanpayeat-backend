import { Router } from 'express';
import { adminController } from './admin.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/role.middleware';
import { validateRequest } from '../../middleware/validate.middleware';
import {
  createShopSchema,
  updateShopSchema,
  updateShopStatusSchema,
  createShopkeeperSchema,
  updateShopkeeperSchema,
  updateShopkeeperStatusSchema,
} from './admin.dto';

const router = Router();

// Protect all admin routes with authentication and ADMIN role requirement
router.use(authenticate, requireRole('ADMIN'));

// Shops
router.post(
  '/shops',
  validateRequest({ body: createShopSchema }),
  adminController.createShop
);
router.get('/shops', adminController.getShops);
router.get('/shops/:id', adminController.getShopById);
router.put(
  '/shops/:id',
  validateRequest({ body: updateShopSchema }),
  adminController.updateShop
);
router.patch(
  '/shops/:id',
  validateRequest({ body: updateShopSchema }),
  adminController.updateShop
);
router.patch(
  '/shops/:id/status',
  validateRequest({ body: updateShopStatusSchema }),
  adminController.updateShopStatus
);
router.delete('/shops/:id', adminController.deleteShop);

// Shopkeepers
router.post(
  '/shopkeepers',
  validateRequest({ body: createShopkeeperSchema }),
  adminController.createShopkeeper
);
router.get('/shopkeepers', adminController.getShopkeepers);
router.put(
  '/shopkeepers/:id',
  validateRequest({ body: updateShopkeeperSchema }),
  adminController.updateShopkeeper
);
router.patch(
  '/shopkeepers/:id',
  validateRequest({ body: updateShopkeeperSchema }),
  adminController.updateShopkeeper
);
router.patch(
  '/shopkeepers/:id/status',
  validateRequest({ body: updateShopkeeperStatusSchema }),
  adminController.updateShopkeeperStatus
);
router.delete('/shopkeepers/:id', adminController.deleteShopkeeper);

// Analytics & Reports
router.get('/dashboard', adminController.getDashboard);
router.get('/orders', adminController.getOrders);
router.get('/transactions', adminController.getTransactions);

// Coupons (Global & Shop-specific)
router.get('/coupons', adminController.getCoupons);
router.post('/coupons', adminController.createCoupon);
router.delete('/coupons/:id', adminController.deleteCoupon);
router.patch('/coupons/:id/status', adminController.toggleCoupon);

export default router;
