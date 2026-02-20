import { Router } from 'express';
import { prisma } from '../index.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { authenticate, requirePermission, AuthenticatedRequest } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { uuidParam, paginationQuery } from '../middleware/validators.js';
import { createAuditLog } from '../services/audit.service.js';

const router = Router();

// ============================================
// HELPERS
// ============================================

const generateExemptionId = async (organizationId: string): Promise<string> => {
  const lastExemption = await prisma.exemption.findFirst({
    where: { organizationId },
    orderBy: { createdAt: 'desc' },
    select: { exemptionId: true },
  });

  if (!lastExemption) return 'EX-001';

  const lastNumber = parseInt(lastExemption.exemptionId.replace('EX-', '')) || 0;
  return `EX-${String(lastNumber + 1).padStart(3, '0')}`;
};

const getNextExemptionVersion = async (exemptionId: string, isMajor: boolean): Promise<number> => {
  const lastVersion = await prisma.exemptionVersion.findFirst({
    where: { exemptionId },
    orderBy: { version: 'desc' },
    select: { version: true },
  });

  if (!lastVersion) {
    return 0.1;
  }

  if (isMajor) {
    return Math.floor(lastVersion.version) + 1.0;
  }

  const major = Math.floor(lastVersion.version);
  const minor = Math.round((lastVersion.version - major) * 10);
  return Number((major + (minor + 1) / 10).toFixed(1));
};

const createExemptionVersionEntry = async (params: {
  exemptionId: string;
  version: number;
  changeDescription: string;
  actor: string;
  actorDesignation?: string;
  action: string;
  createdById?: string;
  approvedById?: string;
}) => {
  const exemptionData = await prisma.exemption.findUnique({
    where: { id: params.exemptionId },
    include: {
      control: {
        select: { id: true, controlId: true, name: true, category: true },
      },
      framework: {
        select: { id: true, shortName: true, slug: true },
      },
      requestedBy: {
        select: { id: true, firstName: true, lastName: true, email: true },
      },
    },
  });

  return prisma.exemptionVersion.create({
    data: {
      exemptionId: params.exemptionId,
      version: params.version,
      changeDescription: params.changeDescription,
      actor: params.actor,
      actorDesignation: params.actorDesignation,
      action: params.action,
      createdById: params.createdById,
      approvedById: params.approvedById,
      exemptionData: exemptionData as any,
    },
  });
};

// ============================================
// GET ROUTES
// ============================================

// Get exemptions list with filters
router.get(
  '/',
  authenticate,
  requirePermission('exemptions', 'view'),
  paginationQuery,
  validate,
  asyncHandler(async (req, res) => {
    const {
      page = 1,
      limit = 50,
      organizationId,
      controlId,
      status,
      approvalStatus,
      frameworkId,
      exemptionType,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = req.query;

    if (!organizationId) {
      throw new AppError('Organization ID is required', 400);
    }

    const where: any = { organizationId };

    if (controlId) {
      where.controlId = controlId;
    }
    if (status) {
      where.status = status;
    }
    if (approvalStatus) {
      where.approvalStatus = approvalStatus;
    }
    if (frameworkId) {
      where.frameworkId = frameworkId;
    }
    if (exemptionType) {
      where.exemptionType = exemptionType;
    }

    if (search) {
      where.OR = [
        { title: { contains: search as string, mode: 'insensitive' } },
        { exemptionId: { contains: search as string, mode: 'insensitive' } },
        { control: { name: { contains: search as string, mode: 'insensitive' } } },
        { control: { controlId: { contains: search as string, mode: 'insensitive' } } },
      ];
    }

    const orderBy: any = {};
    if (sortBy === 'exemptionId') {
      orderBy.exemptionId = sortOrder;
    } else if (sortBy === 'validUntil') {
      orderBy.validUntil = sortOrder;
    } else {
      orderBy.createdAt = sortOrder;
    }

    const [entries, total] = await Promise.all([
      prisma.exemption.findMany({
        where,
        include: {
          control: {
            select: {
              id: true,
              controlId: true,
              name: true,
              category: true,
            },
          },
          framework: {
            select: {
              id: true,
              shortName: true,
              slug: true,
            },
          },
          requestedBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
          _count: {
            select: { versions: true },
          },
        },
        orderBy,
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
      prisma.exemption.count({ where }),
    ]);

    res.json({
      success: true,
      data: entries,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit)),
      },
    });
  })
);

// Get exemption stats
router.get(
  '/stats',
  authenticate,
  requirePermission('exemptions', 'view'),
  asyncHandler(async (req, res) => {
    const { organizationId } = req.query;

    if (!organizationId) {
      throw new AppError('Organization ID is required', 400);
    }

    const now = new Date();
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    const allExemptions = await prisma.exemption.findMany({
      where: { organizationId: organizationId as string },
      select: {
        status: true,
        approvalStatus: true,
        exemptionType: true,
        validUntil: true,
      },
    });

    const stats = {
      total: allExemptions.length,
      active: allExemptions.filter(e => e.status === 'ACTIVE' && e.validUntil > now).length,
      expired: allExemptions.filter(e => e.status === 'EXPIRED' || (e.status === 'ACTIVE' && e.validUntil <= now)).length,
      expiringSoon: allExemptions.filter(e =>
        e.status === 'ACTIVE' && e.validUntil > now && e.validUntil <= thirtyDaysFromNow
      ).length,
      pendingApproval: allExemptions.filter(e =>
        e.approvalStatus === 'PENDING_FIRST_APPROVAL' || e.approvalStatus === 'PENDING_SECOND_APPROVAL'
      ).length,
      revoked: allExemptions.filter(e => e.status === 'REVOKED').length,
      underReview: allExemptions.filter(e => e.status === 'UNDER_REVIEW').length,
      byType: {
        full: allExemptions.filter(e => e.exemptionType === 'FULL').length,
        partial: allExemptions.filter(e => e.exemptionType === 'PARTIAL').length,
      },
    };

    res.json({
      success: true,
      data: stats,
    });
  })
);

// Get single exemption
router.get(
  '/:id',
  authenticate,
  uuidParam('id'),
  validate,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const authReq = req as AuthenticatedRequest;

    const exemption = await prisma.exemption.findUnique({
      where: { id },
      include: {
        control: {
          select: {
            id: true,
            controlId: true,
            name: true,
            description: true,
            category: true,
            implementationStatus: true,
          },
        },
        framework: {
          select: {
            id: true,
            shortName: true,
            slug: true,
            name: true,
          },
        },
        requestedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        _count: {
          select: { versions: true },
        },
      },
    });

    if (!exemption) {
      throw new AppError('Exemption not found', 404);
    }

    const membership = authReq.user.organizationMemberships.find(
      m => m.organizationId === exemption.organizationId
    );
    if (!membership && authReq.user.role !== 'ADMIN') {
      throw new AppError('You are not authorized to view this exemption', 403);
    }

    res.json({
      success: true,
      data: exemption,
    });
  })
);

// Get exemption version history
router.get(
  '/:id/versions',
  authenticate,
  uuidParam('id'),
  validate,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const authReq = req as AuthenticatedRequest;

    const exemption = await prisma.exemption.findUnique({ where: { id } });
    if (!exemption) {
      throw new AppError('Exemption not found', 404);
    }

    const membership = authReq.user.organizationMemberships.find(
      m => m.organizationId === exemption.organizationId
    );
    if (!membership && authReq.user.role !== 'ADMIN') {
      throw new AppError('You are not authorized to view this exemption', 403);
    }

    const versions = await prisma.exemptionVersion.findMany({
      where: { exemptionId: id },
      orderBy: { version: 'desc' },
    });

    res.json({
      success: true,
      data: versions,
    });
  })
);

// ============================================
// CREATE / UPDATE ROUTES
// ============================================

// Create new exemption request
router.post(
  '/',
  authenticate,
  requirePermission('exemptions', 'edit'),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const {
      organizationId,
      title,
      controlId,
      frameworkId,
      exemptionType,
      justification,
      riskAcceptance,
      compensatingControls,
      validFrom,
      validUntil,
      reviewDate,
      comments,
    } = req.body;

    if (!organizationId) {
      throw new AppError('Organization ID is required', 400);
    }
    if (!title) {
      throw new AppError('Title is required', 400);
    }
    if (!controlId) {
      throw new AppError('Control ID is required', 400);
    }
    if (!justification) {
      throw new AppError('Justification is required', 400);
    }
    if (!validUntil) {
      throw new AppError('Valid Until date is required (exemptions must be time-bound)', 400);
    }

    // Verify control exists and belongs to org
    const control = await prisma.control.findFirst({
      where: { id: controlId, organizationId },
      select: { id: true, controlId: true, name: true, frameworkId: true },
    });
    if (!control) {
      throw new AppError('Control not found in this organization', 404);
    }

    const membership = authReq.user.organizationMemberships.find(
      m => m.organizationId === organizationId
    );
    if (!membership && authReq.user.role !== 'ADMIN') {
      throw new AppError('You are not a member of this organization', 403);
    }

    const exemptionId = await generateExemptionId(organizationId);

    const exemption = await prisma.exemption.create({
      data: {
        organizationId,
        exemptionId,
        title,
        controlId,
        frameworkId: frameworkId || control.frameworkId,
        requestedById: authReq.user.id,
        exemptionType: exemptionType || 'FULL',
        justification,
        riskAcceptance,
        compensatingControls,
        validFrom: validFrom ? new Date(validFrom) : null,
        validUntil: new Date(validUntil),
        reviewDate: reviewDate ? new Date(reviewDate) : null,
        comments,
        status: 'UNDER_REVIEW',
        approvalStatus: 'DRAFT',
        version: 0.1,
      },
      include: {
        control: {
          select: { id: true, controlId: true, name: true, category: true },
        },
        framework: {
          select: { id: true, shortName: true, slug: true },
        },
        requestedBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    // Create initial version entry
    await createExemptionVersionEntry({
      exemptionId: exemption.id,
      version: 0.1,
      changeDescription: `Exemption request created: ${exemptionId} - ${title}`,
      actor: `${authReq.user.firstName} ${authReq.user.lastName}`,
      actorDesignation: membership?.role || authReq.user.role,
      action: 'Draft & Review',
      createdById: authReq.user.id,
    });

    await createAuditLog({
      userId: authReq.user.id,
      organizationId,
      action: 'CREATE',
      entityType: 'Exemption',
      entityId: exemption.id,
      newValues: {
        exemptionId,
        title,
        controlId: control.controlId,
        exemptionType: exemptionType || 'FULL',
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.status(201).json({
      success: true,
      data: exemption,
      message: `Exemption request ${exemptionId} created successfully`,
    });
  })
);

// Update exemption
router.patch(
  '/:id',
  authenticate,
  requirePermission('exemptions', 'edit'),
  uuidParam('id'),
  validate,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const authReq = req as AuthenticatedRequest;

    const existingExemption = await prisma.exemption.findUnique({
      where: { id },
      include: { control: { select: { controlId: true, name: true } } },
    });
    if (!existingExemption) {
      throw new AppError('Exemption not found', 404);
    }

    const membership = authReq.user.organizationMemberships.find(
      m => m.organizationId === existingExemption.organizationId
    );
    if (!membership && authReq.user.role !== 'ADMIN') {
      throw new AppError('You are not authorized to update this exemption', 403);
    }

    const {
      title,
      controlId,
      frameworkId,
      exemptionType,
      justification,
      riskAcceptance,
      compensatingControls,
      validFrom,
      validUntil,
      reviewDate,
      comments,
      changeDescription,
    } = req.body;

    const updateData: any = {};
    if (title !== undefined) updateData.title = title;
    if (controlId !== undefined) updateData.controlId = controlId;
    if (frameworkId !== undefined) updateData.frameworkId = frameworkId;
    if (exemptionType !== undefined) updateData.exemptionType = exemptionType;
    if (justification !== undefined) updateData.justification = justification;
    if (riskAcceptance !== undefined) updateData.riskAcceptance = riskAcceptance;
    if (compensatingControls !== undefined) updateData.compensatingControls = compensatingControls;
    if (validFrom !== undefined) updateData.validFrom = validFrom ? new Date(validFrom) : null;
    if (validUntil !== undefined) updateData.validUntil = new Date(validUntil);
    if (reviewDate !== undefined) updateData.reviewDate = reviewDate ? new Date(reviewDate) : null;
    if (comments !== undefined) updateData.comments = comments;

    // Reset approval status to DRAFT on edit if currently APPROVED
    if (existingExemption.approvalStatus === 'APPROVED') {
      updateData.approvalStatus = 'DRAFT';
      updateData.status = 'UNDER_REVIEW';
    }

    // Bump minor version
    const nextVersion = await getNextExemptionVersion(id, false);
    updateData.version = nextVersion;

    const exemption = await prisma.exemption.update({
      where: { id },
      data: updateData,
      include: {
        control: {
          select: { id: true, controlId: true, name: true, category: true },
        },
        framework: {
          select: { id: true, shortName: true, slug: true },
        },
        requestedBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    await createExemptionVersionEntry({
      exemptionId: id,
      version: nextVersion,
      changeDescription: changeDescription || `Exemption updated: ${Object.keys(updateData).filter(k => !['version', 'approvalStatus', 'status'].includes(k)).join(', ')}`,
      actor: `${authReq.user.firstName} ${authReq.user.lastName}`,
      actorDesignation: membership?.role || authReq.user.role,
      action: 'Updation',
      createdById: authReq.user.id,
    });

    await createAuditLog({
      userId: authReq.user.id,
      organizationId: existingExemption.organizationId,
      action: 'UPDATE',
      entityType: 'Exemption',
      entityId: id,
      oldValues: {
        exemptionId: existingExemption.exemptionId,
        version: existingExemption.version,
      },
      newValues: updateData,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({
      success: true,
      data: exemption,
    });
  })
);

// ============================================
// APPROVAL WORKFLOW ROUTES
// ============================================

// Submit exemption for review
router.post(
  '/:id/submit-for-review',
  authenticate,
  uuidParam('id'),
  validate,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const authReq = req as AuthenticatedRequest;
    const { changeDescription } = req.body;

    const exemption = await prisma.exemption.findUnique({
      where: { id },
      include: { control: { select: { controlId: true, name: true } } },
    });
    if (!exemption) {
      throw new AppError('Exemption not found', 404);
    }

    const membership = authReq.user.organizationMemberships.find(
      m => m.organizationId === exemption.organizationId
    );
    if (!membership && authReq.user.role !== 'ADMIN') {
      throw new AppError('You are not a member of this organization', 403);
    }

    if (membership?.role === 'VIEWER') {
      throw new AppError('Viewers cannot submit exemptions for review', 403);
    }

    if (exemption.approvalStatus !== 'DRAFT' && exemption.approvalStatus !== 'REJECTED') {
      throw new AppError(`Exemption cannot be submitted for review from ${exemption.approvalStatus} status`, 400);
    }

    const nextVersion = await getNextExemptionVersion(id, false);

    const updatedExemption = await prisma.exemption.update({
      where: { id },
      data: {
        approvalStatus: 'PENDING_FIRST_APPROVAL',
        version: nextVersion,
        updatedAt: new Date(),
      },
      include: {
        control: {
          select: { id: true, controlId: true, name: true, category: true },
        },
      },
    });

    await createExemptionVersionEntry({
      exemptionId: id,
      version: nextVersion,
      changeDescription: changeDescription || `Exemption submitted for review: ${exemption.exemptionId} - ${exemption.title}`,
      actor: `${authReq.user.firstName} ${authReq.user.lastName}`,
      actorDesignation: membership?.role || authReq.user.role,
      action: 'Submitted for Review',
      createdById: authReq.user.id,
    });

    await createAuditLog({
      userId: authReq.user.id,
      organizationId: exemption.organizationId,
      action: 'UPDATE',
      entityType: 'Exemption',
      entityId: id,
      oldValues: { approvalStatus: exemption.approvalStatus },
      newValues: { approvalStatus: 'PENDING_FIRST_APPROVAL' },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({
      success: true,
      data: updatedExemption,
      message: 'Exemption submitted for 1st level approval',
    });
  })
);

// First level approval (LOCAL_ADMIN or ADMIN)
router.post(
  '/:id/first-approval',
  authenticate,
  uuidParam('id'),
  validate,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const authReq = req as AuthenticatedRequest;
    const { comments } = req.body;

    const exemption = await prisma.exemption.findUnique({
      where: { id },
      include: { control: { select: { controlId: true, name: true } } },
    });
    if (!exemption) {
      throw new AppError('Exemption not found', 404);
    }

    const membership = authReq.user.organizationMemberships.find(
      m => m.organizationId === exemption.organizationId
    );
    if (!membership && authReq.user.role !== 'ADMIN') {
      throw new AppError('You are not a member of this organization', 403);
    }

    const allowedRoles = ['LOCAL_ADMIN', 'ADMIN'];
    if (membership && !allowedRoles.includes(membership.role) && authReq.user.role !== 'ADMIN') {
      throw new AppError('Only Local Admin or Admin can provide 1st level approval', 403);
    }

    if (exemption.approvalStatus !== 'PENDING_FIRST_APPROVAL') {
      throw new AppError(`Exemption is not pending 1st level approval (current: ${exemption.approvalStatus})`, 400);
    }

    const nextVersion = await getNextExemptionVersion(id, false);

    const updatedExemption = await prisma.exemption.update({
      where: { id },
      data: {
        approvalStatus: 'PENDING_SECOND_APPROVAL',
        version: nextVersion,
        updatedAt: new Date(),
      },
      include: {
        control: {
          select: { id: true, controlId: true, name: true, category: true },
        },
      },
    });

    await createExemptionVersionEntry({
      exemptionId: id,
      version: nextVersion,
      changeDescription: comments || `1st level approval granted for: ${exemption.exemptionId}`,
      actor: `${authReq.user.firstName} ${authReq.user.lastName}`,
      actorDesignation: membership?.role || authReq.user.role,
      action: '1st Level Approval',
      approvedById: authReq.user.id,
    });

    await createAuditLog({
      userId: authReq.user.id,
      organizationId: exemption.organizationId,
      action: 'APPROVE',
      entityType: 'Exemption',
      entityId: id,
      oldValues: { approvalStatus: 'PENDING_FIRST_APPROVAL' },
      newValues: { approvalStatus: 'PENDING_SECOND_APPROVAL', approvedBy: authReq.user.id },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({
      success: true,
      data: updatedExemption,
      message: 'First level approval granted. Pending Admin approval.',
    });
  })
);

// Second level approval (ADMIN only) - final approval
router.post(
  '/:id/second-approval',
  authenticate,
  uuidParam('id'),
  validate,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const authReq = req as AuthenticatedRequest;
    const { comments } = req.body;

    const exemption = await prisma.exemption.findUnique({
      where: { id },
      include: { control: { select: { controlId: true, name: true } } },
    });
    if (!exemption) {
      throw new AppError('Exemption not found', 404);
    }

    const membership = authReq.user.organizationMemberships.find(
      m => m.organizationId === exemption.organizationId
    );
    if (!membership && authReq.user.role !== 'ADMIN') {
      throw new AppError('You are not a member of this organization', 403);
    }

    if (membership && membership.role !== 'ADMIN' && authReq.user.role !== 'ADMIN') {
      throw new AppError('Only Admin can provide 2nd level approval', 403);
    }

    if (exemption.approvalStatus !== 'PENDING_SECOND_APPROVAL') {
      throw new AppError(`Exemption is not pending 2nd level approval (current: ${exemption.approvalStatus})`, 400);
    }

    const majorVersion = await getNextExemptionVersion(id, true);

    const updatedExemption = await prisma.exemption.update({
      where: { id },
      data: {
        approvalStatus: 'APPROVED',
        status: 'ACTIVE',
        version: majorVersion,
        updatedAt: new Date(),
      },
      include: {
        control: {
          select: { id: true, controlId: true, name: true, category: true },
        },
      },
    });

    await createExemptionVersionEntry({
      exemptionId: id,
      version: majorVersion,
      changeDescription: comments || 'Approved Version',
      actor: `${authReq.user.firstName} ${authReq.user.lastName}`,
      actorDesignation: membership?.role || authReq.user.role,
      action: '2nd Level Approval',
      approvedById: authReq.user.id,
    });

    await createAuditLog({
      userId: authReq.user.id,
      organizationId: exemption.organizationId,
      action: 'APPROVE',
      entityType: 'Exemption',
      entityId: id,
      oldValues: { approvalStatus: 'PENDING_SECOND_APPROVAL', version: exemption.version },
      newValues: { approvalStatus: 'APPROVED', status: 'ACTIVE', version: majorVersion, approvedBy: authReq.user.id },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({
      success: true,
      data: updatedExemption,
      message: 'Exemption fully approved and now active. Version bumped to ' + majorVersion.toFixed(1),
    });
  })
);

// Reject exemption
router.post(
  '/:id/reject',
  authenticate,
  uuidParam('id'),
  validate,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const authReq = req as AuthenticatedRequest;
    const { reason } = req.body;

    if (!reason) {
      throw new AppError('Rejection reason is required', 400);
    }

    const exemption = await prisma.exemption.findUnique({
      where: { id },
      include: { control: { select: { controlId: true, name: true } } },
    });
    if (!exemption) {
      throw new AppError('Exemption not found', 404);
    }

    const membership = authReq.user.organizationMemberships.find(
      m => m.organizationId === exemption.organizationId
    );
    if (!membership && authReq.user.role !== 'ADMIN') {
      throw new AppError('You are not a member of this organization', 403);
    }

    const allowedRoles = ['LOCAL_ADMIN', 'ADMIN'];
    if (membership && !allowedRoles.includes(membership.role) && authReq.user.role !== 'ADMIN') {
      throw new AppError('Only Local Admin or Admin can reject exemptions', 403);
    }

    if (!['PENDING_FIRST_APPROVAL', 'PENDING_SECOND_APPROVAL'].includes(exemption.approvalStatus)) {
      throw new AppError(`Exemption is not pending approval (current: ${exemption.approvalStatus})`, 400);
    }

    const nextVersion = await getNextExemptionVersion(id, false);

    const updatedExemption = await prisma.exemption.update({
      where: { id },
      data: {
        approvalStatus: 'REJECTED',
        version: nextVersion,
        comments: `Rejected: ${reason}`,
        updatedAt: new Date(),
      },
      include: {
        control: {
          select: { id: true, controlId: true, name: true, category: true },
        },
      },
    });

    await createExemptionVersionEntry({
      exemptionId: id,
      version: nextVersion,
      changeDescription: `Rejected: ${reason}`,
      actor: `${authReq.user.firstName} ${authReq.user.lastName}`,
      actorDesignation: membership?.role || authReq.user.role,
      action: 'Rejected',
      approvedById: authReq.user.id,
    });

    await createAuditLog({
      userId: authReq.user.id,
      organizationId: exemption.organizationId,
      action: 'REJECT',
      entityType: 'Exemption',
      entityId: id,
      oldValues: { approvalStatus: exemption.approvalStatus },
      newValues: { approvalStatus: 'REJECTED', reason },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({
      success: true,
      data: updatedExemption,
      message: 'Exemption rejected and sent back for revision.',
    });
  })
);

// Revoke an active exemption
router.post(
  '/:id/revoke',
  authenticate,
  requirePermission('exemptions', 'approve'),
  uuidParam('id'),
  validate,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const authReq = req as AuthenticatedRequest;
    const { reason } = req.body;

    if (!reason) {
      throw new AppError('Revocation reason is required', 400);
    }

    const exemption = await prisma.exemption.findUnique({
      where: { id },
      include: { control: { select: { controlId: true, name: true } } },
    });
    if (!exemption) {
      throw new AppError('Exemption not found', 404);
    }

    if (exemption.status !== 'ACTIVE') {
      throw new AppError(`Only active exemptions can be revoked (current: ${exemption.status})`, 400);
    }

    const membership = authReq.user.organizationMemberships.find(
      m => m.organizationId === exemption.organizationId
    );
    if (!membership && authReq.user.role !== 'ADMIN') {
      throw new AppError('You are not a member of this organization', 403);
    }

    const nextVersion = await getNextExemptionVersion(id, false);

    const updatedExemption = await prisma.exemption.update({
      where: { id },
      data: {
        status: 'REVOKED',
        version: nextVersion,
        comments: `Revoked: ${reason}`,
        updatedAt: new Date(),
      },
      include: {
        control: {
          select: { id: true, controlId: true, name: true, category: true },
        },
      },
    });

    await createExemptionVersionEntry({
      exemptionId: id,
      version: nextVersion,
      changeDescription: `Revoked: ${reason}`,
      actor: `${authReq.user.firstName} ${authReq.user.lastName}`,
      actorDesignation: membership?.role || authReq.user.role,
      action: 'Revoked',
      approvedById: authReq.user.id,
    });

    await createAuditLog({
      userId: authReq.user.id,
      organizationId: exemption.organizationId,
      action: 'UPDATE',
      entityType: 'Exemption',
      entityId: id,
      oldValues: { status: exemption.status },
      newValues: { status: 'REVOKED', reason },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({
      success: true,
      data: updatedExemption,
      message: 'Exemption has been revoked.',
    });
  })
);

// Renew an exemption (extend validity)
router.post(
  '/:id/renew',
  authenticate,
  requirePermission('exemptions', 'edit'),
  uuidParam('id'),
  validate,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const authReq = req as AuthenticatedRequest;
    const { validUntil, reviewDate, justification, comments } = req.body;

    if (!validUntil) {
      throw new AppError('New Valid Until date is required for renewal', 400);
    }

    const exemption = await prisma.exemption.findUnique({
      where: { id },
      include: { control: { select: { controlId: true, name: true } } },
    });
    if (!exemption) {
      throw new AppError('Exemption not found', 404);
    }

    if (!['ACTIVE', 'EXPIRED'].includes(exemption.status)) {
      throw new AppError(`Only active or expired exemptions can be renewed (current: ${exemption.status})`, 400);
    }

    const membership = authReq.user.organizationMemberships.find(
      m => m.organizationId === exemption.organizationId
    );
    if (!membership && authReq.user.role !== 'ADMIN') {
      throw new AppError('You are not a member of this organization', 403);
    }

    const nextVersion = await getNextExemptionVersion(id, false);

    const updateData: any = {
      validUntil: new Date(validUntil),
      approvalStatus: 'DRAFT',
      status: 'UNDER_REVIEW',
      version: nextVersion,
      updatedAt: new Date(),
    };

    if (reviewDate !== undefined) updateData.reviewDate = reviewDate ? new Date(reviewDate) : null;
    if (justification !== undefined) updateData.justification = justification;
    if (comments !== undefined) updateData.comments = comments;

    const updatedExemption = await prisma.exemption.update({
      where: { id },
      data: updateData,
      include: {
        control: {
          select: { id: true, controlId: true, name: true, category: true },
        },
        framework: {
          select: { id: true, shortName: true, slug: true },
        },
        requestedBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    await createExemptionVersionEntry({
      exemptionId: id,
      version: nextVersion,
      changeDescription: `Renewal request: validity extended to ${new Date(validUntil).toISOString().split('T')[0]}`,
      actor: `${authReq.user.firstName} ${authReq.user.lastName}`,
      actorDesignation: membership?.role || authReq.user.role,
      action: 'Renewal Request',
      createdById: authReq.user.id,
    });

    await createAuditLog({
      userId: authReq.user.id,
      organizationId: exemption.organizationId,
      action: 'UPDATE',
      entityType: 'Exemption',
      entityId: id,
      oldValues: { validUntil: exemption.validUntil, status: exemption.status },
      newValues: { validUntil, status: 'UNDER_REVIEW', approvalStatus: 'DRAFT' },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({
      success: true,
      data: updatedExemption,
      message: 'Exemption renewal submitted. Requires re-approval.',
    });
  })
);

export default router;
