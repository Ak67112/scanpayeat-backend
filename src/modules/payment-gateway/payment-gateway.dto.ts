import { z } from 'zod';

export const updatePaymentGatewaySchema = z.object({
  keyId: z.string().min(5, 'Gateway Key ID must be at least 5 characters'),
  keySecret: z.string().optional(),
  webhookSecret: z.string().optional(),
  environment: z.enum(['TEST', 'LIVE']).default('TEST'),
  currency: z.string().default('INR'),
  platformFeeType: z.enum(['PERCENT', 'FIXED']).default('PERCENT'),
  platformFeeValue: z.number().min(0, 'Platform fee cannot be negative').default(2.0),
  isActive: z.boolean().default(true),
});

export const testGatewayConnectionSchema = z.object({
  keyId: z.string().optional(),
  keySecret: z.string().optional(),
  environment: z.enum(['TEST', 'LIVE']).optional(),
});

export type UpdatePaymentGatewayDto = z.infer<typeof updatePaymentGatewaySchema>;
export type TestGatewayConnectionDto = z.infer<typeof testGatewayConnectionSchema>;
