import { Request, Response, NextFunction } from 'express';
import { categoryService } from './category.service';
import { sendSuccess } from '../../utils/response';

export class CategoryController {
  async createCategory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const category = await categoryService.createCategory(req.shopId!, req.body);
      sendSuccess(res, { category }, 'Category created successfully', 201);
    } catch (error) {
      next(error);
    }
  }

  async getCategories(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const categories = await categoryService.getCategories(req.shopId!);
      sendSuccess(res, { categories }, 'Categories retrieved successfully', 200);
    } catch (error) {
      next(error);
    }
  }

  async updateCategory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = parseInt(req.params.id, 10);
      const category = await categoryService.updateCategory(req.shopId!, id, req.body);
      sendSuccess(res, { category }, 'Category updated successfully', 200);
    } catch (error) {
      next(error);
    }
  }

  async deleteCategory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = parseInt(req.params.id, 10);
      const result = await categoryService.deleteCategory(req.shopId!, id);
      sendSuccess(res, result, 'Category deleted successfully', 200);
    } catch (error) {
      next(error);
    }
  }
}

export const categoryController = new CategoryController();
