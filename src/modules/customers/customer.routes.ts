import { Router } from 'express';
import { orderController } from '../orders/order.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/role.middleware';

const router = Router();

// Customer only routes
router.use(authenticate, requireRole('CUSTOMER'));

router.get('/orders', orderController.getMyOrders);
router.get('/orders/:orderCode', orderController.getMyOrderByCode);

export default router;
