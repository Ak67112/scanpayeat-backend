import { prisma } from '../../config/database';
import { AppError } from '../../middleware/error.middleware';
import { CreateCategoryDto, UpdateCategoryDto } from './category.dto';

export class CategoryService {
  async createCategory(shopId: number, dto: CreateCategoryDto) {
    const existing = await prisma.category.findUnique({
      where: {
        shopId_name: {
          shopId,
          name: dto.name,
        },
      },
    });

    if (existing) {
      throw new AppError('A category with this name already exists in your shop.', 409);
    }

    return prisma.category.create({
      data: {
        shopId,
        name: dto.name,
        description: dto.description,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
  }

  async getCategories(shopId: number) {
    return prisma.category.findMany({
      where: { shopId },
      include: {
        _count: {
          select: { products: true },
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async updateCategory(shopId: number, id: number, dto: UpdateCategoryDto) {
    const category = await prisma.category.findFirst({
      where: { id, shopId },
    });

    if (!category) {
      throw new AppError('Category not found or does not belong to your shop.', 404);
    }

    if (dto.name && dto.name !== category.name) {
      const existing = await prisma.category.findUnique({
        where: { shopId_name: { shopId, name: dto.name } },
      });
      if (existing) {
        throw new AppError('A category with this name already exists in your shop.', 409);
      }
    }

    return prisma.category.update({
      where: { id },
      data: dto,
    });
  }

  async deleteCategory(shopId: number, id: number) {
    const category = await prisma.category.findFirst({
      where: { id, shopId },
      include: {
        products: { select: { id: true } },
      },
    });

    if (!category) {
      throw new AppError('Category not found or does not belong to your shop.', 404);
    }

    const prodIds = category.products.map((p) => p.id);
    const orderItemsCount =
      prodIds.length > 0
        ? await prisma.orderItem.count({ where: { productId: { in: prodIds } } })
        : 0;

    if (orderItemsCount > 0) {
      // Deactivate rather than hard deleting to preserve order integrity
      await prisma.product.updateMany({
        where: { categoryId: id },
        data: { isAvailable: false },
      });
      await prisma.category.update({
        where: { id },
        data: { isActive: false },
      });
      return { message: 'Category contains items linked to orders, so it was deactivated.' };
    }

    await prisma.product.deleteMany({ where: { categoryId: id } });
    await prisma.category.delete({ where: { id } });

    return { message: 'Category deleted successfully' };
  }
}

export const categoryService = new CategoryService();
