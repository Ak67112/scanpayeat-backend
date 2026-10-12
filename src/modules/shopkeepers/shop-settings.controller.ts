import { Request, Response, NextFunction } from 'express';
import Razorpay from 'razorpay';
import { prisma } from '../../config/database';
import { encryptSecret, decryptSecret, maskSecret } from '../../utils/encryption';
import { sendSuccess } from '../../utils/response';
import { AppError } from '../../middleware/error.middleware';
import { Prisma } from '@prisma/client';

export class ShopSettingsController {
  /**
   * Shopkeeper: Get custom Razorpay gateway settings
   */
  async getGatewaySettings(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const shopId = req.shopId;
      if (!shopId) {
        throw new AppError('Shop association not found.', 400);
      }

      const shop = await prisma.shop.findUnique({
        where: { id: shopId },
        select: {
          razorpayKeyId: true,
          razorpayKeySecret: true,
          isCustomGatewayEnabled: true,
        },
      });

      if (!shop) {
        throw new AppError('Shop not found.', 404);
      }

      const isKeySecretSet = !!shop.razorpayKeySecret;
      let keySecretMasked = '';
      if (shop.razorpayKeySecret) {
        try {
          const decrypted = decryptSecret(shop.razorpayKeySecret);
          keySecretMasked = maskSecret(decrypted);
        } catch {
          keySecretMasked = '••••••••••••';
        }
      }

      sendSuccess(
        res,
        {
          keyId: shop.razorpayKeyId || '',
          keySecretMasked,
          isKeySecretSet,
          isCustomGatewayEnabled: shop.isCustomGatewayEnabled,
        },
        'Shopkeeper gateway settings retrieved'
      );
    } catch (err) {
      next(err);
    }
  }

  /**
   * Shopkeeper: Update custom Razorpay gateway settings
   */
  async updateGatewaySettings(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const shopId = req.shopId;
      if (!shopId) {
        throw new AppError('Shop association not found.', 400);
      }

      const { keyId, keySecret, isCustomGatewayEnabled } = req.body;

      const updateData: Prisma.ShopUpdateInput = {};

      if (keyId !== undefined) {
        updateData.razorpayKeyId = keyId ? String(keyId).trim() : null;
      }

      if (keySecret !== undefined && String(keySecret).trim() !== '') {
        const trimmedSecret = String(keySecret).trim();
        // Encrypt secret with AES-256-GCM
        updateData.razorpayKeySecret = encryptSecret(trimmedSecret);
      }

      if (isCustomGatewayEnabled !== undefined) {
        updateData.isCustomGatewayEnabled = Boolean(isCustomGatewayEnabled);
      }

      const updatedShop = await prisma.shop.update({
        where: { id: shopId },
        data: updateData,
        select: {
          razorpayKeyId: true,
          razorpayKeySecret: true,
          isCustomGatewayEnabled: true,
        },
      });

      let keySecretMasked = '';
      if (updatedShop.razorpayKeySecret) {
        try {
          const decrypted = decryptSecret(updatedShop.razorpayKeySecret);
          keySecretMasked = maskSecret(decrypted);
        } catch {
          keySecretMasked = '••••••••••••';
        }
      }

      sendSuccess(
        res,
        {
          keyId: updatedShop.razorpayKeyId || '',
          keySecretMasked,
          isKeySecretSet: !!updatedShop.razorpayKeySecret,
          isCustomGatewayEnabled: updatedShop.isCustomGatewayEnabled,
        },
        'Shopkeeper payment gateway settings updated successfully'
      );
    } catch (err) {
      next(err);
    }
  }

  /**
   * Shopkeeper: Test Razorpay credentials connection
   */
  async testGatewayConnection(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const shopId = req.shopId;
      if (!shopId) {
        throw new AppError('Shop association not found.', 400);
      }

      const { keyId, keySecret } = req.body;

      let testKeyId = keyId;
      let testKeySecret = keySecret;

      // If credentials not provided in body, load from shop database
      if (!testKeyId || !testKeySecret) {
        const shop = await prisma.shop.findUnique({
          where: { id: shopId },
          select: {
            razorpayKeyId: true,
            razorpayKeySecret: true,
          },
        });

        if (!shop || !shop.razorpayKeyId || !shop.razorpayKeySecret) {
          throw new AppError('No saved Razorpay credentials found to test. Please enter Key ID and Secret.', 400);
        }

        testKeyId = shop.razorpayKeyId;
        testKeySecret = decryptSecret(shop.razorpayKeySecret);
      }

      const rzpInstance = new Razorpay({
        key_id: testKeyId,
        key_secret: testKeySecret,
      });

      // Probe API with count=1
      await rzpInstance.orders.all({ count: 1 });

      sendSuccess(
        res,
        { success: true, message: 'Razorpay credentials verified successfully! Connection test passed.' },
        'Razorpay credentials verified successfully'
      );
    } catch (err: any) {
      const msg = err?.error?.description || err?.message || 'Razorpay connection test failed';
      throw new AppError(`Razorpay authentication failed: ${msg}`, 400);
    }
  }

  /**
   * Shopkeeper: Get tax (GST) settings
   */
  async getTaxSettings(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const shopId = req.shopId;
      if (!shopId) {
        throw new AppError('Shop association not found.', 400);
      }

      const shop = await prisma.shop.findUnique({
        where: { id: shopId },
        select: {
          gstEnabled: true,
          cgstRate: true,
          sgstRate: true,
          gstNumber: true,
        },
      });

      if (!shop) {
        throw new AppError('Shop not found.', 404);
      }

      const cgst = Number(shop.cgstRate ?? 2.5);
      const sgst = Number(shop.sgstRate ?? 2.5);

      sendSuccess(
        res,
        {
          gstEnabled: shop.gstEnabled,
          cgstRate: cgst,
          sgstRate: sgst,
          totalGstRate: Math.round((cgst + sgst) * 100) / 100,
          gstNumber: shop.gstNumber || '',
        },
        'Shop tax settings retrieved successfully'
      );
    } catch (err) {
      next(err);
    }
  }

  /**
   * Shopkeeper: Update tax (GST) settings
   */
  async updateTaxSettings(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const shopId = req.shopId;
      if (!shopId) {
        throw new AppError('Shop association not found.', 400);
      }

      const { gstEnabled, cgstRate, sgstRate, gstNumber } = req.body;

      const updateData: Prisma.ShopUpdateInput = {};

      if (gstEnabled !== undefined) {
        updateData.gstEnabled = Boolean(gstEnabled);
      }

      if (cgstRate !== undefined) {
        const numCgst = Number(cgstRate);
        if (isNaN(numCgst) || numCgst < 0 || numCgst > 50) {
          throw new AppError('CGST rate must be between 0% and 50%', 400);
        }
        updateData.cgstRate = new Prisma.Decimal(Math.round(numCgst * 100) / 100);
      }

      if (sgstRate !== undefined) {
        const numSgst = Number(sgstRate);
        if (isNaN(numSgst) || numSgst < 0 || numSgst > 50) {
          throw new AppError('SGST rate must be between 0% and 50%', 400);
        }
        updateData.sgstRate = new Prisma.Decimal(Math.round(numSgst * 100) / 100);
      }

      if (gstNumber !== undefined) {
        updateData.gstNumber = gstNumber ? String(gstNumber).trim().toUpperCase() : null;
      }

      const updatedShop = await prisma.shop.update({
        where: { id: shopId },
        data: updateData,
        select: {
          gstEnabled: true,
          cgstRate: true,
          sgstRate: true,
          gstNumber: true,
        },
      });

      const cgst = Number(updatedShop.cgstRate);
      const sgst = Number(updatedShop.sgstRate);

      sendSuccess(
        res,
        {
          gstEnabled: updatedShop.gstEnabled,
          cgstRate: cgst,
          sgstRate: sgst,
          totalGstRate: Math.round((cgst + sgst) * 100) / 100,
          gstNumber: updatedShop.gstNumber || '',
        },
        'Shop tax settings updated successfully'
      );
    } catch (err) {
      next(err);
    }
  }
}

export const shopSettingsController = new ShopSettingsController();
