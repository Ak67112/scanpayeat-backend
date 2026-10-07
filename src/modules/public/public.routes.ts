import { Router } from 'express';
import { publicController } from './public.controller';
import { orderController } from '../orders/order.controller';

const router = Router();

// Public routes accessible without authentication
router.get('/shops/:slug', publicController.getShop);
router.get('/shops/:slug/menu', publicController.getMenu);
router.get('/shops/:slug/coupons', orderController.getPublicShopCoupons);
router.get('/discount-check', orderController.checkDiscounts);

export default router;

