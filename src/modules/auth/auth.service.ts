import { prisma } from '../../config/database';
import { hashPassword, comparePassword } from '../../utils/password';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  hashToken,
  JwtUserPayload,
} from '../../utils/jwt';
import { AppError } from '../../middleware/error.middleware';
import { RegisterDto, LoginDto } from './auth.dto';
import { UserRole } from '@prisma/client';

export class AuthService {
  /**
   * Register a new customer
   */
  async registerCustomer(dto: RegisterDto) {
    const existing = await prisma.customer.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    if (existing) {
      throw new AppError('An account with this email already exists.', 409);
    }

    const passwordHash = await hashPassword(dto.password);

    const customer = await prisma.customer.create({
      data: {
        name: dto.name,
        email: dto.email.toLowerCase(),
        mobile: dto.mobile,
        passwordHash,
      },
    });

    const jwtPayload: JwtUserPayload = {
      sub: String(customer.id),
      role: 'CUSTOMER',
      email: customer.email,
    };

    const accessToken = generateAccessToken(jwtPayload);
    const refreshToken = generateRefreshToken(jwtPayload);

    // Store hashed refresh token
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    await prisma.refreshToken.create({
      data: {
        tokenHash: hashToken(refreshToken),
        userId: customer.id,
        role: 'CUSTOMER',
        expiresAt,
      },
    });

    return {
      user: {
        id: customer.id,
        name: customer.name,
        email: customer.email,
        mobile: customer.mobile,
        role: 'CUSTOMER' as UserRole,
      },
      accessToken,
      refreshToken,
    };
  }

  /**
   * Unified login for Admin, Shopkeeper, and Customer
   */
  async login(dto: LoginDto) {
    const email = dto.email.toLowerCase();

    // 1. If role is provided, search specifically in that table; otherwise search Admin -> Shopkeeper -> Customer
    let user: any = null;
    let role: UserRole | null = null;
    let shopId: number | undefined;

    if (!dto.role || dto.role === 'ADMIN') {
      const admin = await prisma.admin.findUnique({ where: { email } });
      if (admin) {
        user = admin;
        role = 'ADMIN';
      }
    }

    if (!user && (!dto.role || dto.role === 'SHOPKEEPER')) {
      const shopkeeper = await prisma.shopkeeper.findUnique({
        where: { email },
        include: { shop: true },
      });
      if (shopkeeper) {
        user = shopkeeper;
        role = 'SHOPKEEPER';
        shopId = shopkeeper.shopId;
        if (!shopkeeper.shop.isActive) {
          throw new AppError('The shop associated with this account is inactive.', 403);
        }
      }
    }

    if (!user && (!dto.role || dto.role === 'CUSTOMER')) {
      const customer = await prisma.customer.findUnique({ where: { email } });
      if (customer) {
        user = customer;
        role = 'CUSTOMER';
      }
    }

    if (!user || !role) {
      throw new AppError('Invalid email or password.', 401);
    }

    // Verify password
    const isPasswordValid = await comparePassword(dto.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new AppError('Invalid email or password.', 401);
    }

    // Verify user is active
    if (!user.isActive) {
      throw new AppError('Account is deactivated. Please contact support.', 403);
    }

    const jwtPayload: JwtUserPayload = {
      sub: String(user.id),
      role,
      email: user.email,
      shopId,
    };

    const accessToken = generateAccessToken(jwtPayload);
    const refreshToken = generateRefreshToken(jwtPayload);

    // Save hashed refresh token
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await prisma.refreshToken.create({
      data: {
        tokenHash: hashToken(refreshToken),
        userId: user.id,
        role,
        expiresAt,
      },
    });

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        mobile: user.mobile ?? null,
        role,
        shopId,
      },
      accessToken,
      refreshToken,
    };
  }

  /**
   * Refresh access token with refresh token rotation
   */
  async refreshTokens(rawRefreshToken: string) {
    if (!rawRefreshToken) {
      throw new AppError('Refresh token required.', 401);
    }

    let payload: JwtUserPayload;
    try {
      payload = verifyRefreshToken(rawRefreshToken);
    } catch {
      throw new AppError('Invalid or expired refresh token.', 401);
    }

    const tokenHash = hashToken(rawRefreshToken);
    const storedToken = await prisma.refreshToken.findUnique({
      where: { tokenHash },
    });

    if (!storedToken || storedToken.isRevoked || storedToken.expiresAt < new Date()) {
      // If token is revoked or already used, potential reuse attack
      if (storedToken?.isRevoked) {
        // Invalidate all tokens for this user
        await prisma.refreshToken.updateMany({
          where: { userId: storedToken.userId, role: storedToken.role },
          data: { isRevoked: true },
        });
      }
      throw new AppError('Refresh token is invalid, expired, or revoked.', 401);
    }

    // Revoke used token (token rotation)
    await prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { isRevoked: true },
    });

    // Check user active status
    const userId = parseInt(payload.sub, 10);
    let shopId: number | undefined;

    if (payload.role === 'ADMIN') {
      const admin = await prisma.admin.findUnique({ where: { id: userId } });
      if (!admin || !admin.isActive) throw new AppError('Admin account inactive.', 401);
    } else if (payload.role === 'SHOPKEEPER') {
      const shopkeeper = await prisma.shopkeeper.findUnique({
        where: { id: userId },
        include: { shop: true },
      });
      if (!shopkeeper || !shopkeeper.isActive || !shopkeeper.shop.isActive) {
        throw new AppError('Shopkeeper account or shop inactive.', 401);
      }
      shopId = shopkeeper.shopId;
    } else if (payload.role === 'CUSTOMER') {
      const customer = await prisma.customer.findUnique({ where: { id: userId } });
      if (!customer || !customer.isActive) throw new AppError('Customer account inactive.', 401);
    }

    // Generate new pair
    const newPayload: JwtUserPayload = {
      sub: payload.sub,
      role: payload.role,
      email: payload.email,
      shopId,
    };

    const newAccessToken = generateAccessToken(newPayload);
    const newRefreshToken = generateRefreshToken(newPayload);

    await prisma.refreshToken.create({
      data: {
        tokenHash: hashToken(newRefreshToken),
        userId,
        role: payload.role,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    };
  }

  /**
   * Revoke refresh token on logout
   */
  async logout(rawRefreshToken?: string) {
    if (rawRefreshToken) {
      const tokenHash = hashToken(rawRefreshToken);
      await prisma.refreshToken.updateMany({
        where: { tokenHash },
        data: { isRevoked: true },
      });
    }
  }

  /**
   * Get current authenticated user details
   */
  async getMe(userId: number, role: UserRole) {
    if (role === 'ADMIN') {
      const admin = await prisma.admin.findUnique({
        where: { id: userId },
        select: { id: true, name: true, email: true, isActive: true, createdAt: true },
      });
      return { ...admin, role: 'ADMIN' };
    }

    if (role === 'SHOPKEEPER') {
      const shopkeeper = await prisma.shopkeeper.findUnique({
        where: { id: userId },
        select: {
          id: true,
          shopId: true,
          name: true,
          email: true,
          mobile: true,
          isActive: true,
          shop: {
            select: { id: true, name: true, slug: true, subdomain: true, isActive: true },
          },
        },
      });
      return { ...shopkeeper, role: 'SHOPKEEPER' };
    }

    const customer = await prisma.customer.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        mobile: true,
        isActive: true,
        createdAt: true,
      },
    });
    return { ...customer, role: 'CUSTOMER' };
  }
}

export const authService = new AuthService();
