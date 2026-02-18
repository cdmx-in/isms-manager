import { Request, Response, NextFunction } from 'express';
import { validationResult, ValidationError } from 'express-validator';
import { AppError } from './errorHandler.js';

export const validate = (req: Request, _res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map((err: ValidationError) => ({
      field: (err as any).path || (err as any).param,
      message: err.msg,
    }));
    
    const error = new AppError('Validation failed', 400) as any;
    error.errors = errorMessages;
    return next(error);
  }
  
  next();
};
