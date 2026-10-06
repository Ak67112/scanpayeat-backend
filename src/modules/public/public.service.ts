import { prisma } from '../../config/database';
import { AppError } from '../../middleware/error.middleware';

export class PublicService {
  /**
   * Get public shop information by slug or subdomain
   */
  async getShopBySlug(slug: string) {
    const normalizedSlug = slug.toLowerCase().trim();

    const shop = await prisma.shop.findFirst({
      where: {
        OR: [{ slug: normalizedSlug }, { subdomain: normalizedSlug }],
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        subdomain: true,
        address: true,
        phone: true,
        qrUrl: true,
        createdAt: true,
      },
    });

    if (!shop) {
      throw new AppError('Shop not found or currently inactive.', 404);
    }

    return shop;
  }

  /**
   * Get full public menu (categories and available products) for a shop
   */
  async getShopMenu(slug: string) {
    const shop = await this.getShopBySlug(slug);

    const categories = await prisma.category.findMany({
      where: {
        shopId: shop.id,
        isActive: true,
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    const products = await prisma.product.findMany({
      where: {
        shopId: shop.id,
        isAvailable: true,
      },
      orderBy: { name: 'asc' },
    });

    return {
      shop,
      categories,
      products: products.map((p) => ({
        ...p,
        price: Number(p.price),
      })),
    };
  }
}

export const publicService = new PublicService();
