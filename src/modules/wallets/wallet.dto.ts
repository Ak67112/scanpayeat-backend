import { z } from 'zod';

export const adminCreditWalletSchema = z.object({
  amount: z
    .number({ required_error: 'Credit amount is required' })
    .positive('Credit amount must be greater than zero')
    .max(1000000, 'Credit amount exceeds single transaction maximum (₹10,00,000)'),
  reference: z.string().optional(),
  notes: z.string().optional(),
  idempotencyKey: z.string().optional(),
});

export const adminDebitWalletSchema = z.object({
  amount: z
    .number({ required_error: 'Debit amount is required' })
    .positive('Debit amount must be greater than zero')
    .max(1000000, 'Debit amount exceeds single transaction maximum (₹10,00,000)'),
  reference: z.string().optional(),
  notes: z.string().optional(),
  idempotencyKey: z.string().optional(),
});

export const setWalletLimitSchema = z.object({
  minWalletLimit: z
    .number({ required_error: 'Minimum wallet limit is required' })
    .min(0, 'Minimum wallet limit cannot be negative'),
});

export const updateQrStatusSchema = z.object({
  isQrEnabled: z.boolean({ required_error: 'isQrEnabled boolean flag is required' }),
});

export type AdminCreditWalletDto = z.infer<typeof adminCreditWalletSchema>;
export type AdminDebitWalletDto = z.infer<typeof adminDebitWalletSchema>;
export type SetWalletLimitDto = z.infer<typeof setWalletLimitSchema>;
export type UpdateQrStatusDto = z.infer<typeof updateQrStatusSchema>;
