import { Request, Response, NextFunction } from 'express';
import { Role } from '@prisma/client';
import { AppError } from './errorHandler.js';
import { Module, Action, Permission, getLegacyPermissions } from '../constants/permissions.js';

// Extend Express Request type
declare global {
  namespace Express {
    interface User {
      id: string;
      email: string;
      firstName: string;
      lastName: string;
      role: Role;
      designation: string | null;
      isActive: boolean;
      organizationMemberships: Array<{
        organizationId: string;
        role: Role;
        orgRoleId: string | null;
        orgRole: {
          id: string;
          name: string;
          permissions: string[];
        } | null;
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

// Session-based authentication middleware
export const authenticate = (req: Request, _res: Response, next: NextFunction) => {
  if (req.isAuthenticated() && req.user) {
    return next();
  }
  return next(new AppError('Authentication required', 401));
};

// Optional authentication - doesn't fail if no session
export const optionalAuth = (_req: Request, _res: Response, next: NextFunction) => {
  // req.user is already populated by passport.session() if a valid session exists
  next();
};

// Role-based authorization middleware (legacy — kept for backward compat)
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

// Organization role check (legacy — kept for backward compat)
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

// ============================================
// NEW: Permission-based authorization
// ============================================

// Middleware: require a specific module:action permission
export const requirePermission = (module: Module, action: Action) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    const authReq = req as AuthenticatedRequest;

    if (!authReq.user) {
      return next(new AppError('Authentication required', 401));
    }

    // Global ADMIN always has full access
    if (authReq.user.role === 'ADMIN') {
      return next();
    }

    const orgId = authReq.organizationId
      || req.params.organizationId
      || req.body.organizationId
      || (req.query.organizationId as string);

    if (!orgId) {
      return next(new AppError('Organization context required', 400));
    }

    const membership = authReq.user.organizationMemberships.find(
      m => m.organizationId === orgId
    );

    if (!membership) {
      return next(new AppError('You are not a member of this organization', 403));
    }

    const permission = `${module}:${action}` as Permission;

    // Check orgRole permissions if assigned, otherwise fall back to legacy role
    const effectivePermissions = membership.orgRole
      ? membership.orgRole.permissions
      : getLegacyPermissions(membership.role);

    if (effectivePermissions.includes(permission)) {
      // Also set organizationId on the request for downstream use
      authReq.organizationId = orgId;
      return next();
    }

    return next(new AppError('You do not have permission to perform this action', 403));
  };
};

// Helper: check permission inline (for conditional logic within handlers)
export function hasPermission(
  user: Express.User,
  orgId: string,
  module: Module,
  action: Action
): boolean {
  if (user.role === 'ADMIN') return true;

  const membership = user.organizationMemberships.find(
    m => m.organizationId === orgId
  );
  if (!membership) return false;

  const permission = `${module}:${action}` as Permission;
  const effectivePermissions = membership.orgRole
    ? membership.orgRole.permissions
    : getLegacyPermissions(membership.role);

  return effectivePermissions.includes(permission);
}

