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
}

export const publicController = new PublicController();
