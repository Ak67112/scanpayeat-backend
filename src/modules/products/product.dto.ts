import { z } from 'zod';

export const createProductSchema = z.object({
  categoryId: z.number().int().positive('categoryId must be a positive integer'),
  name: z.string().min(1, 'Product name is required').max(150),
  description: z.string().optional(),
  price: z.number().positive('Price must be greater than 0'),
  imageUrl: z.string().url('Invalid image URL').optional().or(z.literal('')),
  isAvailable: z.boolean().default(true),
});

export const updateProductSchema = z.object({
  categoryId: z.number().int().positive().optional(),
  name: z.string().min(1).max(150).optional(),
  description: z.string().optional(),
  price: z.number().positive().optional(),
  imageUrl: z.string().url().optional().or(z.literal('')),
  isAvailable: z.boolean().optional(),
});

export const updateProductAvailabilitySchema = z.object({
  isAvailable: z.boolean(),
});

export type CreateProductDto = z.infer<typeof createProductSchema>;
export type UpdateProductDto = z.infer<typeof updateProductSchema>;
export type UpdateProductAvailabilityDto = z.infer<typeof updateProductAvailabilitySchema>;
