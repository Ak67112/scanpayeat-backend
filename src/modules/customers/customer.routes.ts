import { Router, Request, Response, NextFunction } from 'express';
import { orderController } from '../orders/order.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/role.middleware';
import { prisma } from '../../config/database';
import { sendSuccess } from '../../utils/response';
import { upload, uploadImageToStorage } from '../../utils/uploader';
import { AppError } from '../../middleware/error.middleware';

const router = Router();

// Customer only routes
router.use(authenticate, requireRole('CUSTOMER'));

router.get('/orders', orderController.getMyOrders);
router.get('/orders/:orderCode', orderController.getMyOrderByCode);

// Customer Profile
router.get('/profile', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const customer = await prisma.customer.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true,
        name: true,
        email: true,
        mobile: true,
        avatarUrl: true,
        createdAt: true,
      },
    });
    sendSuccess(res, { customer }, 'Customer profile retrieved', 200);
  } catch (err) {
    next(err);
  }
});

router.patch('/profile', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { name, mobile, avatarUrl } = req.body;
    const customer = await prisma.customer.update({
      where: { id: req.user!.id },
      data: {
        ...(name && { name }),
        ...(mobile !== undefined && { mobile }),
        ...(avatarUrl !== undefined && { avatarUrl }),
      },
      select: {
        id: true,
        name: true,
        email: true,
        mobile: true,
        avatarUrl: true,
      },
    });
    sendSuccess(res, { customer }, 'Customer profile updated successfully', 200);
  } catch (err) {
    next(err);
  }
});

router.post(
  '/upload',
  upload.single('image'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.file) {
        throw new AppError('No image file provided', 400);
      }
      const imageUrl = await uploadImageToStorage(
        req.file.buffer,
        `avatar_${Date.now()}_${req.file.originalname}`,
        'scanpayeat/avatars'
      );
      sendSuccess(res, { imageUrl }, 'Avatar uploaded successfully', 200);
    } catch (err) {
      next(err);
    }
  }
);

export default router;
