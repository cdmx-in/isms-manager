import { Router } from 'express';
import { prisma } from '../index.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { authenticate, requirePermission, AuthenticatedRequest } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { updateControlValidator, uuidParam, paginationQuery } from '../middleware/validators.js';
import { createAuditLog } from '../services/audit.service.js';

const router = Router();

// Get controls for organization
router.get(
  '/',
  authenticate,
  requirePermission('frameworks', 'view'),
  paginationQuery,
  validate,
  asyncHandler(async (req, res) => {
    const {
      page = 1,
      limit = 20,
      organizationId,
      category,
      implementationStatus,
      frameworkSlug,
      search,
      sortBy = 'controlId',
      sortOrder = 'asc',
    } = req.query;

    if (!organizationId) {
      throw new AppError('Organization ID is required', 400);
    }

    const where: any = { organizationId };
    if (category) where.category = category;
    if (implementationStatus) where.implementationStatus = implementationStatus;

    // Filter by framework slug if provided
    if (frameworkSlug) {
      where.framework = { slug: frameworkSlug as string };
    }

    if (search) {
      where.OR = [
        { controlId: { contains: search as string, mode: 'insensitive' } },
        { name: { contains: search as string, mode: 'insensitive' } },
        { description: { contains: search as string, mode: 'insensitive' } },
      ];
    }

    const [controls, total] = await Promise.all([
      prisma.control.findMany({
        where,
        include: {
          assignee: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
          _count: {
            select: { evidence: true, risks: true, assets: true },
          },
        },
        orderBy: { [sortBy as string]: sortOrder },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
      prisma.control.count({ where }),
    ]);

    // Calculate implementation statistics
    const stats = await prisma.control.groupBy({
      by: ['implementationStatus'],
      where: { organizationId: organizationId as string },
      _count: true,
    });

    res.json({
      success: true,
      data: controls,
      stats: stats.reduce((acc, s) => ({ ...acc, [s.implementationStatus]: s._count }), {}),
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit)),
      },
    });
  })
);

// Get controls by category with compliance stats
router.get(
  '/categories',
  authenticate,
  requirePermission('frameworks', 'view'),
  asyncHandler(async (req, res) => {
    const { organizationId } = req.query;

    if (!organizationId) {
      throw new AppError('Organization ID is required', 400);
    }

    const categories = await prisma.control.groupBy({
      by: ['category'],
      where: { organizationId: organizationId as string },
      _count: true,
      _avg: {
        implementationPercent: true,
        maturity: true,
      },
    });

    // Get implementation status breakdown per category
    const categoryStats = await Promise.all(
      categories.map(async (cat) => {
        const statuses = await prisma.control.groupBy({
          by: ['implementationStatus'],
          where: { 
            organizationId: organizationId as string, 
            category: cat.category 
          },
          _count: true,
        });

        return {
          category: cat.category,
          total: cat._count,
          avgImplementation: Math.round(cat._avg.implementationPercent || 0),
          avgMaturity: Math.round((cat._avg.maturity || 0) * 10) / 10,
          statuses: statuses.reduce((acc, s) => ({ ...acc, [s.implementationStatus]: s._count }), {}),
        };
      })
    );

    res.json({
      success: true,
      data: categoryStats,
    });
  })
);

// Get single control
router.get(
  '/:id',
  authenticate,
  uuidParam('id'),
  validate,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const authReq = req as AuthenticatedRequest;

    const control = await prisma.control.findUnique({
      where: { id },
      include: {
        organization: {
          select: { id: true, name: true, slug: true },
        },
        assignee: {
          select: { id: true, firstName: true, lastName: true, email: true, avatar: true },
        },
        createdBy: {
          select: { id: true, firstName: true, lastName: true },
        },
        evidence: {
          select: { id: true, originalName: true, mimeType: true, size: true, createdAt: true },
        },
        risks: {
          include: {
            risk: {
              select: { id: true, riskId: true, title: true, status: true, inherentRisk: true },
            },
          },
        },
        assets: {
          include: {
            asset: {
              select: { id: true, name: true, assetType: true },
            },
          },
        },
      },
    });

    if (!control) {
      throw new AppError('Control not found', 404);
    }

    // Check membership
    const membership = authReq.user.organizationMemberships.find(
      m => m.organizationId === control.organizationId
    );
    if (!membership && authReq.user.role !== 'ADMIN') {
      throw new AppError('You are not authorized to view this control', 403);
    }

    res.json({
      success: true,
      data: control,
    });
  })
);

// Update control implementation
router.patch(
  '/:id',
  authenticate,
  uuidParam('id'),
  updateControlValidator,
  validate,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const authReq = req as AuthenticatedRequest;

    const existingControl = await prisma.control.findUnique({ where: { id } });
    if (!existingControl) {
      throw new AppError('Control not found', 404);
    }

    // Check membership
    const membership = authReq.user.organizationMemberships.find(
      m => m.organizationId === existingControl.organizationId
    );
    if (!membership && authReq.user.role !== 'ADMIN') {
      throw new AppError('You are not authorized to update this control', 403);
    }

    if (membership?.role === 'VIEWER') {
      throw new AppError('Viewers cannot update controls', 403);
    }

    const {
      implementationStatus,
      implementationPercent,
      implementationNotes,
      implementationDate,
      dueDate,
      maturity,
      maturityComment,
      effectivenessConfidentiality,
      effectivenessIntegrity,
      effectivenessAvailability,
      effectivenessProbability,
      assigneeId,
    } = req.body;

    const updateData: any = {};
    if (implementationStatus !== undefined) updateData.implementationStatus = implementationStatus;
    if (implementationPercent !== undefined) updateData.implementationPercent = implementationPercent;
    if (implementationNotes !== undefined) updateData.implementationNotes = implementationNotes;
    if (implementationDate !== undefined) updateData.implementationDate = implementationDate ? new Date(implementationDate) : null;
    if (dueDate !== undefined) updateData.dueDate = dueDate ? new Date(dueDate) : null;
    if (maturity !== undefined) updateData.maturity = maturity;
    if (maturityComment !== undefined) updateData.maturityComment = maturityComment;
    if (effectivenessConfidentiality !== undefined) updateData.effectivenessConfidentiality = effectivenessConfidentiality;
    if (effectivenessIntegrity !== undefined) updateData.effectivenessIntegrity = effectivenessIntegrity;
    if (effectivenessAvailability !== undefined) updateData.effectivenessAvailability = effectivenessAvailability;
    if (effectivenessProbability !== undefined) updateData.effectivenessProbability = effectivenessProbability;
    if (assigneeId !== undefined) updateData.assigneeId = assigneeId;

    // Auto-set implementation date when status changes to fully implemented
    if (implementationStatus === 'FULLY_IMPLEMENTED' && !existingControl.implementationDate) {
      updateData.implementationDate = new Date();
    }

    const control = await prisma.control.update({
      where: { id },
      data: updateData,
      include: {
        assignee: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    await createAuditLog({
      userId: authReq.user.id,
      organizationId: existingControl.organizationId,
      action: 'UPDATE',
      entityType: 'Control',
      entityId: id,
      oldValues: {
        implementationStatus: existingControl.implementationStatus,
        implementationPercent: existingControl.implementationPercent,
      },
      newValues: updateData,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({
      success: true,
      data: control,
    });
  })
);

// Create custom control
router.post(
  '/',
  authenticate,
  requirePermission('frameworks', 'edit'),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const {
      organizationId,
      controlId,
      name,
      description,
      objective,
      category,
    } = req.body;

    // Check if controlId is unique within organization
    const existing = await prisma.control.findUnique({
      where: {
        organizationId_controlId: { organizationId, controlId },
      },
    });

    if (existing) {
      throw new AppError('Control with this ID already exists', 409);
    }

    const control = await prisma.control.create({
      data: {
        organizationId,
        controlId,
        name,
        description,
        objective,
        category,
        isCustom: true,
        createdById: authReq.user.id,
      },
    });

    await createAuditLog({
      userId: authReq.user.id,
      organizationId,
      action: 'CREATE',
      entityType: 'Control',
      entityId: control.id,
      newValues: { controlId, name, isCustom: true },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.status(201).json({
      success: true,
      data: control,
    });
  })
);

export default router;
