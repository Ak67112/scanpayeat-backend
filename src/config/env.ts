import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

// If CLOUDINARY_URL is empty string, remove it so cloudinary doesn't throw on import
if (!process.env.CLOUDINARY_URL || process.env.CLOUDINARY_URL.trim() === '') {
  delete process.env.CLOUDINARY_URL;
}

const envSchema = z.object({
  PORT: z.string().default('5000').transform((val) => parseInt(val, 10)),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  JWT_ACCESS_SECRET: z.string().min(16, 'JWT_ACCESS_SECRET must be at least 16 chars'),
  JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET must be at least 16 chars'),
  JWT_ACCESS_EXPIRY: z.string().default('24h'),
  JWT_REFRESH_EXPIRY: z.string().default('30d'),

  RAZORPAY_KEY_ID: z.string().default('rzp_test_placeholder'),
  RAZORPAY_KEY_SECRET: z.string().default('rzp_test_secret_placeholder'),
  RAZORPAY_WEBHOOK_SECRET: z.string().default('rzp_webhook_secret_placeholder'),

  COOKIE_DOMAIN: z.string().default('localhost'),
  FRONTEND_URL: z.string().default('http://localhost:3000'),

  CLOUDINARY_CLOUD_NAME: z.string().optional().default(''),
  CLOUDINARY_API_KEY: z.string().optional().default(''),
  CLOUDINARY_API_SECRET: z.string().optional().default(''),
  CLOUDINARY_URL: z.string().optional().default(''),
});

const _env = envSchema.safeParse(process.env);

if (!_env.success) {
  console.error('❌ Invalid environment variables:', _env.error.format());
  // In development, provide fallback defaults if DATABASE_URL is not set yet
  if (process.env.NODE_ENV !== 'production') {
    console.warn('⚠️ Warning: Using fallback configuration for development/testing.');
  }
}

export const env = _env.success
  ? _env.data
  : {
      PORT: parseInt(process.env.PORT || '5000', 10),
      NODE_ENV: (process.env.NODE_ENV || 'development') as 'development' | 'test' | 'production',
      DATABASE_URL: process.env.DATABASE_URL || 'postgresql://user:password@localhost:5432/scanpayeat?sslmode=prefer',
      JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET || 'super_secret_access_jwt_key_scanpayeat_32_chars_min',
      JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || 'super_secret_refresh_jwt_key_scanpayeat_32_chars_min',
      JWT_ACCESS_EXPIRY: process.env.JWT_ACCESS_EXPIRY || '24h',
      JWT_REFRESH_EXPIRY: process.env.JWT_REFRESH_EXPIRY || '30d',
      RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID || 'rzp_test_placeholder',
      RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET || 'rzp_test_secret_placeholder',
      RAZORPAY_WEBHOOK_SECRET: process.env.RAZORPAY_WEBHOOK_SECRET || 'rzp_webhook_secret_placeholder',
      COOKIE_DOMAIN: process.env.COOKIE_DOMAIN || 'localhost',
      FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:3000',
      CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME || '',
      CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY || '',
      CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET || '',
      CLOUDINARY_URL: process.env.CLOUDINARY_URL || '',
    };
