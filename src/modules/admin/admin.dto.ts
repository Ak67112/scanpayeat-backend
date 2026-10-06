import { z } from 'zod';

export const createShopSchema = z.object({
  name: z.string().min(2, 'Shop name must be at least 2 characters'),
  slug: z
    .string()
    .min(2)
    .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
  subdomain: z
    .string()
    .min(2)
    .regex(/^[a-z0-9-]+$/, 'Subdomain must be lowercase alphanumeric with hyphens'),
  address: z.string().optional(),
  phone: z.string().optional(),
});

export const updateShopSchema = z.object({
  name: z.string().min(2).optional(),
  slug: z
    .string()
    .min(2)
    .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens')
    .optional(),
  subdomain: z
    .string()
    .min(2)
    .regex(/^[a-z0-9-]+$/, 'Subdomain must be lowercase alphanumeric with hyphens')
    .optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  isActive: z.boolean().optional(),
});

export const updateShopStatusSchema = z.object({
  isActive: z.boolean(),
});

export const createShopkeeperSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  mobile: z.string().regex(/^[0-9]{10}$/, 'Mobile must be a 10-digit number').optional(),
  shopId: z.number().int().positive('shopId must be a positive integer'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export const updateShopkeeperSchema = z.object({
  name: z.string().min(2).optional(),
  email: z.string().email().optional(),
  mobile: z.string().regex(/^[0-9]{10}$/).optional(),
  password: z.string().min(6).optional(),
  shopId: z.number().int().positive().optional(),
  isActive: z.boolean().optional(),
});

export const updateShopkeeperStatusSchema = z.object({
  isActive: z.boolean(),
});

export type CreateShopDto = z.infer<typeof createShopSchema>;
export type UpdateShopDto = z.infer<typeof updateShopSchema>;
export type CreateShopkeeperDto = z.infer<typeof createShopkeeperSchema>;
export type UpdateShopkeeperDto = z.infer<typeof updateShopkeeperSchema>;
