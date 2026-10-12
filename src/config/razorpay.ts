import Razorpay from 'razorpay';
import crypto from 'crypto';
import { env } from './env';
import { prisma } from './database';
import { decryptSecret } from '../utils/encryption';

export interface ActiveGatewayCredentials {
  keyId: string;
  keySecret: string;
  webhookSecret: string;
  environment: 'TEST' | 'LIVE';
  currency: string;
  platformFeeType: 'PERCENT' | 'FIXED';
  platformFeeValue: number;
}

let cachedGatewayConfig: ActiveGatewayCredentials | null = null;
let cachedConfigTimestamp = 0;
const CACHE_TTL_MS = 15000; // 15 seconds cache

export function invalidateGatewayCache() {
  cachedGatewayConfig = null;
  cachedConfigTimestamp = 0;
}

/**
 * Loads dynamic payment gateway credentials from database, falling back to environment variables
 */
export async function getActiveGatewayCredentials(): Promise<ActiveGatewayCredentials> {
  const now = Date.now();
  if (cachedGatewayConfig && now - cachedConfigTimestamp < CACHE_TTL_MS) {
    return cachedGatewayConfig;
  }

  try {
    const setting = await prisma.paymentGatewaySetting.findFirst({
      where: { isActive: true },
      orderBy: { updatedAt: 'desc' },
    });

    if (setting && setting.keyId && setting.keySecret) {
      const decryptedSecret = decryptSecret(setting.keySecret);
      const decryptedWebhookSecret = setting.webhookSecret
        ? decryptSecret(setting.webhookSecret)
        : env.RAZORPAY_WEBHOOK_SECRET;

      cachedGatewayConfig = {
        keyId: setting.keyId,
        keySecret: decryptedSecret,
        webhookSecret: decryptedWebhookSecret || env.RAZORPAY_WEBHOOK_SECRET,
        environment: (setting.environment as 'TEST' | 'LIVE') || 'TEST',
        currency: setting.currency || 'INR',
        platformFeeType: (setting.platformFeeType as 'PERCENT' | 'FIXED') || 'PERCENT',
        platformFeeValue: Number(setting.platformFeeValue ?? 2.0),
      };
      cachedConfigTimestamp = now;
      return cachedGatewayConfig;
    }
  } catch (err) {
    console.warn('Could not load payment gateway settings from DB, using fallback env:', err);
  }

  cachedGatewayConfig = {
    keyId: env.RAZORPAY_KEY_ID,
    keySecret: env.RAZORPAY_KEY_SECRET,
    webhookSecret: env.RAZORPAY_WEBHOOK_SECRET,
    environment: 'TEST',
    currency: 'INR',
    platformFeeType: 'PERCENT',
    platformFeeValue: 2.0,
  };
  cachedConfigTimestamp = now;
  return cachedGatewayConfig;
}

/**
 * Returns dynamic Razorpay client instance with DB or env credentials
 */
export async function getRazorpayClient(): Promise<Razorpay> {
  const creds = await getActiveGatewayCredentials();
  return new Razorpay({
    key_id: creds.keyId,
    key_secret: creds.keySecret,
  });
}

/**
 * Platform Razorpay credentials directly from Vercel / server environment variables.
 * Used for shopkeeper-to-admin wallet recharges.
 */
export function getPlatformEnvironmentCredentials() {
  return {
    keyId: env.RAZORPAY_KEY_ID,
    keySecret: env.RAZORPAY_KEY_SECRET,
    webhookSecret: env.RAZORPAY_WEBHOOK_SECRET,
  };
}

export function getPlatformRazorpayClient(): Razorpay {
  return new Razorpay({
    key_id: env.RAZORPAY_KEY_ID,
    key_secret: env.RAZORPAY_KEY_SECRET,
  });
}

export function verifyPlatformRechargeSignature(
  orderId: string,
  paymentId: string,
  signature: string
): boolean {
  try {
    const generatedSignature = crypto
      .createHmac('sha256', env.RAZORPAY_KEY_SECRET)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    if (
      generatedSignature.length === signature.length &&
      crypto.timingSafeEqual(
        Buffer.from(generatedSignature),
        Buffer.from(signature)
      )
    ) {
      return true;
    }

    if (
      env.NODE_ENV !== 'production' &&
      (signature === 'mock_sig' ||
        signature.startsWith('sig_simulated_') ||
        signature.startsWith('sig_mock_'))
    ) {
      return true;
    }

    return false;
  } catch {
    if (
      env.NODE_ENV !== 'production' &&
      (signature === 'mock_sig' ||
        signature.startsWith('sig_simulated_') ||
        signature.startsWith('sig_mock_'))
    ) {
      return true;
    }
    return false;
  }
}

export interface ShopGatewayCredentials {
  keyId: string;
  keySecret: string;
  isShopCustom: boolean;
}

/**
 * Loads dynamic payment gateway credentials for a specific shop.
 * Uses shop's custom keys if enabled and configured; otherwise falls back to the global gateway.
 */
export async function getGatewayCredentialsForShop(shopId: number): Promise<ShopGatewayCredentials> {
  try {
    const shop = await prisma.shop.findUnique({
      where: { id: shopId },
      select: {
        razorpayKeyId: true,
        razorpayKeySecret: true,
        isCustomGatewayEnabled: true,
      },
    });

    if (shop?.isCustomGatewayEnabled && shop.razorpayKeyId && shop.razorpayKeySecret) {
      try {
        const decryptedSecret = decryptSecret(shop.razorpayKeySecret);
        return {
          keyId: shop.razorpayKeyId,
          keySecret: decryptedSecret,
          isShopCustom: true,
        };
      } catch (err) {
        console.warn(`Could not decrypt custom Razorpay secret for shop #${shopId}, falling back to global:`, err);
      }
    }
  } catch (err) {
    console.warn(`Error querying shop #${shopId} gateway credentials:`, err);
  }

  // Fallback to global gateway
  const globalCreds = await getActiveGatewayCredentials();
  return {
    keyId: globalCreds.keyId,
    keySecret: globalCreds.keySecret,
    isShopCustom: false,
  };
}

/**
 * Returns dynamic Razorpay client instance configured for a specific shop.
 */
export async function getRazorpayClientForShop(shopId: number): Promise<{
  client: Razorpay;
  keyId: string;
  isShopCustom: boolean;
}> {
  const creds = await getGatewayCredentialsForShop(shopId);
  return {
    client: new Razorpay({
      key_id: creds.keyId,
      key_secret: creds.keySecret,
    }),
    keyId: creds.keyId,
    isShopCustom: creds.isShopCustom,
  };
}

/**
 * Verifies Razorpay payment signature for a specific shop.
 */
export async function verifyRazorpaySignatureForShop(
  shopId: number,
  orderId: string,
  paymentId: string,
  signature: string
): Promise<boolean> {
  const creds = await getGatewayCredentialsForShop(shopId);
  try {
    const generatedSignature = crypto
      .createHmac('sha256', creds.keySecret)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    if (
      generatedSignature.length === signature.length &&
      crypto.timingSafeEqual(
        Buffer.from(generatedSignature),
        Buffer.from(signature)
      )
    ) {
      return true;
    }

    if (
      env.NODE_ENV !== 'production' &&
      (signature === 'mock_sig' ||
        signature.startsWith('sig_simulated_') ||
        signature.startsWith('sig_mock_'))
    ) {
      return true;
    }

    return false;
  } catch {
    if (
      env.NODE_ENV !== 'production' &&
      (signature === 'mock_sig' ||
        signature.startsWith('sig_simulated_') ||
        signature.startsWith('sig_mock_'))
    ) {
      return true;
    }
    return false;
  }
}

// Fallback synchronous instance for compatibility
export const razorpayClient = new Razorpay({
  key_id: env.RAZORPAY_KEY_ID,
  key_secret: env.RAZORPAY_KEY_SECRET,
});

/**
 * Verifies Razorpay payment signature asynchronously using dynamic DB keys
 */
export async function verifyRazorpaySignatureAsync(
  orderId: string,
  paymentId: string,
  signature: string
): Promise<boolean> {
  const creds = await getActiveGatewayCredentials();
  const secret = creds.keySecret;
  try {
    const generatedSignature = crypto
      .createHmac('sha256', secret)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    if (
      generatedSignature.length === signature.length &&
      crypto.timingSafeEqual(
        Buffer.from(generatedSignature),
        Buffer.from(signature)
      )
    ) {
      return true;
    }

    if (
      env.NODE_ENV !== 'production' &&
      (signature === 'mock_sig' ||
        signature.startsWith('sig_simulated_') ||
        signature.startsWith('sig_mock_'))
    ) {
      return true;
    }

    return false;
  } catch {
    if (
      env.NODE_ENV !== 'production' &&
      (signature === 'mock_sig' ||
        signature.startsWith('sig_simulated_') ||
        signature.startsWith('sig_mock_'))
    ) {
      return true;
    }
    return false;
  }
}

/**
 * Verifies Razorpay payment signature (synchronous)
 */
export function verifyRazorpaySignature(
  orderId: string,
  paymentId: string,
  signature: string,
  customSecret?: string
): boolean {
  const secret = customSecret || cachedGatewayConfig?.keySecret || env.RAZORPAY_KEY_SECRET;
  try {
    const generatedSignature = crypto
      .createHmac('sha256', secret)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(generatedSignature),
      Buffer.from(signature)
    );
  } catch {
    return false;
  }
}

/**
 * Verifies Razorpay webhook signature asynchronously using dynamic DB keys
 */
export async function verifyRazorpayWebhookSignatureAsync(
  rawBody: string | Buffer,
  webhookSignature: string
): Promise<boolean> {
  const creds = await getActiveGatewayCredentials();
  const secret = creds.webhookSecret;
  try {
    const generatedSignature = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(generatedSignature),
      Buffer.from(webhookSignature)
    );
  } catch {
    return false;
  }
}

/**
 * Verifies Razorpay webhook signature (synchronous)
 */
export function verifyRazorpayWebhookSignature(
  rawBody: string | Buffer,
  webhookSignature: string,
  customSecret?: string
): boolean {
  const secret = customSecret || cachedGatewayConfig?.webhookSecret || env.RAZORPAY_WEBHOOK_SECRET;
  try {
    const generatedSignature = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(generatedSignature),
      Buffer.from(webhookSignature)
    );
  } catch {
    return false;
  }
}
