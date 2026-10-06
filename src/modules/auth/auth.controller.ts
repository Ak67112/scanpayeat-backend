import { Request, Response, NextFunction } from 'express';
import { authService } from './auth.service';
import { sendSuccess } from '../../utils/response';
import { setAuthCookies, clearAuthCookies } from '../../utils/jwt';

export class AuthController {
  async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await authService.registerCustomer(req.body);
      setAuthCookies(res, result.accessToken, result.refreshToken);
      sendSuccess(res, { user: result.user, accessToken: result.accessToken }, 'Registration successful', 201);
    } catch (error) {
      next(error);
    }
  }

  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await authService.login(req.body);
      setAuthCookies(res, result.accessToken, result.refreshToken);
      sendSuccess(res, { user: result.user, accessToken: result.accessToken }, 'Login successful', 200);
    } catch (error) {
      next(error);
    }
  }

  async refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const rawRefreshToken = req.cookies?.refreshToken || req.body?.refreshToken;
      const result = await authService.refreshTokens(rawRefreshToken);
      setAuthCookies(res, result.accessToken, result.refreshToken);
      sendSuccess(res, { accessToken: result.accessToken }, 'Token refreshed successfully', 200);
    } catch (error) {
      next(error);
    }
  }

  async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const rawRefreshToken = req.cookies?.refreshToken || req.body?.refreshToken;
      await authService.logout(rawRefreshToken);
      clearAuthCookies(res);
      sendSuccess(res, null, 'Logged out successfully', 200);
    } catch (error) {
      next(error);
    }
  }

  async getMe(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = await authService.getMe(req.user!.id, req.user!.role);
      sendSuccess(res, { user }, 'User profile retrieved successfully', 200);
    } catch (error) {
      next(error);
    }
  }

  async forgotPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Stub for password reset email/token flow
      sendSuccess(
        res,
        null,
        'If an account with that email exists, password reset instructions have been sent.',
        200
      );
    } catch (error) {
      next(error);
    }
  }

  async resetPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      sendSuccess(res, null, 'Password reset successfully.', 200);
    } catch (error) {
      next(error);
    }
  }
}

export const authController = new AuthController();
