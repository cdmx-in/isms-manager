import { Request, Response, NextFunction } from 'express';
import passport from 'passport';
import jwt from 'jsonwebtoken';
import { Role, User } from '@prisma/client';
import { AppError } from './errorHandler.js';

// Extend Express Request type
declare global {
  namespace Express {
    interface User {
      id: string;
      email: string;
      firstName: string;
      lastName: string;
      role: Role;
      isActive: boolean;
      organizationMemberships: Array<{
        organizationId: string;
        role: Role;
        organization: {
          id: string;
          name: string;
          slug: string;
        };
      }>;
    }
  }
}

export interface AuthenticatedRequest extends Request {
  user: Express.User;
  organizationId?: string;
}

// JWT Authentication middleware
export const authenticate = (req: Request, res: Response, next: NextFunction) => {
  passport.authenticate('jwt', { session: false }, (err: Error, user: Express.User, info: any) => {
    if (err) {
      return next(err);
    }
    
    if (!user) {
      return next(new AppError(info?.message || 'Authentication required', 401));
    }
    
    req.user = user;
    next();
  })(req, res, next);
};

// Optional authentication - doesn't fail if no token
export const optionalAuth = (req: Request, res: Response, next: NextFunction) => {
  passport.authenticate('jwt', { session: false }, (err: Error, user: Express.User) => {
    if (user) {
      req.user = user;
    }
    next();
  })(req, res, next);
};

// Role-based authorization middleware
export const authorize = (...roles: Role[]) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError('Authentication required', 401));
    }

    // Admin has access to everything
    if (req.user.role === 'ADMIN') {
      return next();
    }

    // Check if user has one of the required roles
    if (!roles.includes(req.user.role)) {
      return next(new AppError('You do not have permission to perform this action', 403));
    }

    next();
  };
};

// Organization membership check
export const requireOrgMembership = (req: Request, _res: Response, next: NextFunction) => {
  const authReq = req as AuthenticatedRequest;
  const orgId = req.params.organizationId || req.body.organizationId || req.query.organizationId;

  if (!orgId) {
    return next(new AppError('Organization ID is required', 400));
  }

  if (!authReq.user) {
    return next(new AppError('Authentication required', 401));
  }

  // Admin has access to all organizations
  if (authReq.user.role === 'ADMIN') {
    authReq.organizationId = orgId as string;
    return next();
  }

  // Check membership
  const membership = authReq.user.organizationMemberships.find(
    (m) => m.organizationId === orgId
  );

  if (!membership) {
    return next(new AppError('You are not a member of this organization', 403));
  }

  authReq.organizationId = orgId as string;
  next();
};

// Organization role check
export const requireOrgRole = (...roles: Role[]) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    const authReq = req as AuthenticatedRequest;
    const orgId = authReq.organizationId || req.params.organizationId;

    if (!authReq.user) {
      return next(new AppError('Authentication required', 401));
    }

    // Global admin has all permissions
    if (authReq.user.role === 'ADMIN') {
      return next();
    }

    // Find membership and check role
    const membership = authReq.user.organizationMemberships.find(
      (m) => m.organizationId === orgId
    );

    if (!membership) {
      return next(new AppError('You are not a member of this organization', 403));
    }

    if (!roles.includes(membership.role)) {
      return next(new AppError('You do not have permission to perform this action in this organization', 403));
    }

    next();
  };
};

// Generate JWT tokens
export const generateTokens = (user: { id: string; email: string; role: Role }) => {
  const accessToken = jwt.sign(
    { 
      sub: user.id, 
      email: user.email,
      role: user.role,
      type: 'access'
    },
    process.env.JWT_SECRET || 'your-secret-key',
    { expiresIn: '15m' }
  );

  const refreshToken = jwt.sign(
    { 
      sub: user.id,
      type: 'refresh'
    },
    process.env.JWT_REFRESH_SECRET || 'your-refresh-secret',
    { expiresIn: '7d' }
  );

  return { accessToken, refreshToken };
};

// Verify refresh token
export const verifyRefreshToken = (token: string): { sub: string } => {
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET || 'your-refresh-secret') as { sub: string };
};
