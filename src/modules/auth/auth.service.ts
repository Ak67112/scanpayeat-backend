import crypto from 'crypto';
import { prisma } from '../../config/database';
import { env } from '../../config/env';
import { hashPassword, comparePassword } from '../../utils/password';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  hashToken,
  getTokenExpiryForRole,
  JwtUserPayload,
} from '../../utils/jwt';
import { AppError } from '../../middleware/error.middleware';
import { RegisterDto, LoginDto, GoogleAuthDto } from './auth.dto';
import { UserRole } from '@prisma/client';

export class AuthService {
  /**
   * Register a new customer
   */
  async registerCustomer(dto: RegisterDto) {
    const rawEmail = dto.email ? dto.email.trim().toLowerCase() : '';
    const mobile = dto.mobile.trim();

    // Check if mobile already registered
    const existingMobile = await prisma.customer.findFirst({
      where: { mobile },
    });
    if (existingMobile) {
      throw new AppError('An account with this mobile number already exists.', 409);
    }

    // Normalized email or synthetic email for database unique constraint
    const customerEmail = rawEmail || `${mobile}@customer.hotelkada.local`;

    const existing = await prisma.customer.findUnique({
      where: { email: customerEmail },
    });
    if (existing) {
      throw new AppError('An account with this email already exists.', 409);
    }

    const passwordHash = await hashPassword(dto.password);

    const customer = await prisma.customer.create({
      data: {
        name: dto.name.trim(),
        email: customerEmail,
        mobile,
        avatarUrl: dto.avatarUrl ?? null,
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

    // Store hashed refresh token (30 days / 1 month for Customer)
    const { durationMs } = getTokenExpiryForRole('CUSTOMER');
    const expiresAt = new Date(Date.now() + durationMs);
    await prisma.refreshToken.create({
      data: {
        tokenHash: hashToken(refreshToken),
        userId: customer.id,
        role: 'CUSTOMER',
        expiresAt,
      },
    });

    const displayEmail =
      customer.email.endsWith('@customer.hotelkada.local') ||
      customer.email.endsWith('@customer.scanpayeat.local')
        ? null
        : customer.email;

    return {
      user: {
        id: customer.id,
        name: customer.name,
        email: displayEmail,
        mobile: customer.mobile,
        avatarUrl: customer.avatarUrl ?? null,
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
    const rawInput = dto.email.trim();
    const isMobileFormat = /^[0-9]{10}$/.test(rawInput);
    const email = rawInput.toLowerCase();

    // 1. If role is provided, search specifically in that table; otherwise search Admin -> Shopkeeper -> Customer
    let user: any = null;
    let role: UserRole | null = null;
    let shopId: number | undefined;

    if (!dto.role || dto.role === 'ADMIN') {
      let admin = await prisma.admin.findUnique({ where: { email } });
      if (!admin && email === 'admin@hotelkada.com') {
        admin = await prisma.admin.findUnique({ where: { email: 'admin@scanpayeat.com' } });
      } else if (!admin && email === 'admin@scanpayeat.com') {
        admin = await prisma.admin.findUnique({ where: { email: 'admin@hotelkada.com' } });
      }
      if (admin) {
        user = admin;
        role = 'ADMIN';
      }
    }

    if (!user && (!dto.role || dto.role === 'SHOPKEEPER')) {
      const shopkeeper = await prisma.shopkeeper.findFirst({
        where: {
          OR: [
            { email },
            ...(isMobileFormat ? [{ mobile: rawInput }] : []),
          ],
        },
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
      const customer = await prisma.customer.findFirst({
        where: {
          OR: [
            { email },
            { mobile: rawInput },
            ...(isMobileFormat
              ? [
                  { email: `${rawInput}@customer.hotelkada.local` },
                  { email: `${rawInput}@customer.scanpayeat.local` },
                ]
              : []),
          ],
        },
      });
      if (customer) {
        user = customer;
        role = 'CUSTOMER';
      }
    }

    if (!user || !role) {
      throw new AppError('Invalid mobile number/email or password.', 401);
    }

    // Verify password
    const isPasswordValid = await comparePassword(dto.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new AppError('Invalid mobile number/email or password.', 401);
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

    // Save hashed refresh token (30 days for Customer, 24 hours for Shopkeeper/Admin)
    const { durationMs } = getTokenExpiryForRole(role);
    const expiresAt = new Date(Date.now() + durationMs);
    await prisma.refreshToken.create({
      data: {
        tokenHash: hashToken(refreshToken),
        userId: user.id,
        role,
        expiresAt,
      },
    });

    const displayEmail =
      role === 'CUSTOMER' &&
      (user.email?.endsWith('@customer.hotelkada.local') || user.email?.endsWith('@customer.scanpayeat.local'))
        ? null
        : user.email;

    return {
      user: {
        id: user.id,
        name: user.name,
        email: displayEmail,
        mobile: user.mobile ?? null,
        avatarUrl: (user as any).avatarUrl ?? null,
        role,
        shopId,
        shopName: (user as any).shop?.name,
        shopSlug: (user as any).shop?.slug,
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

    const { durationMs } = getTokenExpiryForRole(payload.role);
    await prisma.refreshToken.create({
      data: {
        tokenHash: hashToken(newRefreshToken),
        userId,
        role: payload.role,
        expiresAt: new Date(Date.now() + durationMs),
      },
    });

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      role: payload.role,
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
          avatarUrl: true,
          isActive: true,
          shop: {
            select: {
              id: true,
              name: true,
              slug: true,
              subdomain: true,
              address: true,
              phone: true,
              logoUrl: true,
              bannerUrl: true,
              description: true,
              ambienceImages: true,
              isActive: true,
            },
          },
        },
      });
      return {
        ...shopkeeper,
        role: 'SHOPKEEPER',
        shopName: shopkeeper?.shop?.name ?? null,
        shopSlug: shopkeeper?.shop?.slug ?? null,
      };
    }

    const customer = await prisma.customer.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        mobile: true,
        avatarUrl: true,
        isActive: true,
        createdAt: true,
      },
    });
    if (!customer) return null;
    const displayEmail =
      customer.email.endsWith('@customer.hotelkada.local') ||
      customer.email.endsWith('@customer.scanpayeat.local')
        ? null
        : customer.email;
    return { ...customer, email: displayEmail, role: 'CUSTOMER' };
  }

  /**
   * Google OAuth login or auto-registration for Customers
   */
  async loginWithGoogle(dto: GoogleAuthDto) {
    let email: string | undefined;
    let name: string | undefined;
    let picture: string | undefined;
    let googleId: string | undefined;

    if (dto.credential) {
      // Direct GIS Google ID Token verification
      try {
        const tokenInfoRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${dto.credential}`);
        if (!tokenInfoRes.ok) {
          throw new Error('Failed to verify Google ID token with Google servers');
        }
        const data = await tokenInfoRes.json();
        if (!data.email) {
          throw new Error('No email found in Google token response');
        }
        email = data.email.toLowerCase().trim();
        name = data.name || data.given_name || 'Google Diner';
        picture = data.picture;
        googleId = data.sub;
      } catch (err: any) {
        throw new AppError(err.message || 'Invalid Google credential token', 401);
      }
    } else if (dto.code) {
      // Authorization Code exchange
      try {
        const redirectUri = dto.redirectUri || `${env.FRONTEND_URL}/auth/callback`;
        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            code: dto.code,
            client_id: env.GOOGLE_CLIENT_ID,
            client_secret: env.GOOGLE_CLIENT_SECRET,
            redirect_uri: redirectUri,
            grant_type: 'authorization_code',
          }),
        });

        const tokenData = await tokenRes.json();
        if (!tokenRes.ok || !tokenData.access_token) {
          console.error('Google token exchange error:', tokenData);
          throw new Error(tokenData.error_description || tokenData.error || 'Failed to exchange authorization code');
        }

        // Fetch user profile using access_token
        const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${tokenData.access_token}` },
        });
        const userData = await userRes.json();
        if (!userRes.ok || !userData.email) {
          throw new Error('Failed to retrieve user profile from Google');
        }

        email = userData.email.toLowerCase().trim();
        name = userData.name || userData.given_name || 'Google Diner';
        picture = userData.picture;
        googleId = userData.sub;
      } catch (err: any) {
        throw new AppError(err.message || 'Google authorization failed', 401);
      }
    }

    if (!email) {
      throw new AppError('Could not obtain verified email from Google', 400);
    }

    // 1. Check if user is a Shopkeeper (or if SHOPKEEPER role was requested)
    const isShopkeeperRequested = dto.role === 'SHOPKEEPER';
    const shopkeeper = await prisma.shopkeeper.findUnique({
      where: { email },
      include: { shop: true },
    });

    if (shopkeeper && (!dto.role || isShopkeeperRequested)) {
      if (!shopkeeper.isActive || !shopkeeper.shop.isActive) {
        throw new AppError('The shopkeeper account or associated shop is inactive.', 403);
      }
      if (!shopkeeper.avatarUrl && picture) {
        await prisma.shopkeeper.update({
          where: { id: shopkeeper.id },
          data: { avatarUrl: picture },
        });
      }

      const jwtPayload: JwtUserPayload = {
        sub: String(shopkeeper.id),
        role: 'SHOPKEEPER',
        shopId: shopkeeper.shopId,
        email: shopkeeper.email,
      };

      const accessToken = generateAccessToken(jwtPayload);
      const refreshToken = generateRefreshToken(jwtPayload);

      // 24 hours session for staff
      const { durationMs } = getTokenExpiryForRole('SHOPKEEPER');
      const expiresAt = new Date(Date.now() + durationMs);
      await prisma.refreshToken.create({
        data: {
          tokenHash: hashToken(refreshToken),
          userId: shopkeeper.id,
          role: 'SHOPKEEPER',
          expiresAt,
        },
      });

      return {
        user: {
          id: shopkeeper.id,
          name: shopkeeper.name,
          email: shopkeeper.email,
          mobile: shopkeeper.mobile,
          avatarUrl: picture || shopkeeper.avatarUrl || null,
          role: 'SHOPKEEPER' as UserRole,
          shopId: shopkeeper.shopId,
          shop: shopkeeper.shop,
        },
        accessToken,
        refreshToken,
      };
    }

    if (isShopkeeperRequested && !shopkeeper) {
      throw new AppError(
        'No restaurant staff account found with this Google email. Please register or contact support.',
        404
      );
    }

    // 2. Find or create customer
    let customer = await prisma.customer.findUnique({
      where: { email },
    });

    if (customer) {
      if (!customer.isActive) {
        throw new AppError('Account is deactivated. Please contact support.', 403);
      }
      // Update avatar if not present
      if (!customer.avatarUrl && picture) {
        customer = await prisma.customer.update({
          where: { id: customer.id },
          data: { avatarUrl: picture },
        });
      }
    } else {
      // Auto-register customer with Google profile details
      const randomSecret = crypto.randomBytes(32).toString('hex');
      const passwordHash = await hashPassword(randomSecret);
      customer = await prisma.customer.create({
        data: {
          name: name || 'Google Diner',
          email,
          avatarUrl: picture || null,
          passwordHash,
          isActive: true,
        },
      });
    }

    const jwtPayload: JwtUserPayload = {
      sub: String(customer.id),
      role: 'CUSTOMER',
      email: customer.email,
    };

    const accessToken = generateAccessToken(jwtPayload);
    const refreshToken = generateRefreshToken(jwtPayload);

    // 30 days session for customer
    const { durationMs } = getTokenExpiryForRole('CUSTOMER');
    const expiresAt = new Date(Date.now() + durationMs);
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
        avatarUrl: picture || customer.avatarUrl || null,
        role: 'CUSTOMER' as UserRole,
      },
      accessToken,
      refreshToken,
    };
  }
}

export const authService = new AuthService();
