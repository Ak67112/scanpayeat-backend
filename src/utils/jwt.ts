import jwt, { SignOptions } from 'jsonwebtoken';
import crypto from 'crypto';
import { Response } from 'express';
import { env } from '../config/env';

export interface JwtUserPayload {
  sub: string;
  role: 'ADMIN' | 'SHOPKEEPER' | 'CUSTOMER';
  shopId?: number;
  email: string;
}

/**
 * Role-based Session Expiry Policy:
 * - CUSTOMER: 30 days (1 month) persistent session
 * - SHOPKEEPER & ADMIN: strictly 24 hours daily re-authentication
 */
export function getTokenExpiryForRole(role: 'ADMIN' | 'SHOPKEEPER' | 'CUSTOMER' | string): {
  accessExpiry: string;
  refreshExpiry: string;
  durationMs: number;
} {
  if (role === 'CUSTOMER') {
    return {
      accessExpiry: '30d',
      refreshExpiry: '30d',
      durationMs: 30 * 24 * 60 * 60 * 1000, // 30 days (1 month)
    };
  }

  // SHOPKEEPER and ADMIN sessions expire every 24 hours
  return {
    accessExpiry: '24h',
    refreshExpiry: '24h',
    durationMs: 24 * 60 * 60 * 1000, // 24 hours
  };
}

export function generateAccessToken(payload: JwtUserPayload): string {
  const { accessExpiry } = getTokenExpiryForRole(payload.role);
  const options: SignOptions = {
    expiresIn: accessExpiry as any,
  };
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, options);
}

export function generateRefreshToken(payload: JwtUserPayload): string {
  const { refreshExpiry } = getTokenExpiryForRole(payload.role);
  const options: SignOptions = {
    expiresIn: refreshExpiry as any,
  };
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, options);
}

export function verifyAccessToken(token: string): JwtUserPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as JwtUserPayload;
}

export function verifyRefreshToken(token: string): JwtUserPayload {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as JwtUserPayload;
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function setAuthCookies(
  res: Response,
  accessToken: string,
  refreshToken: string,
  role: 'ADMIN' | 'SHOPKEEPER' | 'CUSTOMER' | string = 'CUSTOMER'
): void {
  const isProduction = env.NODE_ENV === 'production';
  const cookieOptions = {
    httpOnly: true,
    secure: isProduction,
    sameSite: (isProduction ? 'none' : 'lax') as 'none' | 'lax',
    domain: env.COOKIE_DOMAIN === 'localhost' ? undefined : env.COOKIE_DOMAIN,
    path: '/',
  };

  const { durationMs } = getTokenExpiryForRole(role);

  // Role-based cookie expiry: 30 days for Customer, 24 hours for Admin/Shopkeeper
  res.cookie('accessToken', accessToken, {
    ...cookieOptions,
    maxAge: durationMs,
  });

  res.cookie('refreshToken', refreshToken, {
    ...cookieOptions,
    maxAge: durationMs,
  });
}

export function clearAuthCookies(res: Response): void {
  const isProduction = env.NODE_ENV === 'production';
  const cookieOptions = {
    httpOnly: true,
    secure: isProduction,
    sameSite: (isProduction ? 'none' : 'lax') as 'none' | 'lax',
    domain: env.COOKIE_DOMAIN === 'localhost' ? undefined : env.COOKIE_DOMAIN,
    path: '/',
  };

  res.clearCookie('accessToken', cookieOptions);
  res.clearCookie('refreshToken', cookieOptions);
}
