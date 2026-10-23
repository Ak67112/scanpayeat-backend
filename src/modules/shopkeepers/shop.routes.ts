import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/role.middleware';
import { shopScope } from '../../middleware/shopScope.middleware';
import { validateRequest } from '../../middleware/validate.middleware';
import { categoryController } from '../categories/category.controller';
import { productController } from '../products/product.controller';
import { orderController } from '../orders/order.controller';
import { walletController } from '../wallets/wallet.controller';
import { shopSettingsController } from './shop-settings.controller';
import { upload, uploadImageToStorage } from '../../utils/uploader';
import { sendSuccess } from '../../utils/response';
import { AppError } from '../../middleware/error.middleware';
import { prisma } from '../../config/database';
import {
  createCategorySchema,
  updateCategorySchema,
} from '../categories/category.dto';
import {
  createProductSchema,
  updateProductSchema,
  updateProductAvailabilitySchema,
} from '../products/product.dto';
import { updateOrderStatusSchema } from '../orders/order.dto';

const router = Router();

// Protect all /api/shop routes: Must be authenticated Shopkeeper (or Admin with shop scope), and enforce shopScope
router.use(authenticate, requireRole('SHOPKEEPER', 'ADMIN'), shopScope);

// --- Shopkeeper Wallet Routes ---
router.get('/wallet', walletController.getMyWallet);
router.post('/wallet/recharge/create-order', walletController.createRechargeOrder);
router.post('/wallet/recharge/verify', walletController.verifyRecharge);

// --- Shopkeeper Tax Settings (Customizable GST, CGST, SGST) ---
router.get('/tax-settings', shopSettingsController.getTaxSettings);
router.put('/tax-settings', shopSettingsController.updateTaxSettings);

// --- Category Routes ---
router.post(
  '/categories',
  validateRequest({ body: createCategorySchema }),
  categoryController.createCategory
);
router.get('/categories', categoryController.getCategories);
router.put(
  '/categories/:id',
  validateRequest({ body: updateCategorySchema }),
  categoryController.updateCategory
);
router.patch(
  '/categories/:id',
  validateRequest({ body: updateCategorySchema }),
  categoryController.updateCategory
);
router.delete('/categories/:id', categoryController.deleteCategory);

// --- Product Routes ---
router.post(
  '/products',
  validateRequest({ body: createProductSchema }),
  productController.createProduct
);
router.get('/products', productController.getProducts);
router.get('/products/:id', productController.getProductById);
router.put(
  '/products/:id',
  validateRequest({ body: updateProductSchema }),
  productController.updateProduct
);
router.patch(
  '/products/:id',
  validateRequest({ body: updateProductSchema }),
  productController.updateProduct
);
router.patch(
  '/products/:id/availability',
  validateRequest({ body: updateProductAvailabilitySchema }),
  productController.updateProductAvailability
);
router.delete('/products/:id', productController.deleteProduct);

// --- Image Upload Route ---
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
        `${Date.now()}_${req.file.originalname}`
      );
      sendSuccess(res, { imageUrl }, 'Image uploaded successfully', 200);
    } catch (error) {
      next(error);
    }
  }
);

// --- Order Management & Real-time Sales Stats ---
router.get('/stats', orderController.getShopStats);
router.get('/orders', orderController.getShopOrders);
router.get('/orders/:id', orderController.getShopOrderById);
router.patch(
  '/orders/:id/status',
  validateRequest({ body: updateOrderStatusSchema }),
  orderController.updateOrderStatus
);

// --- Discount, Coupons & Milestone Rewards Management ---
router.get('/reward-rules', orderController.getRewardRule);
router.put('/reward-rules', orderController.updateRewardRule);
router.get('/coupons', orderController.getCoupons);
router.post('/coupons', orderController.createCoupon);
router.delete('/coupons/:id', orderController.deleteCoupon);

// --- Kitchen Ordering Status ON/OFF Toggle ---
router.patch('/ordering-status', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { isOrderingEnabled } = req.body;
    if (typeof isOrderingEnabled !== 'boolean') {
      throw new AppError('isOrderingEnabled must be a boolean', 400);
    }
    const updatedShop = await prisma.shop.update({
      where: { id: req.shopId! },
      data: { isOrderingEnabled },
    });
    sendSuccess(
      res,
      { isOrderingEnabled: updatedShop.isOrderingEnabled },
      `Kitchen ordering is now ${isOrderingEnabled ? 'ENABLED' : 'PAUSED'}`,
      200
    );
  } catch (error) {
    next(error);
  }
});

// --- Dining Tables Management (Shopkeeper Table Increment & Count) ---
router.post('/tables/add', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const shop = await prisma.shop.findUnique({ where: { id: req.shopId! } });
    if (!shop) throw new AppError('Shop not found', 404);

    const newTableCount = (shop.tableCount || 0) + 1;
    const updatedShop = await prisma.shop.update({
      where: { id: req.shopId! },
      data: {
        hasDining: true,
        tableCount: newTableCount,
      },
    });

    sendSuccess(
      res,
      {
        hasDining: updatedShop.hasDining,
        tableCount: updatedShop.tableCount,
        addedTable: newTableCount,
      },
      `Table #${newTableCount} added successfully`,
      200
    );
  } catch (error) {
    next(error);
  }
});

router.patch('/tables', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { tableCount, hasDining } = req.body;
    const count = Math.max(0, parseInt(tableCount, 10) || 0);
    const updatedShop = await prisma.shop.update({
      where: { id: req.shopId! },
      data: {
        ...(hasDining !== undefined && { hasDining: Boolean(hasDining) }),
        tableCount: count,
      },
    });

    sendSuccess(
      res,
      {
        hasDining: updatedShop.hasDining,
        tableCount: updatedShop.tableCount,
      },
      `Dining tables updated to ${count}`,
      200
    );
  } catch (error) {
    next(error);
  }
});

// --- Shop & Shopkeeper Profile Management (Logo, Ambience Images, Bio) ---
router.get('/profile', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const shop = await prisma.shop.findUnique({
      where: { id: req.shopId! },
    });
    const keeper = await prisma.shopkeeper.findUnique({
      where: { id: req.user!.id },
      select: { id: true, name: true, email: true, mobile: true, avatarUrl: true },
    });
    sendSuccess(res, { shop, shopkeeper: keeper }, 'Shop profile retrieved successfully', 200);
  } catch (error) {
    next(error);
  }
});

router.put('/profile', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { name, address, state, district, phone, logoUrl, bannerUrl, description, ambienceImages, hasDining, tableCount, isOrderingEnabled, keeperName, keeperMobile, keeperAvatarUrl } = req.body;

    const updatedShop = await prisma.shop.update({
      where: { id: req.shopId! },
      data: {
        ...(name && { name }),
        ...(address !== undefined && { address }),
        ...(state !== undefined && { state }),
        ...(district !== undefined && { district }),
        ...(phone !== undefined && { phone }),
        ...(logoUrl !== undefined && { logoUrl }),
        ...(bannerUrl !== undefined && { bannerUrl }),
        ...(description !== undefined && { description }),
        ...(hasDining !== undefined && { hasDining: Boolean(hasDining) }),
        ...(tableCount !== undefined && { tableCount: Math.max(0, parseInt(tableCount, 10) || 0) }),
        ...(isOrderingEnabled !== undefined && { isOrderingEnabled: Boolean(isOrderingEnabled) }),
        ...(Array.isArray(ambienceImages) && { ambienceImages }),
      },
    });

    if (keeperName || keeperMobile !== undefined || keeperAvatarUrl !== undefined) {
      await prisma.shopkeeper.update({
        where: { id: req.user!.id },
        data: {
          ...(keeperName && { name: keeperName }),
          ...(keeperMobile !== undefined && { mobile: keeperMobile }),
          ...(keeperAvatarUrl !== undefined && { avatarUrl: keeperAvatarUrl }),
        },
      });
    }

    sendSuccess(res, { shop: updatedShop }, 'Shop profile and ambience images updated successfully', 200);
  } catch (error) {
    next(error);
  }
});

export default router;
