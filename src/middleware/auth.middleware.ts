import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/jwt';
import { prisma } from '../config/database';
import { AppError } from './error.middleware';
import { UserRole } from '@prisma/client';

export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    let token: string | undefined;

    // 1. Check Authorization Bearer header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.cookies && req.cookies.accessToken) {
      // 2. Check httpOnly cookie
      token = req.cookies.accessToken;
    }

    if (!token) {
      throw new AppError('Authentication required. No token provided.', 401);
    }

    const payload = verifyAccessToken(token);
    const userId = parseInt(payload.sub, 10);

    // 3. Verify user in database and ensure active status
    let activeUser: { id: number; email: string; isActive: boolean; shopId?: number } | null = null;

    if (payload.role === 'ADMIN') {
      const admin = await prisma.admin.findUnique({
        where: { id: userId },
      });
      if (admin) {
        activeUser = { id: admin.id, email: admin.email, isActive: admin.isActive };
      }
    } else if (payload.role === 'SHOPKEEPER') {
      const shopkeeper = await prisma.shopkeeper.findUnique({
        where: { id: userId },
        include: { shop: true },
      });
      if (shopkeeper) {
        if (!shopkeeper.shop.isActive) {
          throw new AppError('Associated shop is deactivated.', 403);
        }
        activeUser = {
          id: shopkeeper.id,
          email: shopkeeper.email,
          isActive: shopkeeper.isActive,
          shopId: shopkeeper.shopId,
        };
      }
    } else if (payload.role === 'CUSTOMER') {
      const customer = await prisma.customer.findUnique({
        where: { id: userId },
      });
      if (customer) {
        activeUser = { id: customer.id, email: customer.email, isActive: customer.isActive };
      }
    }

    if (!activeUser || !activeUser.isActive) {
      throw new AppError('User account not found or deactivated.', 401);
    }

    req.user = {
      id: activeUser.id,
      email: activeUser.email,
      role: payload.role as UserRole,
      shopId: activeUser.shopId,
    };

    next();
  } catch (error) {
    next(error);
  }
}
