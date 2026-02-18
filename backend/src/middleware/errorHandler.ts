import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';

// Custom error class
export class AppError extends Error {
  statusCode: number;
  isOperational: boolean;
  code?: string;
  errors?: any[];

  constructor(message: string, statusCode: number, code?: string) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    this.code = code;

    Error.captureStackTrace(this, this.constructor);
  }
}

export const errorHandler = (
  err: AppError | Error,
  req: Request,
  res: Response,
  _next: NextFunction
) => {
  // Log the error
  logger.error(`Error: ${err.message}`, {
    stack: err.stack,
    path: req.path,
    method: req.method,
    ip: req.ip,
    userId: (req as any).user?.id,
  });

  // Default error values
  const appError = err as AppError;
  let statusCode = appError.statusCode || 500;
  let message = err.message || 'Internal Server Error';

  // Handle specific error types
  
  // Prisma errors
  if (appError.code === 'P2002') {
    statusCode = 409;
    message = 'A record with this value already exists';
  }
  if (appError.code === 'P2025') {
    statusCode = 404;
    message = 'Record not found';
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token';
  }
  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token expired';
  }

  // Validation errors
  if (err.name === 'ValidationError' || appError.errors) {
    statusCode = 400;
    message = 'Validation failed';
  }

  // Don't leak error details in production
  const response: any = {
    success: false,
    error: {
      message,
      ...(process.env.NODE_ENV === 'development' && {
        stack: err.stack,
        code: appError.code,
      }),
    },
  };

  if (appError.errors) {
    response.error.details = (err as AppError).errors;
  }

  res.status(statusCode).json(response);
};

// Async handler wrapper
export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
