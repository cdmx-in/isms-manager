import { Router } from 'express';
import { prisma } from '../index.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { paginationQuery } from '../middleware/validators.js';

const router = Router();

// Get audit logs for organization
router.get(
  '/',
  authenticate,
  requirePermission('audit_log', 'view'),
  paginationQuery,
  validate,
  asyncHandler(async (req, res) => {
    const {
      page = 1,
      limit = 50,
      organizationId,
      userId,
      action,
      entityType,
      entityId,
      startDate,
      endDate,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = req.query;

    if (!organizationId) {
      throw new AppError('Organization ID is required', 400);
    }

    const where: any = { organizationId };
    if (userId) where.userId = userId;
    if (action) where.action = action;
    if (entityType) where.entityType = entityType;
    if (entityId) where.entityId = entityId;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate as string);
      if (endDate) where.createdAt.lte = new Date(endDate as string);
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: {
          user: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
        orderBy: { [sortBy as string]: sortOrder },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
      prisma.auditLog.count({ where }),
    ]);

    res.json({
      success: true,
      data: logs,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit)),
      },
    });
  })
);

// Get audit log statistics
router.get(
  '/stats',
  authenticate,
  requirePermission('audit_log', 'view'),
  asyncHandler(async (req, res) => {
    const { organizationId, days = 30 } = req.query;

    if (!organizationId) {
      throw new AppError('Organization ID is required', 400);
    }

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - Number(days));

    // Get action breakdown
    const actionStats = await prisma.auditLog.groupBy({
      by: ['action'],
      where: {
        organizationId: organizationId as string,
        createdAt: { gte: startDate },
      },
      _count: true,
    });

    // Get entity type breakdown
    const entityStats = await prisma.auditLog.groupBy({
      by: ['entityType'],
      where: {
        organizationId: organizationId as string,
        createdAt: { gte: startDate },
      },
      _count: true,
    });

    // Get most active users
    const userStats = await prisma.auditLog.groupBy({
      by: ['userId'],
      where: {
        organizationId: organizationId as string,
        createdAt: { gte: startDate },
      },
      _count: true,
      orderBy: { _count: { userId: 'desc' } },
      take: 10,
    });

    // Get user details
    const userIds = userStats.map(s => s.userId).filter(Boolean) as string[];
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, firstName: true, lastName: true, email: true },
    });

    const userMap = new Map(users.map(u => [u.id, u]));

    res.json({
      success: true,
      data: {
        period: { days: Number(days), startDate, endDate: new Date() },
        byAction: actionStats.reduce((acc, s) => ({ ...acc, [s.action]: s._count }), {}),
        byEntityType: entityStats.reduce((acc, s) => ({ ...acc, [s.entityType]: s._count }), {}),
        topUsers: userStats.map(s => ({
          user: userMap.get(s.userId as string),
          count: s._count,
        })),
        totalActions: actionStats.reduce((sum, s) => sum + s._count, 0),
      },
    });
  })
);

// Export audit logs
router.get(
  '/export',
  authenticate,
  requirePermission('audit_log', 'view'),
  asyncHandler(async (req, res) => {
    const {
      organizationId,
      format = 'json',
      startDate,
      endDate,
    } = req.query;

    if (!organizationId) {
      throw new AppError('Organization ID is required', 400);
    }

    const where: any = { organizationId };
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate as string);
      if (endDate) where.createdAt.lte = new Date(endDate as string);
    }

    const logs = await prisma.auditLog.findMany({
      where,
      include: {
        user: {
          select: { firstName: true, lastName: true, email: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 10000, // Limit export size
    });

    if (format === 'csv') {
      const headers = [
        'Timestamp',
        'User',
        'Email',
        'Action',
        'Entity Type',
        'Entity ID',
        'IP Address',
        'Details',
      ].join(',');

      const rows = logs.map(log => [
        log.createdAt.toISOString(),
        `"${log.user?.firstName || ''} ${log.user?.lastName || ''}"`,
        log.user?.email || '',
        log.action,
        log.entityType,
        log.entityId || '',
        log.ipAddress || '',
        `"${JSON.stringify(log.newValues || {}).replace(/"/g, '""')}"`,
      ].join(','));

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="audit-log.csv"');
      return res.send([headers, ...rows].join('\n'));
    }

    res.json({
      success: true,
      data: logs,
    });
  })
);

export default router;
