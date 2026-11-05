import { Request, Response, NextFunction } from 'express';
import { publicService } from './public.service';
import { sendSuccess } from '../../utils/response';

export class PublicController {
  async getShop(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { slug } = req.params;
      const shop = await publicService.getShopBySlug(slug);
      sendSuccess(res, { shop }, 'Shop retrieved successfully', 200);
    } catch (error) {
      next(error);
    }
  }

  async getMenu(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { slug } = req.params;
      const menu = await publicService.getShopMenu(slug);
      sendSuccess(res, menu, 'Shop menu retrieved successfully', 200);
    } catch (error) {
      next(error);
    }
  }

  async recordScan(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { slug } = req.params;
      const { tableNumber, qrType, token } = req.body || {};
      const ipAddress =
        (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
        req.socket.remoteAddress;
      const userAgent = req.headers['user-agent'];

      const result = await publicService.recordQrScan({
        slug,
        tableNumber: tableNumber ? String(tableNumber).trim() : null,
        qrType: qrType || (tableNumber ? 'TABLE' : 'COUNTER'),
        token: token || null,
        ipAddress,
        userAgent,
      });

      sendSuccess(res, result, 'QR scan recorded successfully', 200);
    } catch (error) {
      next(error);
    }
  }
}

export const publicController = new PublicController();
