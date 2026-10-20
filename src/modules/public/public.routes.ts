import { Router } from 'express';
import { publicController } from './public.controller';
import { orderController } from '../orders/order.controller';

const router = Router();

// Public routes accessible without authentication
import { upload, uploadImageToStorage } from '../../utils/uploader';
import { sendSuccess } from '../../utils/response';
import { AppError } from '../../middleware/error.middleware';

router.get('/shops/:slug', publicController.getShop);
router.get('/shops/:slug/menu', publicController.getMenu);
router.get('/shops/:slug/coupons', orderController.getPublicShopCoupons);
router.get('/discount-check', orderController.checkDiscounts);

// General public upload endpoint
router.post(
  '/upload',
  upload.single('image'),
  async (req, res, next) => {
    try {
      if (!req.file) {
        throw new AppError('No image file provided', 400);
      }
      const imageUrl = await uploadImageToStorage(
        req.file.buffer,
        `${Date.now()}_${req.file.originalname}`,
        'scanpayeat/uploads'
      );
      sendSuccess(res, { imageUrl }, 'Image uploaded successfully', 200);
    } catch (error) {
      next(error);
    }
  }
);

// Restaurant partner onboarding enquiry endpoint
router.post('/partner-enquiry', async (req, res, next) => {
  try {
    const {
      restaurantName,
      contactName,
      mobile,
      email,
      city,
      state,
      outletType,
      estimatedTables,
      message,
    } = req.body;

    if (!restaurantName || !contactName || !mobile) {
      throw new AppError('Restaurant name, contact person name, and mobile number are required.', 400);
    }

    console.log('📬 NEW RESTAURANT PARTNER ENQUIRY RECEIVED:', {
      restaurantName,
      contactName,
      mobile,
      email,
      city,
      state,
      outletType,
      estimatedTables,
      message,
      receivedAt: new Date().toISOString(),
    });

    sendSuccess(
      res,
      {
        received: true,
        referenceId: `ENQ-${Date.now().toString().slice(-6)}`,
        supportEmail: 'contact@hotelkada.com',
      },
      'Thank you! Your restaurant partnership enquiry has been received. Our team will contact you shortly.',
      201
    );
  } catch (error) {
    next(error);
  }
});

export default router;

