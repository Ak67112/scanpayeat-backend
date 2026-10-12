import { prisma } from '../../config/database';
import { env } from '../../config/env';
import {
  encryptSecret,
  decryptSecret,
  maskSecret,
} from '../../utils/encryption';
import {
  invalidateGatewayCache,
  getActiveGatewayCredentials,
} from '../../config/razorpay';
import {
  UpdatePaymentGatewayDto,
  TestGatewayConnectionDto,
} from './payment-gateway.dto';
import Razorpay from 'razorpay';
import { Prisma } from '@prisma/client';
import { AppError } from '../../middleware/error.middleware';

export class PaymentGatewayService {
  /**
   * Get current Payment Gateway configuration with masked secrets
   */
  async getSettings() {
    let setting = await prisma.paymentGatewaySetting.findFirst({
      orderBy: { updatedAt: 'desc' },
    });

    if (!setting) {
      // Auto-create default from env if none exists
      setting = await prisma.paymentGatewaySetting.create({
        data: {
          provider: 'RAZORPAY',
          keyId: env.RAZORPAY_KEY_ID || 'rzp_test_T1r1kA5pHql9g7',
          keySecret: encryptSecret(env.RAZORPAY_KEY_SECRET || 'eZVwVdLc1rYYZxs6hnwPOetg'),
          webhookSecret: encryptSecret(env.RAZORPAY_WEBHOOK_SECRET || 'sample_webhook_secret'),
          environment: 'TEST',
          currency: 'INR',
          platformFeeType: 'PERCENT',
          platformFeeValue: new Prisma.Decimal(2.0),
          isActive: true,
        },
      });
    }

    return {
      id: setting.id,
      provider: setting.provider,
      keyId: setting.keyId,
      keySecretMasked: maskSecret(setting.keySecret),
      webhookSecretMasked: maskSecret(setting.webhookSecret),
      isKeySecretSet: !!setting.keySecret,
      isWebhookSecretSet: !!setting.webhookSecret,
      environment: setting.environment,
      currency: setting.currency,
      platformFeeType: setting.platformFeeType,
      platformFeeValue: Number(setting.platformFeeValue),
      isActive: setting.isActive,
      updatedAt: setting.updatedAt,
    };
  }

  /**
   * Save / update Payment Gateway configuration
   */
  async updateSettings(adminId: number, dto: UpdatePaymentGatewayDto) {
    const existing = await prisma.paymentGatewaySetting.findFirst({
      orderBy: { updatedAt: 'desc' },
    });

    let encryptedKeySecret: string | undefined;
    if (dto.keySecret && !dto.keySecret.startsWith('••••')) {
      encryptedKeySecret = encryptSecret(dto.keySecret.trim());
    }

    let encryptedWebhookSecret: string | undefined;
    if (dto.webhookSecret && !dto.webhookSecret.startsWith('••••')) {
      encryptedWebhookSecret = encryptSecret(dto.webhookSecret.trim());
    }

    let updated;
    if (existing) {
      updated = await prisma.paymentGatewaySetting.update({
        where: { id: existing.id },
        data: {
          keyId: dto.keyId.trim(),
          ...(encryptedKeySecret ? { keySecret: encryptedKeySecret } : {}),
          ...(encryptedWebhookSecret ? { webhookSecret: encryptedWebhookSecret } : {}),
          environment: dto.environment,
          currency: dto.currency.toUpperCase(),
          platformFeeType: dto.platformFeeType,
          platformFeeValue: new Prisma.Decimal(dto.platformFeeValue),
          isActive: dto.isActive,
          updatedByAdminId: adminId,
        },
      });
    } else {
      if (!encryptedKeySecret) {
        encryptedKeySecret = encryptSecret(env.RAZORPAY_KEY_SECRET);
      }
      updated = await prisma.paymentGatewaySetting.create({
        data: {
          provider: 'RAZORPAY',
          keyId: dto.keyId.trim(),
          keySecret: encryptedKeySecret,
          webhookSecret: encryptedWebhookSecret || encryptSecret(env.RAZORPAY_WEBHOOK_SECRET),
          environment: dto.environment,
          currency: dto.currency.toUpperCase(),
          platformFeeType: dto.platformFeeType,
          platformFeeValue: new Prisma.Decimal(dto.platformFeeValue),
          isActive: dto.isActive,
          updatedByAdminId: adminId,
        },
      });
    }

    // Invalidate cached credentials in memory
    invalidateGatewayCache();

    return {
      id: updated.id,
      provider: updated.provider,
      keyId: updated.keyId,
      keySecretMasked: maskSecret(updated.keySecret),
      webhookSecretMasked: maskSecret(updated.webhookSecret),
      isKeySecretSet: !!updated.keySecret,
      isWebhookSecretSet: !!updated.webhookSecret,
      environment: updated.environment,
      currency: updated.currency,
      platformFeeType: updated.platformFeeType,
      platformFeeValue: Number(updated.platformFeeValue),
      isActive: updated.isActive,
      updatedAt: updated.updatedAt,
    };
  }

  /**
   * Test Razorpay connectivity with specified or current credentials
   */
  async testConnection(dto: TestGatewayConnectionDto) {
    let keyId = dto.keyId?.trim();
    let keySecret = dto.keySecret?.trim();

    // If keySecret is masked or omitted, load active secret from DB
    if (!keySecret || keySecret.startsWith('••••') || !keyId) {
      const active = await getActiveGatewayCredentials();
      keyId = keyId || active.keyId;
      keySecret = (keySecret && !keySecret.startsWith('••••')) ? keySecret : active.keySecret;
    }

    if (!keyId || !keySecret) {
      throw new AppError('Both Key ID and Key Secret are required to test connection.', 400);
    }

    try {
      const client = new Razorpay({
        key_id: keyId,
        key_secret: keySecret,
      });

      // Test API call to verify credentials
      await client.orders.all({ count: 1 });

      return {
        success: true,
        message: 'Razorpay credentials verified successfully. API connection established.',
        keyId,
        environment: dto.environment || (keyId.startsWith('rzp_live') ? 'LIVE' : 'TEST'),
      };
    } catch (err: any) {
      const errMsg = err?.error?.description || err?.message || 'Razorpay authentication failed.';
      return {
        success: false,
        message: `Connection test failed: ${errMsg}`,
        error: errMsg,
      };
    }
  }
}

export const paymentGatewayService = new PaymentGatewayService();
