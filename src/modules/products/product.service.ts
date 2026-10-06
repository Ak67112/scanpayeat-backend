import { prisma } from '../../config/database';
import { AppError } from '../../middleware/error.middleware';
import {
  CreateProductDto,
  UpdateProductDto,
  UpdateProductAvailabilityDto,
} from './product.dto';

export class ProductService {
  async createProduct(shopId: number, dto: CreateProductDto) {
    // Validate that category belongs to this shop
    const category = await prisma.category.findFirst({
      where: { id: dto.categoryId, shopId },
    });

    if (!category) {
      throw new AppError('Category not found or does not belong to your shop.', 404);
    }

    return prisma.product.create({
      data: {
        shopId,
        categoryId: dto.categoryId,
        name: dto.name,
        description: dto.description,
        price: dto.price,
        imageUrl: dto.imageUrl || null,
        isAvailable: dto.isAvailable ?? true,
      },
      include: {
        category: {
          select: { id: true, name: true },
        },
      },
    });
  }

  async getProducts(
    shopId: number,
    params: { categoryId?: number; isAvailable?: boolean; search?: string }
  ) {
    const where: any = { shopId };

    if (params.categoryId) {
      where.categoryId = params.categoryId;
    }
    if (params.isAvailable !== undefined) {
      where.isAvailable = params.isAvailable;
    }
    if (params.search) {
      where.name = { contains: params.search, mode: 'insensitive' };
    }

    return prisma.product.findMany({
      where,
      include: {
        category: {
          select: { id: true, name: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getProductById(shopId: number, id: number) {
    const product = await prisma.product.findFirst({
      where: { id, shopId },
      include: {
        category: {
          select: { id: true, name: true },
        },
      },
    });

    if (!product) {
      throw new AppError('Product not found or does not belong to your shop.', 404);
    }

    return product;
  }

  async updateProduct(shopId: number, id: number, dto: UpdateProductDto) {
    const product = await prisma.product.findFirst({
      where: { id, shopId },
    });

    if (!product) {
      throw new AppError('Product not found or does not belong to your shop.', 404);
    }

    if (dto.categoryId && dto.categoryId !== product.categoryId) {
      const category = await prisma.category.findFirst({
        where: { id: dto.categoryId, shopId },
      });
      if (!category) {
        throw new AppError('Target category not found or does not belong to your shop.', 404);
      }
    }

    return prisma.product.update({
      where: { id },
      data: {
        ...dto,
        ...(dto.price !== undefined ? { price: dto.price } : {}),
      },
      include: {
        category: {
          select: { id: true, name: true },
        },
      },
    });
  }

  async updateProductAvailability(
    shopId: number,
    id: number,
    dto: UpdateProductAvailabilityDto
  ) {
    const product = await prisma.product.findFirst({
      where: { id, shopId },
    });

    if (!product) {
      throw new AppError('Product not found or does not belong to your shop.', 404);
    }

    return prisma.product.update({
      where: { id },
      data: { isAvailable: dto.isAvailable },
      include: {
        category: {
          select: { id: true, name: true },
        },
      },
    });
  }

  async deleteProduct(shopId: number, id: number) {
    const product = await prisma.product.findFirst({
      where: { id, shopId },
    });

    if (!product) {
      throw new AppError('Product not found or does not belong to your shop.', 404);
    }

    const orderCount = await prisma.orderItem.count({
      where: { productId: id },
    });

    if (orderCount > 0) {
      // Archive/deactivate so existing customer receipts are preserved
      await prisma.product.update({
        where: { id },
        data: { isAvailable: false },
      });
      return { message: 'Product is referenced in customer orders, so it was marked unavailable.' };
    }

    await prisma.product.delete({
      where: { id },
    });

    return { message: 'Product deleted successfully' };
  }
}

export const productService = new ProductService();
