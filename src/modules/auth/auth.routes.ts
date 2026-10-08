import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authController } from './auth.controller';
import { validateRequest } from '../../middleware/validate.middleware';
import { authenticate } from '../../middleware/auth.middleware';
import {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from './auth.dto';

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // Limit each IP to 30 requests per 15 minutes
  message: {
    success: false,
    message: 'Too many authentication attempts, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const router = Router();

router.post(
  '/register',
  authLimiter,
  validateRequest({ body: registerSchema }),
  authController.register
);

router.post(
  '/login',
  authLimiter,
  validateRequest({ body: loginSchema }),
  authController.login
);

router.post(
  '/refresh',
  validateRequest({ body: refreshTokenSchema }),
  authController.refresh
);

router.post('/logout', authController.logout);

router.post(
  '/forgot-password',
  validateRequest({ body: forgotPasswordSchema }),
  authController.forgotPassword
);

router.post(
  '/reset-password',
  validateRequest({ body: resetPasswordSchema }),
  authController.resetPassword
);

router.get('/me', authenticate, authController.getMe);

import { upload, uploadImageToStorage } from '../../utils/uploader';
import { sendSuccess } from '../../utils/response';
import { AppError } from '../../middleware/error.middleware';

// Public image upload for profile avatars / registration
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
        `avatar_${Date.now()}_${req.file.originalname}`,
        'scanpayeat/avatars'
      );
      sendSuccess(res, { imageUrl }, 'Image uploaded successfully', 200);
    } catch (error) {
      next(error);
    }
  }
);

export default router;
