import { Request, Response, NextFunction } from 'express';
import { adminService } from './admin.service';
import { sendSuccess } from '../../utils/response';

export class AdminController {
  // Shops
  async createShop(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const shop = await adminService.createShop(req.body);
      sendSuccess(res, { shop }, 'Shop created successfully', 201);
    } catch (error) {
      next(error);
    }
  }

  async getShops(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const search = req.query.search as string;
      const isActive = req.query.isActive !== undefined ? req.query.isActive === 'true' : undefined;
      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;

      const result = await adminService.getShops({ search, isActive, page, limit });
      sendSuccess(res, result, 'Shops retrieved successfully', 200);
    } catch (error) {
      next(error);
    }
  }

  async getShopById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = parseInt(req.params.id, 10);
      const shop = await adminService.getShopById(id);
      sendSuccess(res, { shop }, 'Shop details retrieved successfully', 200);
    } catch (error) {
      next(error);
    }
  }

  async updateShop(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = parseInt(req.params.id, 10);
      const shop = await adminService.updateShop(id, req.body);
      sendSuccess(res, { shop }, 'Shop updated successfully', 200);
    } catch (error) {
      next(error);
    }
  }

  async updateShopStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = parseInt(req.params.id, 10);
      const { isActive } = req.body;
      const shop = await adminService.updateShopStatus(id, isActive);
      sendSuccess(res, { shop }, `Shop ${isActive ? 'activated' : 'deactivated'} successfully`, 200);
    } catch (error) {
      next(error);
    }
  }

  async deleteShop(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = parseInt(req.params.id, 10);
      const result = await adminService.deleteShop(id);
      sendSuccess(res, result, 'Shop deleted successfully', 200);
    } catch (error) {
      next(error);
    }
  }

  // Shopkeepers
  async createShopkeeper(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const shopkeeper = await adminService.createShopkeeper(req.body);
      sendSuccess(res, { shopkeeper }, 'Shopkeeper created successfully', 201);
    } catch (error) {
      next(error);
    }
  }

  async getShopkeepers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const shopId = req.query.shopId ? parseInt(req.query.shopId as string, 10) : undefined;
      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;

      const result = await adminService.getShopkeepers({ shopId, page, limit });
      sendSuccess(res, result, 'Shopkeepers retrieved successfully', 200);
    } catch (error) {
      next(error);
    }
  }

  async updateShopkeeper(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = parseInt(req.params.id, 10);
      const shopkeeper = await adminService.updateShopkeeper(id, req.body);
      sendSuccess(res, { shopkeeper }, 'Shopkeeper updated successfully', 200);
    } catch (error) {
      next(error);
    }
  }

  async updateShopkeeperStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = parseInt(req.params.id, 10);
      const { isActive } = req.body;
      const shopkeeper = await adminService.updateShopkeeperStatus(id, isActive);
      sendSuccess(res, { shopkeeper }, `Shopkeeper ${isActive ? 'activated' : 'deactivated'} successfully`, 200);
    } catch (error) {
      next(error);
    }
  }

  async deleteShopkeeper(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = parseInt(req.params.id, 10);
      const result = await adminService.deleteShopkeeper(id);
      sendSuccess(res, result, 'Shopkeeper deleted successfully', 200);
    } catch (error) {
      next(error);
    }
  }

  // Dashboard & Analytics
  async getDashboard(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const stats = await adminService.getDashboardStats();
      sendSuccess(res, { stats }, 'Dashboard statistics retrieved successfully', 200);
    } catch (error) {
      next(error);
    }
  }

  async getOrders(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const shopId = req.query.shopId ? parseInt(req.query.shopId as string, 10) : undefined;
      const status = req.query.status as any;
      const paymentStatus = req.query.paymentStatus as any;
      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;

      const result = await adminService.getAdminOrders({ shopId, status, paymentStatus, page, limit });
      sendSuccess(res, result, 'Orders retrieved successfully', 200);
    } catch (error) {
      next(error);
    }
  }

  async getTransactions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const shopId = req.query.shopId ? parseInt(req.query.shopId as string, 10) : undefined;
      const status = req.query.status as any;
      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;

      const result = await adminService.getAdminTransactions({ shopId, status, page, limit });
      sendSuccess(res, result, 'Transactions retrieved successfully', 200);
    } catch (error) {
      next(error);
    }
  }
}

export const adminController = new AdminController();
