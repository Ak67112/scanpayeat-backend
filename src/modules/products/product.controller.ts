import { Request, Response, NextFunction } from 'express';
import { productService } from './product.service';
import { sendSuccess } from '../../utils/response';

export class ProductController {
  async createProduct(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const product = await productService.createProduct(req.shopId!, req.body);
      sendSuccess(res, { product }, 'Product created successfully', 201);
    } catch (error) {
      next(error);
    }
  }

  async getProducts(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const categoryId = req.query.categoryId
        ? parseInt(req.query.categoryId as string, 10)
        : undefined;
      const isAvailable =
        req.query.isAvailable !== undefined
          ? req.query.isAvailable === 'true'
          : undefined;
      const search = req.query.search as string;

      const products = await productService.getProducts(req.shopId!, {
        categoryId,
        isAvailable,
        search,
      });
      sendSuccess(res, { products }, 'Products retrieved successfully', 200);
    } catch (error) {
      next(error);
    }
  }

  async getProductById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = parseInt(req.params.id, 10);
      const product = await productService.getProductById(req.shopId!, id);
      sendSuccess(res, { product }, 'Product details retrieved successfully', 200);
    } catch (error) {
      next(error);
    }
  }

  async updateProduct(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = parseInt(req.params.id, 10);
      const product = await productService.updateProduct(req.shopId!, id, req.body);
      sendSuccess(res, { product }, 'Product updated successfully', 200);
    } catch (error) {
      next(error);
    }
  }

  async updateProductAvailability(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const id = parseInt(req.params.id, 10);
      const product = await productService.updateProductAvailability(
        req.shopId!,
        id,
        req.body
      );
      sendSuccess(res, { product }, 'Product availability updated successfully', 200);
    } catch (error) {
      next(error);
    }
  }

  async deleteProduct(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = parseInt(req.params.id, 10);
      const result = await productService.deleteProduct(req.shopId!, id);
      sendSuccess(res, result, 'Product deleted successfully', 200);
    } catch (error) {
      next(error);
    }
  }
}

export const productController = new ProductController();
