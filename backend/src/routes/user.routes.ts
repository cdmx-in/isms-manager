import { Router } from 'express';
import { prisma } from '../index.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { authenticate, requirePermission, AuthenticatedRequest } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { uuidParam, paginationQuery } from '../middleware/validators.js';
import { createAuditLog } from '../services/audit.service.js';

const router = Router();

// Get all users (admin only)
router.get(
  '/',
  authenticate,
  requirePermission('users', 'view'),
  paginationQuery,
  validate,
  asyncHandler(async (req, res) => {
    const { page = 1, limit = 20, search, role, isActive } = req.query;

    const where: any = {};
    
    if (search) {
      where.OR = [
        { email: { contains: search as string, mode: 'insensitive' } },
        { firstName: { contains: search as string, mode: 'insensitive' } },
        { lastName: { contains: search as string, mode: 'insensitive' } },
      ];
    }
    
    if (role) where.role = role;
    if (isActive !== undefined) where.isActive = isActive === 'true';

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          avatar: true,
          isActive: true,
          isEmailVerified: true,
          authProvider: true,
          lastLoginAt: true,
          createdAt: true,
          _count: {
            select: {
              organizationMemberships: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
      prisma.user.count({ where }),
    ]);

    res.json({
      success: true,
      data: users,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit)),
      },
    });
  })
);

// Get user by ID
router.get(
  '/:id',
  authenticate,
  uuidParam('id'),
  validate,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const authReq = req as AuthenticatedRequest;

    // Users can only view their own profile unless admin
    if (authReq.user.role !== 'ADMIN' && authReq.user.id !== id) {
      throw new AppError('You can only view your own profile', 403);
    }

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        avatar: true,
        designation: true,
        isActive: true,
        isEmailVerified: true,
        authProvider: true,
        lastLoginAt: true,
        createdAt: true,
        organizationMemberships: {
          include: {
            organization: {
              select: {
                id: true,
                name: true,
                slug: true,
                logo: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    res.json({
      success: true,
      data: user,
    });
  })
);

// Update own profile (used by Settings page)
router.patch(
  '/profile',
  authenticate,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const { firstName, lastName, avatar, designation } = req.body;

    const updateData: any = {};
    if (firstName !== undefined) updateData.firstName = firstName;
    if (lastName !== undefined) updateData.lastName = lastName;
    if (avatar !== undefined) updateData.avatar = avatar;
    if (designation !== undefined) updateData.designation = designation;

    const user = await prisma.user.update({
      where: { id: authReq.user.id },
      data: updateData,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        avatar: true,
        designation: true,
        isActive: true,
        updatedAt: true,
      },
    });

    res.json({ success: true, data: user });
  })
);

// Update user profile (admin or self by ID)
router.patch(
  '/:id',
  authenticate,
  uuidParam('id'),
  validate,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const authReq = req as AuthenticatedRequest;
    const { firstName, lastName, avatar, designation } = req.body;

    // Users can only update their own profile unless admin
    if (authReq.user.role !== 'ADMIN' && authReq.user.id !== id) {
      throw new AppError('You can only update your own profile', 403);
    }

    const existingUser = await prisma.user.findUnique({ where: { id } });
    if (!existingUser) {
      throw new AppError('User not found', 404);
    }

    const updateData: any = {};
    if (firstName !== undefined) updateData.firstName = firstName;
    if (lastName !== undefined) updateData.lastName = lastName;
    if (avatar !== undefined) updateData.avatar = avatar;
    if (designation !== undefined) updateData.designation = designation;

    // Admin-only fields
    if (authReq.user.role === 'ADMIN') {
      const { role, isActive } = req.body;
      if (role !== undefined) updateData.role = role;
      if (isActive !== undefined) updateData.isActive = isActive;
    }

    const user = await prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        avatar: true,
        designation: true,
        isActive: true,
        updatedAt: true,
      },
    });

    await createAuditLog({
      userId: authReq.user.id,
      action: 'UPDATE',
      entityType: 'User',
      entityId: id,
      oldValues: { firstName: existingUser.firstName, lastName: existingUser.lastName },
      newValues: updateData,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({
      success: true,
      data: user,
    });
  })
);

// Deactivate user (admin only)
router.delete(
  '/:id',
  authenticate,
  requirePermission('users', 'edit'),
  uuidParam('id'),
  validate,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const authReq = req as AuthenticatedRequest;

    // Prevent self-deactivation
    if (authReq.user.id === id) {
      throw new AppError('You cannot deactivate your own account', 400);
    }

    const user = await prisma.user.update({
      where: { id },
      data: { isActive: false },
    });

    await createAuditLog({
      userId: authReq.user.id,
      action: 'DELETE',
      entityType: 'User',
      entityId: id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({
      success: true,
      message: 'User deactivated successfully',
    });
  })
);

export default router;
