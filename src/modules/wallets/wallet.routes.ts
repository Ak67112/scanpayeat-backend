import { Router } from 'express';
import { walletController } from './wallet.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/role.middleware';
import { validateRequest } from '../../middleware/validate.middleware';
import {
  adminCreditWalletSchema,
  adminDebitWalletSchema,
  setWalletLimitSchema,
  updateQrStatusSchema,
} from './wallet.dto';

const router = Router();

// Protect with Admin authentication
router.use(authenticate, requireRole('ADMIN'));

router.get('/', walletController.getWallets);
router.get('/transactions', walletController.getTransactions);
router.get('/:shopkeeperId', walletController.getWalletByShopkeeperId);
router.post(
  '/:shopkeeperId/credit',
  validateRequest({ body: adminCreditWalletSchema }),
  walletController.adminCredit
);
router.post(
  '/:shopkeeperId/debit',
  validateRequest({ body: adminDebitWalletSchema }),
  walletController.adminDebit
);
router.patch(
  '/:shopkeeperId/limit',
  validateRequest({ body: setWalletLimitSchema }),
  walletController.setWalletLimit
);
router.patch(
  '/:shopkeeperId/qr-status',
  validateRequest({ body: updateQrStatusSchema }),
  walletController.updateQrStatus
);
router.get('/:shopkeeperId/transactions', walletController.getTransactions);

export default router;
