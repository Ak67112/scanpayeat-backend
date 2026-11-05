import { prisma } from '../../config/database';
import { AppError } from '../../middleware/error.middleware';
import { walletService } from '../wallets/wallet.service';

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
        logoUrl: true,
        bannerUrl: true,
        description: true,
        ambienceImages: true,
        hasDining: true,
        tableCount: true,
        isOrderingEnabled: true,
        gstEnabled: true,
        cgstRate: true,
        sgstRate: true,
        gstNumber: true,
        createdAt: true,
        shopkeepers: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
          },
          take: 1,
        },
      },
    });

    if (!shop) {
      throw new AppError('Shop not found or currently inactive.', 404);
    }

    const qrStatus = await walletService.getShopQrStatus(shop.id);

    return {
      ...shop,
      isQrActive: qrStatus.isQrActive,
      qrClosedReason: qrStatus.reason,
    };
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

  /**
   * Record a QR scan event for a shop (Counter QR or Table QR)
   */
  async recordQrScan(data: {
    slug: string;
    tableNumber?: string | null;
    qrType?: string;
    token?: string;
    ipAddress?: string;
    userAgent?: string;
  }) {
    const shop = await this.getShopBySlug(data.slug);

    // Normalize table number: extract digit or keep as string
    let normalizedTable: string | null = null;
    if (data.tableNumber && data.tableNumber !== '0') {
      const match = String(data.tableNumber).match(/\d+/);
      normalizedTable = match ? match[0] : String(data.tableNumber).trim();
    }

    // Debounce duplicate scans from same IP & table within 45 seconds to avoid double-counting on quick page reloads
    if (data.ipAddress) {
      const recent = await prisma.qrScan.findFirst({
        where: {
          shopId: shop.id,
          tableNumber: normalizedTable,
          ipAddress: data.ipAddress,
          createdAt: {
            gte: new Date(Date.now() - 45 * 1000),
          },
        },
      });

      if (recent) {
        return {
          recorded: false,
          debounced: true,
          shopId: shop.id,
          tableNumber: normalizedTable,
        };
      }
    }

    const scan = await prisma.qrScan.create({
      data: {
        shopId: shop.id,
        tableNumber: normalizedTable,
        qrType: data.qrType || (normalizedTable ? 'TABLE' : 'COUNTER'),
        token: data.token || null,
        ipAddress: data.ipAddress || null,
        userAgent: data.userAgent || null,
      },
    });

    const totalScans = await prisma.qrScan.count({
      where: { shopId: shop.id },
    });

    return {
      recorded: true,
      scanId: scan.id,
      shopId: shop.id,
      tableNumber: normalizedTable,
      totalScans,
    };
  }
}

export const publicService = new PublicService();
