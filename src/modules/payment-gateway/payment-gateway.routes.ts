import { Router } from 'express';
import { paymentGatewayController } from './payment-gateway.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/role.middleware';
import { validateRequest } from '../../middleware/validate.middleware';
import {
  updatePaymentGatewaySchema,
  testGatewayConnectionSchema,
} from './payment-gateway.dto';

const router = Router();

// Require ADMIN for all payment gateway configuration routes
router.use(authenticate, requireRole('ADMIN'));

router.get('/', paymentGatewayController.getSettings);
router.put(
  '/',
  validateRequest({ body: updatePaymentGatewaySchema }),
  paymentGatewayController.updateSettings
);
router.post(
  '/test-connection',
  validateRequest({ body: testGatewayConnectionSchema }),
  paymentGatewayController.testConnection
);

export default router;
