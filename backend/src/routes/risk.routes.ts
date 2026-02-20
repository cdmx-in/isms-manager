import { Router } from 'express';
import { prisma } from '../index.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { authenticate, requirePermission, AuthenticatedRequest } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { createRiskValidator, uuidParam, paginationQuery } from '../middleware/validators.js';
import { createAuditLog } from '../services/audit.service.js';

const router = Router();

// ============================================
// HELPERS
// ============================================

// Generate next risk ID for organization
const generateRiskId = async (organizationId: string): Promise<string> => {
  const lastRisk = await prisma.risk.findFirst({
    where: { organizationId },
    orderBy: { createdAt: 'desc' },
    select: { riskId: true },
  });

  if (!lastRisk) {
    return 'RISK-001';
  }

  const lastNumber = parseInt(lastRisk.riskId.replace('RISK-', '')) || 0;
  return `RISK-${String(lastNumber + 1).padStart(3, '0')}`;
};

// Get the next version number for a risk
const getNextVersion = async (riskId: string, isMajor: boolean): Promise<number> => {
  const lastVersion = await prisma.riskVersion.findFirst({
    where: { riskId },
    orderBy: { version: 'desc' },
    select: { version: true },
  });

  const current = lastVersion?.version ?? 0;

  if (isMajor) {
    return Math.floor(current) + 1;
  }
  return Math.round((current + 0.1) * 10) / 10;
};

// Create a version snapshot for a risk
const createRiskVersionEntry = async (params: {
  riskId: string;
  version: number;
  changeDescription: string;
  actor: string;
  actorDesignation?: string;
  action: string;
  createdById?: string;
  approvedById?: string;
}) => {
  const riskData = await prisma.risk.findUnique({
    where: { id: params.riskId },
    include: {
      owner: { select: { id: true, firstName: true, lastName: true } },
      treatments: true,
    },
  });

  return prisma.riskVersion.upsert({
    where: {
      riskId_version: {
        riskId: params.riskId,
        version: params.version,
      },
    },
    update: {
      changeDescription: params.changeDescription,
      actor: params.actor,
      actorDesignation: params.actorDesignation,
      action: params.action,
      createdById: params.createdById,
      approvedById: params.approvedById,
      riskData: riskData as any,
    },
    create: {
      riskId: params.riskId,
      version: params.version,
      changeDescription: params.changeDescription,
      actor: params.actor,
      actorDesignation: params.actorDesignation,
      action: params.action,
      createdById: params.createdById,
      approvedById: params.approvedById,
      riskData: riskData as any,
    },
  });
};

// ============================================
// GET ROUTES
// ============================================

// Get risks for organization
router.get(
  '/',
  authenticate,
  requirePermission('risks', 'view'),
  paginationQuery,
  validate,
  asyncHandler(async (req, res) => {
    const {
      page = 1,
      limit = 20,
      organizationId,
      status,
      treatment,
      approvalStatus,
      minRisk,
      maxRisk,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = req.query;

    if (!organizationId) {
      throw new AppError('Organization ID is required', 400);
    }

    const where: any = { organizationId };
    if (status) where.status = status;
    if (treatment) where.treatment = treatment;
    if (approvalStatus) where.approvalStatus = approvalStatus;
    if (minRisk) where.inherentRisk = { gte: Number(minRisk) };
    if (maxRisk) where.inherentRisk = { ...where.inherentRisk, lte: Number(maxRisk) };

    const [risks, total] = await Promise.all([
      prisma.risk.findMany({
        where,
        include: {
          owner: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
          _count: {
            select: { assets: true, controls: true, versions: true },
          },
        },
        orderBy: { [sortBy as string]: sortOrder },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
      prisma.risk.count({ where }),
    ]);

    res.json({
      success: true,
      data: risks,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit)),
      },
    });
  })
);

// Get risk heat map data
router.get(
  '/heatmap',
  authenticate,
  requirePermission('risks', 'view'),
  asyncHandler(async (req, res) => {
    const { organizationId } = req.query;

    if (!organizationId) {
      throw new AppError('Organization ID is required', 400);
    }

    const risks = await prisma.risk.findMany({
      where: {
        organizationId: organizationId as string,
        status: { not: 'CLOSED' },
      },
      select: {
        id: true,
        riskId: true,
        title: true,
        likelihood: true,
        impact: true,
        inherentRisk: true,
        residualRisk: true,
        treatment: true,
        status: true,
      },
    });

    const heatmap: { [key: string]: any[] } = {};
    for (let l = 1; l <= 5; l++) {
      for (let i = 1; i <= 5; i++) {
        heatmap[`${l}-${i}`] = [];
      }
    }

    risks.forEach(risk => {
      const key = `${risk.likelihood}-${risk.impact}`;
      if (heatmap[key]) {
        heatmap[key].push(risk);
      }
    });

    const stats = {
      total: risks.length,
      critical: risks.filter(r => r.inherentRisk && r.inherentRisk >= 20).length,
      high: risks.filter(r => r.inherentRisk && r.inherentRisk >= 12 && r.inherentRisk < 20).length,
      medium: risks.filter(r => r.inherentRisk && r.inherentRisk >= 6 && r.inherentRisk < 12).length,
      low: risks.filter(r => r.inherentRisk && r.inherentRisk < 6).length,
    };

    res.json({
      success: true,
      data: { heatmap, risks, stats },
    });
  })
);

// Get retired risks for organization (must be before /:id route)
router.get(
  '/retired/list',
  authenticate,
  requirePermission('risks', 'view'),
  asyncHandler(async (req, res) => {
    const { organizationId } = req.query;

    if (!organizationId) {
      throw new AppError('Organization ID is required', 400);
    }

    const retiredRisks = await prisma.riskRetirement.findMany({
      where: {
        risk: { organizationId: organizationId as string },
      },
      include: {
        risk: {
          select: {
            id: true,
            riskId: true,
            title: true,
            description: true,
            createdAt: true,
            owner: {
              select: { firstName: true, lastName: true },
            },
          },
        },
        retiredBy: {
          select: { firstName: true, lastName: true },
        },
      },
      orderBy: { retiredAt: 'desc' },
    });

    res.json({
      success: true,
      data: retiredRisks,
    });
  })
);

// Get pending approvals for organization
router.get(
  '/pending-approvals/list',
  authenticate,
  requirePermission('risks', 'view'),
  asyncHandler(async (req, res) => {
    const { organizationId } = req.query;

    if (!organizationId) {
      throw new AppError('Organization ID is required', 400);
    }

    const pendingRisks = await prisma.risk.findMany({
      where: {
        organizationId: organizationId as string,
        approvalStatus: {
          in: ['PENDING_FIRST_APPROVAL', 'PENDING_SECOND_APPROVAL'],
        },
      },
      include: {
        owner: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        createdBy: {
          select: { id: true, firstName: true, lastName: true },
        },
        _count: {
          select: { versions: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    res.json({
      success: true,
      data: pendingRisks,
    });
  })
);

// Get single risk
router.get(
  '/:id',
  authenticate,
  uuidParam('id'),
  validate,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const authReq = req as AuthenticatedRequest;

    const risk = await prisma.risk.findUnique({
      where: { id },
      include: {
        organization: {
          select: { id: true, name: true, slug: true },
        },
        owner: {
          select: { id: true, firstName: true, lastName: true, email: true, avatar: true },
        },
        createdBy: {
          select: { id: true, firstName: true, lastName: true },
        },
        assets: {
          include: {
            asset: {
              select: { id: true, name: true, classification: true, assetType: true },
            },
          },
        },
        controls: {
          include: {
            control: {
              select: { id: true, controlId: true, name: true, implementationStatus: true },
            },
          },
        },
      },
    });

    if (!risk) {
      throw new AppError('Risk not found', 404);
    }

    const membership = authReq.user.organizationMemberships.find(
      m => m.organizationId === risk.organizationId
    );
    if (!membership && authReq.user.role !== 'ADMIN') {
      throw new AppError('You are not authorized to view this risk', 403);
    }

    res.json({
      success: true,
      data: risk,
    });
  })
);

// Get risk version history
router.get(
  '/:id/versions',
  authenticate,
  uuidParam('id'),
  validate,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const authReq = req as AuthenticatedRequest;

    const risk = await prisma.risk.findUnique({ where: { id } });
    if (!risk) {
      throw new AppError('Risk not found', 404);
    }

    const membership = authReq.user.organizationMemberships.find(
      m => m.organizationId === risk.organizationId
    );
    if (!membership && authReq.user.role !== 'ADMIN') {
      throw new AppError('You are not authorized to view this risk', 403);
    }

    const versions = await prisma.riskVersion.findMany({
      where: { riskId: id },
      orderBy: { version: 'desc' },
    });

    res.json({
      success: true,
      data: versions,
    });
  })
);

// Update risk version entry description
router.patch(
  '/:id/versions/:versionId',
  authenticate,
  uuidParam('id'),
  validate,
  asyncHandler(async (req, res) => {
    const { id, versionId } = req.params;
    const authReq = req as AuthenticatedRequest;
    const { changeDescription } = req.body;

    if (!changeDescription?.trim()) throw new AppError('Change description is required', 400);

    const risk = await prisma.risk.findUnique({ where: { id } });
    if (!risk) throw new AppError('Risk not found', 404);

    const membership = authReq.user.organizationMemberships.find(
      m => m.organizationId === risk.organizationId
    );
    if (!membership && authReq.user.role !== 'ADMIN') {
      throw new AppError('You are not authorized to edit this risk', 403);
    }

    const version = await prisma.riskVersion.findUnique({ where: { id: versionId } });
    if (!version || version.riskId !== id) {
      throw new AppError('Version entry not found', 404);
    }

    const updated = await prisma.riskVersion.update({
      where: { id: versionId },
      data: { changeDescription: changeDescription.trim() },
    });

    await createAuditLog({
      userId: authReq.user.id,
      organizationId: risk.organizationId,
      action: 'UPDATE',
      entityType: 'RiskVersion',
      entityId: versionId,
      oldValues: { changeDescription: version.changeDescription },
      newValues: { changeDescription: changeDescription.trim() },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({ success: true, data: updated });
  })
);

// Get risk treatments
router.get(
  '/:id/treatment',
  authenticate,
  uuidParam('id'),
  validate,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const authReq = req as AuthenticatedRequest;

    const risk = await prisma.risk.findUnique({ where: { id } });
    if (!risk) {
      throw new AppError('Risk not found', 404);
    }

    const membership = authReq.user.organizationMemberships.find(
      m => m.organizationId === risk.organizationId
    );
    if (!membership && authReq.user.role !== 'ADMIN') {
      throw new AppError('You are not authorized to view this risk', 403);
    }

    const treatments = await prisma.riskTreatment.findMany({
      where: { riskId: id },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      success: true,
      data: treatments,
    });
  })
);

// ============================================
// CREATE & UPDATE ROUTES
// ============================================

// Create risk (auto-creates initial version v0.1)
router.post(
  '/',
  authenticate,
  requirePermission('risks', 'edit'),
  createRiskValidator,
  validate,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const {
      organizationId,
      title,
      description,
      category,
      likelihood = 3,
      impact = 3,
      treatment,
      treatmentPlan,
      treatmentDueDate,
      ownerId,
      assetIds,
      controlDescription,
      controlsReference,
      affectsConfidentiality,
      affectsIntegrity,
      affectsAvailability,
    } = req.body;

    const riskId = await generateRiskId(organizationId);
    const inherentRisk = likelihood * impact;

    const risk = await prisma.risk.create({
      data: {
        organizationId,
        riskId,
        title,
        description,
        category,
        likelihood,
        impact,
        inherentRisk,
        version: 0.1,
        approvalStatus: 'DRAFT',
        treatment: treatment || 'PENDING',
        treatmentPlan,
        treatmentDueDate: treatmentDueDate ? new Date(treatmentDueDate) : undefined,
        controlDescription,
        controlsReference,
        ownerId,
        createdById: authReq.user.id,
        affectsConfidentiality: affectsConfidentiality || false,
        affectsIntegrity: affectsIntegrity || false,
        affectsAvailability: affectsAvailability || false,
        assets: assetIds?.length ? {
          create: assetIds.map((assetId: string) => ({ assetId })),
        } : undefined,
      },
      include: {
        owner: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        assets: {
          include: {
            asset: {
              select: { id: true, name: true },
            },
          },
        },
      },
    });

    // Auto-create initial version entry (v0.1 - Draft)
    await createRiskVersionEntry({
      riskId: risk.id,
      version: 0.1,
      changeDescription: `Initial risk identification: ${title}`,
      actor: `${authReq.user.firstName} ${authReq.user.lastName}`,
      actorDesignation: authReq.user.designation || authReq.user.organizationMemberships.find(m => m.organizationId === organizationId)?.role || authReq.user.role,
      action: 'Draft & Review',
      createdById: authReq.user.id,
    });

    await createAuditLog({
      userId: authReq.user.id,
      organizationId,
      action: 'CREATE',
      entityType: 'Risk',
      entityId: risk.id,
      newValues: { riskId, title, likelihood, impact, inherentRisk, version: 0.1 },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.status(201).json({
      success: true,
      data: risk,
    });
  })
);

// Update risk (auto-creates version entry for significant changes)
router.patch(
  '/:id',
  authenticate,
  uuidParam('id'),
  validate,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const authReq = req as AuthenticatedRequest;

    const existingRisk = await prisma.risk.findUnique({ where: { id } });
    if (!existingRisk) {
      throw new AppError('Risk not found', 404);
    }

    const membership = authReq.user.organizationMemberships.find(
      m => m.organizationId === existingRisk.organizationId
    );
    if (!membership && authReq.user.role !== 'ADMIN') {
      throw new AppError('You are not authorized to update this risk', 403);
    }

    if (membership?.role === 'VIEWER') {
      throw new AppError('Viewers cannot update risks', 403);
    }

    const {
      title,
      description,
      category,
      likelihood,
      impact,
      treatment,
      treatmentPlan,
      treatmentDueDate,
      status,
      ownerId,
      residualRisk,
      residualProbability,
      residualImpact,
      controlDescription,
      controlsReference,
      comments,
      affectsConfidentiality,
      affectsIntegrity,
      affectsAvailability,
      changeDescription, // Optional description for the version entry
    } = req.body;

    const updateData: any = {};
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (category !== undefined) updateData.category = category;
    if (likelihood !== undefined) updateData.likelihood = likelihood;
    if (impact !== undefined) updateData.impact = impact;
    if (treatment !== undefined) updateData.treatment = treatment;
    if (treatmentPlan !== undefined) updateData.treatmentPlan = treatmentPlan;
    if (treatmentDueDate !== undefined) updateData.treatmentDueDate = treatmentDueDate ? new Date(treatmentDueDate) : null;
    if (status !== undefined) updateData.status = status;
    if (ownerId !== undefined) updateData.ownerId = ownerId;
    if (residualRisk !== undefined) updateData.residualRisk = residualRisk;
    if (residualProbability !== undefined) updateData.residualProbability = residualProbability;
    if (residualImpact !== undefined) updateData.residualImpact = residualImpact;
    if (controlDescription !== undefined) updateData.controlDescription = controlDescription;
    if (controlsReference !== undefined) updateData.controlsReference = controlsReference;
    if (comments !== undefined) updateData.comments = comments;
    if (affectsConfidentiality !== undefined) updateData.affectsConfidentiality = affectsConfidentiality;
    if (affectsIntegrity !== undefined) updateData.affectsIntegrity = affectsIntegrity;
    if (affectsAvailability !== undefined) updateData.affectsAvailability = affectsAvailability;

    // Recalculate inherent risk if likelihood or impact changed
    const newLikelihood = updateData.likelihood ?? existingRisk.likelihood;
    const newImpact = updateData.impact ?? existingRisk.impact;
    updateData.inherentRisk = newLikelihood * newImpact;

    // Reset approval status to DRAFT on any edit (requires re-approval)
    if (existingRisk.approvalStatus === 'APPROVED') {
      updateData.approvalStatus = 'DRAFT';
    }

    updateData.reviewedAt = new Date();

    const risk = await prisma.risk.update({
      where: { id },
      data: updateData,
      include: {
        owner: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    await createAuditLog({
      userId: authReq.user.id,
      organizationId: existingRisk.organizationId,
      action: 'UPDATE',
      entityType: 'Risk',
      entityId: id,
      oldValues: { title: existingRisk.title, status: existingRisk.status, version: existingRisk.version },
      newValues: updateData,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({
      success: true,
      data: risk,
    });
  })
);

// ============================================
// APPROVAL WORKFLOW ROUTES
// ============================================

// Submit risk for review/approval
router.post(
  '/:id/submit-for-review',
  authenticate,
  uuidParam('id'),
  validate,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const authReq = req as AuthenticatedRequest;
    const { changeDescription, versionBump } = req.body;

    if (!changeDescription) throw new AppError('Description of change is required', 400);

    const risk = await prisma.risk.findUnique({ where: { id } });
    if (!risk) {
      throw new AppError('Risk not found', 404);
    }

    const membership = authReq.user.organizationMemberships.find(
      m => m.organizationId === risk.organizationId
    );
    if (!membership && authReq.user.role !== 'ADMIN') {
      throw new AppError('You are not a member of this organization', 403);
    }

    if (membership?.role === 'VIEWER') {
      throw new AppError('Viewers cannot submit risks for review', 403);
    }

    if (risk.approvalStatus !== 'DRAFT' && risk.approvalStatus !== 'REJECTED') {
      throw new AppError(`Risk cannot be submitted for review from ${risk.approvalStatus} status`, 400);
    }

    // 'none'/undefined = keep current, 'minor'/'major' = bump
    const nextVersion = (!versionBump || versionBump === 'none')
      ? risk.version
      : await getNextVersion(id, versionBump === 'major');

    const updatedRisk = await prisma.risk.update({
      where: { id },
      data: {
        approvalStatus: 'PENDING_FIRST_APPROVAL',
        version: nextVersion,
        updatedAt: new Date(),
      },
      include: {
        owner: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    await createRiskVersionEntry({
      riskId: id,
      version: nextVersion,
      changeDescription,
      actor: `${authReq.user.firstName} ${authReq.user.lastName}`,
      actorDesignation: authReq.user.designation || membership?.role || authReq.user.role,
      action: 'Submitted for Review',
      createdById: authReq.user.id,
    });

    await createAuditLog({
      userId: authReq.user.id,
      organizationId: risk.organizationId,
      action: 'UPDATE',
      entityType: 'Risk',
      entityId: id,
      oldValues: { approvalStatus: risk.approvalStatus },
      newValues: { approvalStatus: 'PENDING_FIRST_APPROVAL' },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({
      success: true,
      data: updatedRisk,
      message: 'Risk submitted for 1st level approval',
    });
  })
);

// First level approval (COO / LOCAL_ADMIN role)
router.post(
  '/:id/first-approval',
  authenticate,
  uuidParam('id'),
  validate,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const authReq = req as AuthenticatedRequest;
    const { comments } = req.body;

    const risk = await prisma.risk.findUnique({ where: { id } });
    if (!risk) {
      throw new AppError('Risk not found', 404);
    }

    const membership = authReq.user.organizationMemberships.find(
      m => m.organizationId === risk.organizationId
    );
    if (!membership && authReq.user.role !== 'ADMIN') {
      throw new AppError('You are not a member of this organization', 403);
    }

    // Only LOCAL_ADMIN (COO equivalent) or ADMIN can give 1st level approval
    const allowedRoles = ['LOCAL_ADMIN', 'ADMIN'];
    if (membership && !allowedRoles.includes(membership.role) && authReq.user.role !== 'ADMIN') {
      throw new AppError('Only COO/Local Admin or higher can provide 1st level approval', 403);
    }

    if (risk.approvalStatus !== 'PENDING_FIRST_APPROVAL') {
      throw new AppError(`Risk is not pending 1st level approval (current: ${risk.approvalStatus})`, 400);
    }

    const updatedRisk = await prisma.risk.update({
      where: { id },
      data: {
        approvalStatus: 'PENDING_SECOND_APPROVAL',
        comments: comments || risk.comments,
        updatedAt: new Date(),
      },
      include: {
        owner: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    await createAuditLog({
      userId: authReq.user.id,
      organizationId: risk.organizationId,
      action: 'APPROVE',
      entityType: 'Risk',
      entityId: id,
      oldValues: { approvalStatus: 'PENDING_FIRST_APPROVAL' },
      newValues: { approvalStatus: 'PENDING_SECOND_APPROVAL', approvedBy: authReq.user.id },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({
      success: true,
      data: updatedRisk,
      message: 'First level approval granted. Pending CEO/Admin approval.',
    });
  })
);

// Second level approval (CEO / ADMIN role) - final approval
router.post(
  '/:id/second-approval',
  authenticate,
  uuidParam('id'),
  validate,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const authReq = req as AuthenticatedRequest;
    const { comments } = req.body;

    const risk = await prisma.risk.findUnique({ where: { id } });
    if (!risk) {
      throw new AppError('Risk not found', 404);
    }

    const membership = authReq.user.organizationMemberships.find(
      m => m.organizationId === risk.organizationId
    );
    if (!membership && authReq.user.role !== 'ADMIN') {
      throw new AppError('You are not a member of this organization', 403);
    }

    // Only ADMIN (CEO equivalent) can give 2nd level approval
    if (membership && membership.role !== 'ADMIN' && authReq.user.role !== 'ADMIN') {
      throw new AppError('Only CEO/Admin can provide 2nd level approval', 403);
    }

    if (risk.approvalStatus !== 'PENDING_SECOND_APPROVAL') {
      throw new AppError(`Risk is not pending 2nd level approval (current: ${risk.approvalStatus})`, 400);
    }

    const updatedRisk = await prisma.risk.update({
      where: { id },
      data: {
        approvalStatus: 'APPROVED',
        comments: comments || risk.comments,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      },
      include: {
        owner: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    await createAuditLog({
      userId: authReq.user.id,
      organizationId: risk.organizationId,
      action: 'APPROVE',
      entityType: 'Risk',
      entityId: id,
      oldValues: { approvalStatus: 'PENDING_SECOND_APPROVAL' },
      newValues: { approvalStatus: 'APPROVED', approvedBy: authReq.user.id },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({
      success: true,
      data: updatedRisk,
      message: 'Risk fully approved (v' + risk.version.toFixed(1) + ')',
    });
  })
);

// Reject risk (send back to draft)
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

    const risk = await prisma.risk.findUnique({ where: { id } });
    if (!risk) {
      throw new AppError('Risk not found', 404);
    }

    const membership = authReq.user.organizationMemberships.find(
      m => m.organizationId === risk.organizationId
    );
    if (!membership && authReq.user.role !== 'ADMIN') {
      throw new AppError('You are not a member of this organization', 403);
    }

    // LOCAL_ADMIN or ADMIN can reject
    const allowedRoles = ['LOCAL_ADMIN', 'ADMIN'];
    if (membership && !allowedRoles.includes(membership.role) && authReq.user.role !== 'ADMIN') {
      throw new AppError('Only Local Admin or Admin can reject risks', 403);
    }

    if (!['PENDING_FIRST_APPROVAL', 'PENDING_SECOND_APPROVAL'].includes(risk.approvalStatus)) {
      throw new AppError(`Risk is not pending approval (current: ${risk.approvalStatus})`, 400);
    }

    const updatedRisk = await prisma.risk.update({
      where: { id },
      data: {
        approvalStatus: 'REJECTED',
        comments: `Rejected: ${reason}`,
        updatedAt: new Date(),
      },
      include: {
        owner: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    await createAuditLog({
      userId: authReq.user.id,
      organizationId: risk.organizationId,
      action: 'REJECT',
      entityType: 'Risk',
      entityId: id,
      oldValues: { approvalStatus: risk.approvalStatus },
      newValues: { approvalStatus: 'REJECTED', reason },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({
      success: true,
      data: updatedRisk,
      message: 'Risk rejected and sent back for revision.',
    });
  })
);

// ============================================
// TREATMENT & RETIREMENT ROUTES
// ============================================

// Create risk treatment
router.post(
  '/:id/treatment',
  authenticate,
  uuidParam('id'),
  validate,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const authReq = req as AuthenticatedRequest;
    const {
      residualProbability,
      residualImpact,
      riskResponse,
      controlDescription,
      controlImplementationDate,
      comments,
    } = req.body;

    const risk = await prisma.risk.findUnique({ where: { id } });
    if (!risk) {
      throw new AppError('Risk not found', 404);
    }

    const membership = authReq.user.organizationMemberships.find(
      m => m.organizationId === risk.organizationId
    );
    if (!membership && authReq.user.role !== 'ADMIN') {
      throw new AppError('You are not authorized to modify this risk', 403);
    }

    if (membership?.role === 'VIEWER') {
      throw new AppError('Viewers cannot create risk treatments', 403);
    }

    const identificationDate = risk.createdAt;
    const implementationDate = controlImplementationDate ? new Date(controlImplementationDate) : new Date();
    const treatmentTimeInDays = Math.ceil((implementationDate.getTime() - identificationDate.getTime()) / (1000 * 60 * 60 * 24));

    const treatment = await prisma.riskTreatment.create({
      data: {
        riskId: id,
        residualProbability,
        residualImpact,
        residualRisk: residualProbability * residualImpact,
        riskResponse,
        controlDescription,
        controlImplementationDate: implementationDate,
        comments,
        treatmentTimeInDays,
      },
    });

    // Update risk with residual risk and treatment info
    await prisma.risk.update({
      where: { id },
      data: {
        residualRisk: residualProbability * residualImpact,
        residualProbability,
        residualImpact,
        treatment: riskResponse,
        controlDescription,
        reviewedAt: new Date(),
      },
    });

    // No version bump on treatment — user controls versioning at submit time

    await createAuditLog({
      userId: authReq.user.id,
      organizationId: risk.organizationId,
      action: 'CREATE',
      entityType: 'RiskTreatment',
      entityId: treatment.id,
      newValues: { riskId: id, riskResponse, residualRisk: treatment.residualRisk },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.status(201).json({
      success: true,
      data: treatment,
    });
  })
);

// Link controls to risk
router.post(
  '/:id/controls',
  authenticate,
  uuidParam('id'),
  validate,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const authReq = req as AuthenticatedRequest;
    const { controlIds } = req.body;

    const risk = await prisma.risk.findUnique({ where: { id } });
    if (!risk) {
      throw new AppError('Risk not found', 404);
    }

    const membership = authReq.user.organizationMemberships.find(
      m => m.organizationId === risk.organizationId
    );
    if (!membership && authReq.user.role !== 'ADMIN') {
      throw new AppError('You are not authorized to modify this risk', 403);
    }

    await prisma.riskControl.deleteMany({ where: { riskId: id } });

    if (controlIds?.length > 0) {
      await prisma.riskControl.createMany({
        data: controlIds.map((controlId: string) => ({
          riskId: id,
          controlId,
        })),
      });
    }

    const updatedRisk = await prisma.risk.findUnique({
      where: { id },
      include: {
        controls: {
          include: {
            control: {
              select: { id: true, controlId: true, name: true, implementationStatus: true },
            },
          },
        },
      },
    });

    res.json({
      success: true,
      data: updatedRisk,
    });
  })
);

// Retire risk
router.post(
  '/:id/retire',
  authenticate,
  uuidParam('id'),
  validate,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const authReq = req as AuthenticatedRequest;
    const { reason } = req.body;

    const risk = await prisma.risk.findUnique({ where: { id } });
    if (!risk) {
      throw new AppError('Risk not found', 404);
    }

    const membership = authReq.user.organizationMemberships.find(
      m => m.organizationId === risk.organizationId
    );
    if (!membership && authReq.user.role !== 'ADMIN') {
      throw new AppError('You are not authorized to retire this risk', 403);
    }

    if (membership?.role === 'VIEWER') {
      throw new AppError('Viewers cannot retire risks', 403);
    }

    const retirement = await prisma.riskRetirement.create({
      data: {
        riskId: id,
        reason,
        retiredById: authReq.user.id,
      },
    });

    await prisma.risk.update({
      where: { id },
      data: { status: 'CLOSED' },
    });

    // Log retirement at current version
    await createRiskVersionEntry({
      riskId: id,
      version: risk.version,
      changeDescription: `Risk retired: ${reason}`,
      actor: `${authReq.user.firstName} ${authReq.user.lastName}`,
      actorDesignation: authReq.user.designation || membership?.role || authReq.user.role,
      action: 'Risk Retired',
      createdById: authReq.user.id,
    });

    await createAuditLog({
      userId: authReq.user.id,
      organizationId: risk.organizationId,
      action: 'UPDATE',
      entityType: 'Risk',
      entityId: id,
      newValues: { status: 'CLOSED', retirement: true },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.status(201).json({
      success: true,
      data: retirement,
    });
  })
);

// ============================================
// DELETE ROUTE
// ============================================

router.delete(
  '/:id',
  authenticate,
  uuidParam('id'),
  validate,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const authReq = req as AuthenticatedRequest;

    const risk = await prisma.risk.findUnique({ where: { id } });
    if (!risk) {
      throw new AppError('Risk not found', 404);
    }

    const membership = authReq.user.organizationMemberships.find(
      m => m.organizationId === risk.organizationId
    );
    if (!membership && authReq.user.role !== 'ADMIN') {
      throw new AppError('You are not authorized to delete this risk', 403);
    }

    if (membership && !['ADMIN', 'LOCAL_ADMIN'].includes(membership.role)) {
      throw new AppError('Only admins can delete risks', 403);
    }

    await prisma.risk.delete({ where: { id } });

    await createAuditLog({
      userId: authReq.user.id,
      organizationId: risk.organizationId,
      action: 'DELETE',
      entityType: 'Risk',
      entityId: id,
      oldValues: { riskId: risk.riskId, title: risk.title },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({
      success: true,
      message: 'Risk deleted successfully',
    });
  })
);

export default router;
