import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { sendError } from '../utils/response';

export class AppError extends Error {
  statusCode: number;
  errors?: unknown;

  constructor(message: string, statusCode = 400, errors?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.errors = errors;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
): Response {
  // Handled Custom App Error
  if (err instanceof AppError) {
    return sendError(res, err.message, err.statusCode, err.errors);
  }

  // Zod Validation Error
  if (err instanceof ZodError) {
    const formatted = err.errors.map((e) => ({
      field: e.path.join('.'),
      message: e.message,
    }));
    return sendError(res, 'Validation error', 400, formatted);
  }

  // Prisma Unique Constraint Violation
  if (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === 'P2002'
  ) {
    const target = (err.meta?.target as string[])?.join(', ') || 'field';
    return sendError(
      res,
      `A record with this ${target} already exists.`,
      409
    );
  }

  // Prisma Record Not Found
  if (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === 'P2025'
  ) {
    return sendError(res, 'Record not found.', 404);
  }

  // JWT Errors
  if (err instanceof Error && err.name === 'JsonWebTokenError') {
    return sendError(res, 'Invalid token. Please authenticate.', 401);
  }

  if (err instanceof Error && err.name === 'TokenExpiredError') {
    return sendError(res, 'Token expired. Please refresh your session.', 401);
  }

  // Fallback internal server error
  console.error('Unhandled server error:', err);
  const message =
    err instanceof Error ? err.message : 'Internal server error occurred.';
  return sendError(res, message, 500);
}
