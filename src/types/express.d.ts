import { UserRole } from '@prisma/client';

export interface AuthenticatedUser {
  id: number;
  email: string;
  role: UserRole;
  shopId?: number;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      shopId?: number;
    }
  }
}
