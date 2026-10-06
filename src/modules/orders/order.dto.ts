import { z } from 'zod';
import { OrderStatus } from '@prisma/client';

export const checkoutItemSchema = z.object({
  productId: z.number().int().positive('productId must be a positive integer'),
  quantity: z.number().int().min(1, 'Quantity must be at least 1'),
});

export const checkoutSchema = z
  .object({
    shopId: z.number().int().positive().optional(),
    shopSlug: z.string().optional(),
    items: z.array(checkoutItemSchema).min(1, 'Order must contain at least 1 item'),
    customerName: z.string().optional(),
    customerPhone: z.string().optional(),
    notes: z.string().optional(),
  })
  .refine((data) => data.shopId !== undefined || data.shopSlug !== undefined, {
    message: 'Either shopId or shopSlug must be provided',
  });

export const updateOrderStatusSchema = z.object({
  status: z.nativeEnum(OrderStatus),
  notes: z.string().optional(),
});

export type CheckoutDto = z.infer<typeof checkoutSchema>;
export type UpdateOrderStatusDto = z.infer<typeof updateOrderStatusSchema>;
