import { Router } from 'express';
import { prisma } from '../index.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { authenticate, AuthenticatedRequest } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { uuidParam, paginationQuery } from '../middleware/validators.js';
import { createAuditLog } from '../services/audit.service.js';

const router = Router();

// ============================================
// HELPERS
// ============================================

const getNextSoAVersion = async (soaEntryId: string, isMajor: boolean): Promise<number> => {
  const lastVersion = await prisma.soAVersion.findFirst({
    where: { soaEntryId },
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

const createSoAVersionEntry = async (params: {
  soaEntryId: string;
  version: number;
  changeDescription: string;
  actor: string;
  actorDesignation?: string;
  action: string;
  createdById?: string;
  approvedById?: string;
}) => {
  const soaData = await prisma.soAEntry.findUnique({
    where: { id: params.soaEntryId },
    include: {
      control: {
        select: { id: true, controlId: true, name: true, category: true },
      },
    },
  });

  return prisma.soAVersion.create({
    data: {
      soaEntryId: params.soaEntryId,
      version: params.version,
      changeDescription: params.changeDescription,
      actor: params.actor,
      actorDesignation: params.actorDesignation,
      action: params.action,
      createdById: params.createdById,
      approvedById: params.approvedById,
      soaData: soaData as any,
    },
  });
};

// ============================================
// GET ROUTES
// ============================================

// Get Statement of Applicability
router.get(
  '/',
  authenticate,
  paginationQuery,
  validate,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const {
      page = 1,
      limit = 200,
      organizationId,
      category,
      applicable,
      status,
      approvalStatus,
      search,
      sortBy = 'controlId',
      sortOrder = 'asc',
    } = req.query;

    if (!organizationId) {
      throw new AppError('Organization ID is required', 400);
    }

    const membership = authReq.user.organizationMemberships.find(
      m => m.organizationId === organizationId
    );
    if (!membership && authReq.user.role !== 'ADMIN') {
      throw new AppError('You are not a member of this organization', 403);
    }

    const where: any = { organizationId };
    if (category) {
      where.control = { category };
    }
    if (applicable !== undefined) {
      where.isApplicable = applicable === 'true';
    }
    if (status) {
      where.status = status;
    }
    if (approvalStatus) {
      where.approvalStatus = approvalStatus;
    }

    // Search by control name or ID
    if (search) {
      where.control = {
        ...where.control,
        OR: [
          { controlId: { contains: search as string, mode: 'insensitive' } },
          { name: { contains: search as string, mode: 'insensitive' } },
        ],
      };
    }

    const [entries, total] = await Promise.all([
      prisma.soAEntry.findMany({
        where,
        include: {
          control: {
            select: {
              id: true,
              controlId: true,
              name: true,
              description: true,
              objective: true,
              category: true,
              implementationStatus: true,
              implementationPercent: true,
            },
          },
          _count: {
            select: { versions: true },
          },
        },
        orderBy: { control: { [sortBy as string]: sortOrder } },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
      prisma.soAEntry.count({ where }),
    ]);

    // Calculate SoA statistics
    const allEntries = await prisma.soAEntry.findMany({
      where: { organizationId: organizationId as string },
      select: { isApplicable: true, status: true, approvalStatus: true },
    });

    const stats = {
      total: allEntries.length,
      applicable: allEntries.filter(e => e.isApplicable).length,
      notApplicable: allEntries.filter(e => !e.isApplicable).length,
      implemented: allEntries.filter(e => e.isApplicable && e.status === 'IMPLEMENTED').length,
      inProgress: allEntries.filter(e => e.isApplicable && e.status === 'IN_PROGRESS').length,
      notStarted: allEntries.filter(e => e.isApplicable && e.status === 'NOT_STARTED').length,
      pendingApproval: allEntries.filter(e =>
        e.approvalStatus === 'PENDING_FIRST_APPROVAL' || e.approvalStatus === 'PENDING_SECOND_APPROVAL'
      ).length,
    };

    res.json({
      success: true,
      data: entries,
      stats,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit)),
      },
    });
  })
);

// Get SoA export data
router.get(
  '/export',
  authenticate,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const { organizationId, format = 'json' } = req.query;

    if (!organizationId) {
      throw new AppError('Organization ID is required', 400);
    }

    const membership = authReq.user.organizationMemberships.find(
      m => m.organizationId === organizationId
    );
    if (!membership && authReq.user.role !== 'ADMIN') {
      throw new AppError('You are not a member of this organization', 403);
    }

    const organization = await prisma.organization.findUnique({
      where: { id: organizationId as string },
      select: { name: true, slug: true },
    });

    const entries = await prisma.soAEntry.findMany({
      where: { organizationId: organizationId as string },
      include: {
        control: {
          select: {
            controlId: true,
            name: true,
            description: true,
            objective: true,
            category: true,
            implementationStatus: true,
            implementationPercent: true,
            implementationNotes: true,
            maturity: true,
          },
        },
      },
      orderBy: { control: { controlId: 'asc' } },
    });

    if (format === 'csv') {
      const headers = [
        'Control No',
        'Control Name',
        'Control',
        'Category',
        'Source',
        'Applicability',
        'Status',
        'Control Owner',
        'Justification',
        'Documentation References',
        'Comments',
        'Version',
        'Approval Status',
      ].join(',');

      const rows = entries.map(e => [
        e.control.controlId,
        `"${e.control.name.replace(/"/g, '""')}"`,
        `"${(e.control.description || '').replace(/"/g, '""')}"`,
        e.control.category,
        e.controlSource,
        e.isApplicable ? 'Yes' : 'No',
        e.status,
        `"${(e.controlOwner || '').replace(/"/g, '""')}"`,
        `"${(e.justification || '').replace(/"/g, '""')}"`,
        `"${(e.documentationReferences || '').replace(/"/g, '""')}"`,
        `"${(e.comments || '').replace(/"/g, '""')}"`,
        e.version.toFixed(1),
        e.approvalStatus,
      ].join(','));

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="soa-${organization?.slug}.csv"`);
      return res.send([headers, ...rows].join('\n'));
    }

    const groupedByCategory = entries.reduce((acc: any, entry) => {
      const category = entry.control.category;
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push(entry);
      return acc;
    }, {});

    res.json({
      success: true,
      data: {
        organization: organization?.name,
        generatedAt: new Date().toISOString(),
        totalControls: entries.length,
        applicableControls: entries.filter(e => e.isApplicable).length,
        byCategory: Object.keys(groupedByCategory).map(cat => ({
          category: cat,
          controls: groupedByCategory[cat],
        })),
        allEntries: entries,
      },
    });
  })
);

// Get pending approvals
router.get(
  '/pending-approvals',
  authenticate,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const { organizationId } = req.query;

    if (!organizationId) {
      throw new AppError('Organization ID is required', 400);
    }

    const membership = authReq.user.organizationMemberships.find(
      m => m.organizationId === organizationId
    );
    if (!membership && authReq.user.role !== 'ADMIN') {
      throw new AppError('You are not a member of this organization', 403);
    }

    const pendingEntries = await prisma.soAEntry.findMany({
      where: {
        organizationId: organizationId as string,
        approvalStatus: {
          in: ['PENDING_FIRST_APPROVAL', 'PENDING_SECOND_APPROVAL'],
        },
      },
      include: {
        control: {
          select: {
            id: true,
            controlId: true,
            name: true,
            description: true,
            category: true,
          },
        },
        _count: {
          select: { versions: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    res.json({
      success: true,
      data: pendingEntries,
    });
  })
);

// Get single SoA entry
router.get(
  '/:id',
  authenticate,
  uuidParam('id'),
  validate,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const authReq = req as AuthenticatedRequest;

    const entry = await prisma.soAEntry.findUnique({
      where: { id },
      include: {
        control: {
          select: {
            id: true,
            controlId: true,
            name: true,
            description: true,
            objective: true,
            category: true,
            implementationStatus: true,
            implementationPercent: true,
          },
        },
        _count: {
          select: { versions: true },
        },
      },
    });

    if (!entry) {
      throw new AppError('SoA entry not found', 404);
    }

    const membership = authReq.user.organizationMemberships.find(
      m => m.organizationId === entry.organizationId
    );
    if (!membership && authReq.user.role !== 'ADMIN') {
      throw new AppError('You are not authorized to view this entry', 403);
    }

    res.json({
      success: true,
      data: entry,
    });
  })
);

// Get SoA entry version history
router.get(
  '/:id/versions',
  authenticate,
  uuidParam('id'),
  validate,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const authReq = req as AuthenticatedRequest;

    const entry = await prisma.soAEntry.findUnique({ where: { id } });
    if (!entry) {
      throw new AppError('SoA entry not found', 404);
    }

    const membership = authReq.user.organizationMemberships.find(
      m => m.organizationId === entry.organizationId
    );
    if (!membership && authReq.user.role !== 'ADMIN') {
      throw new AppError('You are not authorized to view this entry', 403);
    }

    const versions = await prisma.soAVersion.findMany({
      where: { soaEntryId: id },
      orderBy: { version: 'desc' },
    });

    res.json({
      success: true,
      data: versions,
    });
  })
);

// ============================================
// UPDATE ROUTES
// ============================================

// Update SoA entry
router.patch(
  '/:id',
  authenticate,
  uuidParam('id'),
  validate,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const authReq = req as AuthenticatedRequest;

    const existingEntry = await prisma.soAEntry.findUnique({
      where: { id },
      include: { control: { select: { controlId: true, name: true } } },
    });
    if (!existingEntry) {
      throw new AppError('SoA entry not found', 404);
    }

    const membership = authReq.user.organizationMemberships.find(
      m => m.organizationId === existingEntry.organizationId
    );
    if (!membership && authReq.user.role !== 'ADMIN') {
      throw new AppError('You are not authorized to update this entry', 403);
    }

    if (membership && !['ADMIN', 'LOCAL_ADMIN', 'AUDITOR'].includes(membership.role)) {
      throw new AppError('Only admins and auditors can update SoA', 403);
    }

    const {
      isApplicable,
      justification,
      exclusionReason,
      status,
      controlOwner,
      documentationReferences,
      comments,
      controlSource,
      changeDescription,
    } = req.body;

    const updateData: any = {};
    if (isApplicable !== undefined) updateData.isApplicable = isApplicable;
    if (justification !== undefined) updateData.justification = justification;
    if (exclusionReason !== undefined) updateData.exclusionReason = exclusionReason;
    if (status !== undefined) updateData.status = status;
    if (controlOwner !== undefined) updateData.controlOwner = controlOwner;
    if (documentationReferences !== undefined) updateData.documentationReferences = documentationReferences;
    if (comments !== undefined) updateData.comments = comments;
    if (controlSource !== undefined) updateData.controlSource = controlSource;

    // Reset approval status to DRAFT on edit if currently APPROVED
    if (existingEntry.approvalStatus === 'APPROVED') {
      updateData.approvalStatus = 'DRAFT';
    }

    // Bump minor version
    const nextVersion = await getNextSoAVersion(id, false);
    updateData.version = nextVersion;

    const entry = await prisma.soAEntry.update({
      where: { id },
      data: updateData,
      include: {
        control: {
          select: {
            id: true,
            controlId: true,
            name: true,
            category: true,
            implementationStatus: true,
          },
        },
      },
    });

    // Create version entry for this update
    await createSoAVersionEntry({
      soaEntryId: id,
      version: nextVersion,
      changeDescription: changeDescription || `SoA entry updated: ${Object.keys(updateData).filter(k => !['version', 'approvalStatus'].includes(k)).join(', ')}`,
      actor: `${authReq.user.firstName} ${authReq.user.lastName}`,
      actorDesignation: membership?.role || authReq.user.role,
      action: 'Updation',
      createdById: authReq.user.id,
    });

    await createAuditLog({
      userId: authReq.user.id,
      organizationId: existingEntry.organizationId,
      action: 'UPDATE',
      entityType: 'SoA',
      entityId: id,
      oldValues: {
        controlId: existingEntry.control.controlId,
        isApplicable: existingEntry.isApplicable,
        status: existingEntry.status,
        version: existingEntry.version,
      },
      newValues: updateData,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({
      success: true,
      data: entry,
    });
  })
);

// Bulk update SoA entries
router.patch(
  '/bulk',
  authenticate,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const { organizationId, updates } = req.body;

    if (!organizationId) {
      throw new AppError('Organization ID is required', 400);
    }

    if (!Array.isArray(updates)) {
      throw new AppError('Updates must be an array', 400);
    }

    const membership = authReq.user.organizationMemberships.find(
      m => m.organizationId === organizationId
    );
    if (!membership && authReq.user.role !== 'ADMIN') {
      throw new AppError('You are not a member of this organization', 403);
    }

    if (membership && !['ADMIN', 'LOCAL_ADMIN', 'AUDITOR'].includes(membership.role)) {
      throw new AppError('Only admins and auditors can update SoA', 403);
    }

    const results = await prisma.$transaction(
      updates.map((update: any) =>
        prisma.soAEntry.update({
          where: { id: update.id },
          data: {
            isApplicable: update.isApplicable,
            justification: update.justification,
            status: update.status,
            controlOwner: update.controlOwner,
            documentationReferences: update.documentationReferences,
            comments: update.comments,
          },
        })
      )
    );

    await createAuditLog({
      userId: authReq.user.id,
      organizationId,
      action: 'UPDATE',
      entityType: 'SoA',
      newValues: { bulkUpdated: updates.length },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({
      success: true,
      data: { updated: results.length },
    });
  })
);

// ============================================
// APPROVAL WORKFLOW ROUTES
// ============================================

// Submit SoA entry for review
router.post(
  '/:id/submit-for-review',
  authenticate,
  uuidParam('id'),
  validate,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const authReq = req as AuthenticatedRequest;
    const { changeDescription } = req.body;

    const entry = await prisma.soAEntry.findUnique({
      where: { id },
      include: { control: { select: { controlId: true, name: true } } },
    });
    if (!entry) {
      throw new AppError('SoA entry not found', 404);
    }

    const membership = authReq.user.organizationMemberships.find(
      m => m.organizationId === entry.organizationId
    );
    if (!membership && authReq.user.role !== 'ADMIN') {
      throw new AppError('You are not a member of this organization', 403);
    }

    if (membership?.role === 'VIEWER') {
      throw new AppError('Viewers cannot submit SoA entries for review', 403);
    }

    if (entry.approvalStatus !== 'DRAFT' && entry.approvalStatus !== 'REJECTED') {
      throw new AppError(`Entry cannot be submitted for review from ${entry.approvalStatus} status`, 400);
    }

    const nextVersion = await getNextSoAVersion(id, false);

    const updatedEntry = await prisma.soAEntry.update({
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

    await createSoAVersionEntry({
      soaEntryId: id,
      version: nextVersion,
      changeDescription: changeDescription || `SoA entry submitted for review: ${entry.control.controlId} - ${entry.control.name}`,
      actor: `${authReq.user.firstName} ${authReq.user.lastName}`,
      actorDesignation: membership?.role || authReq.user.role,
      action: 'Submitted for Review',
      createdById: authReq.user.id,
    });

    await createAuditLog({
      userId: authReq.user.id,
      organizationId: entry.organizationId,
      action: 'UPDATE',
      entityType: 'SoA',
      entityId: id,
      oldValues: { approvalStatus: entry.approvalStatus },
      newValues: { approvalStatus: 'PENDING_FIRST_APPROVAL' },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({
      success: true,
      data: updatedEntry,
      message: 'SoA entry submitted for 1st level approval',
    });
  })
);

// First level approval (COO / LOCAL_ADMIN)
router.post(
  '/:id/first-approval',
  authenticate,
  uuidParam('id'),
  validate,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const authReq = req as AuthenticatedRequest;
    const { comments } = req.body;

    const entry = await prisma.soAEntry.findUnique({
      where: { id },
      include: { control: { select: { controlId: true, name: true } } },
    });
    if (!entry) {
      throw new AppError('SoA entry not found', 404);
    }

    const membership = authReq.user.organizationMemberships.find(
      m => m.organizationId === entry.organizationId
    );
    if (!membership && authReq.user.role !== 'ADMIN') {
      throw new AppError('You are not a member of this organization', 403);
    }

    const allowedRoles = ['LOCAL_ADMIN', 'ADMIN'];
    if (membership && !allowedRoles.includes(membership.role) && authReq.user.role !== 'ADMIN') {
      throw new AppError('Only COO/Local Admin or higher can provide 1st level approval', 403);
    }

    if (entry.approvalStatus !== 'PENDING_FIRST_APPROVAL') {
      throw new AppError(`Entry is not pending 1st level approval (current: ${entry.approvalStatus})`, 400);
    }

    const nextVersion = await getNextSoAVersion(id, false);

    const updatedEntry = await prisma.soAEntry.update({
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

    await createSoAVersionEntry({
      soaEntryId: id,
      version: nextVersion,
      changeDescription: comments || `1st level approval granted for: ${entry.control.controlId}`,
      actor: `${authReq.user.firstName} ${authReq.user.lastName}`,
      actorDesignation: membership?.role || authReq.user.role,
      action: '1st Level Approval',
      approvedById: authReq.user.id,
    });

    await createAuditLog({
      userId: authReq.user.id,
      organizationId: entry.organizationId,
      action: 'APPROVE',
      entityType: 'SoA',
      entityId: id,
      oldValues: { approvalStatus: 'PENDING_FIRST_APPROVAL' },
      newValues: { approvalStatus: 'PENDING_SECOND_APPROVAL', approvedBy: authReq.user.id },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({
      success: true,
      data: updatedEntry,
      message: 'First level approval granted. Pending CEO/Admin approval.',
    });
  })
);

// Second level approval (CEO / ADMIN) - final approval
router.post(
  '/:id/second-approval',
  authenticate,
  uuidParam('id'),
  validate,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const authReq = req as AuthenticatedRequest;
    const { comments } = req.body;

    const entry = await prisma.soAEntry.findUnique({
      where: { id },
      include: { control: { select: { controlId: true, name: true } } },
    });
    if (!entry) {
      throw new AppError('SoA entry not found', 404);
    }

    const membership = authReq.user.organizationMemberships.find(
      m => m.organizationId === entry.organizationId
    );
    if (!membership && authReq.user.role !== 'ADMIN') {
      throw new AppError('You are not a member of this organization', 403);
    }

    if (membership && membership.role !== 'ADMIN' && authReq.user.role !== 'ADMIN') {
      throw new AppError('Only CEO/Admin can provide 2nd level approval', 403);
    }

    if (entry.approvalStatus !== 'PENDING_SECOND_APPROVAL') {
      throw new AppError(`Entry is not pending 2nd level approval (current: ${entry.approvalStatus})`, 400);
    }

    const majorVersion = await getNextSoAVersion(id, true);

    const updatedEntry = await prisma.soAEntry.update({
      where: { id },
      data: {
        approvalStatus: 'APPROVED',
        version: majorVersion,
        updatedAt: new Date(),
      },
      include: {
        control: {
          select: { id: true, controlId: true, name: true, category: true },
        },
      },
    });

    await createSoAVersionEntry({
      soaEntryId: id,
      version: majorVersion,
      changeDescription: comments || 'Approved Version',
      actor: `${authReq.user.firstName} ${authReq.user.lastName}`,
      actorDesignation: membership?.role || authReq.user.role,
      action: '2nd Level Approval',
      approvedById: authReq.user.id,
    });

    await createAuditLog({
      userId: authReq.user.id,
      organizationId: entry.organizationId,
      action: 'APPROVE',
      entityType: 'SoA',
      entityId: id,
      oldValues: { approvalStatus: 'PENDING_SECOND_APPROVAL', version: entry.version },
      newValues: { approvalStatus: 'APPROVED', version: majorVersion, approvedBy: authReq.user.id },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({
      success: true,
      data: updatedEntry,
      message: 'SoA entry fully approved. Version bumped to ' + majorVersion.toFixed(1),
    });
  })
);

// Reject SoA entry
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

    const entry = await prisma.soAEntry.findUnique({
      where: { id },
      include: { control: { select: { controlId: true, name: true } } },
    });
    if (!entry) {
      throw new AppError('SoA entry not found', 404);
    }

    const membership = authReq.user.organizationMemberships.find(
      m => m.organizationId === entry.organizationId
    );
    if (!membership && authReq.user.role !== 'ADMIN') {
      throw new AppError('You are not a member of this organization', 403);
    }

    const allowedRoles = ['LOCAL_ADMIN', 'ADMIN'];
    if (membership && !allowedRoles.includes(membership.role) && authReq.user.role !== 'ADMIN') {
      throw new AppError('Only Local Admin or Admin can reject SoA entries', 403);
    }

    if (!['PENDING_FIRST_APPROVAL', 'PENDING_SECOND_APPROVAL'].includes(entry.approvalStatus)) {
      throw new AppError(`Entry is not pending approval (current: ${entry.approvalStatus})`, 400);
    }

    const nextVersion = await getNextSoAVersion(id, false);

    const updatedEntry = await prisma.soAEntry.update({
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

    await createSoAVersionEntry({
      soaEntryId: id,
      version: nextVersion,
      changeDescription: `Rejected: ${reason}`,
      actor: `${authReq.user.firstName} ${authReq.user.lastName}`,
      actorDesignation: membership?.role || authReq.user.role,
      action: 'Rejected',
      approvedById: authReq.user.id,
    });

    await createAuditLog({
      userId: authReq.user.id,
      organizationId: entry.organizationId,
      action: 'REJECT',
      entityType: 'SoA',
      entityId: id,
      oldValues: { approvalStatus: entry.approvalStatus },
      newValues: { approvalStatus: 'REJECTED', reason },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({
      success: true,
      data: updatedEntry,
      message: 'SoA entry rejected and sent back for revision.',
    });
  })
);

// ============================================
// INITIALIZE & BULK OPERATIONS
// ============================================

// Initialize SoA for organization
router.post(
  '/initialize',
  authenticate,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const { organizationId } = req.body;

    if (!organizationId) {
      throw new AppError('Organization ID is required', 400);
    }

    const membership = authReq.user.organizationMemberships.find(
      m => m.organizationId === organizationId
    );
    if (!membership && authReq.user.role !== 'ADMIN') {
      throw new AppError('You are not authorized', 403);
    }

    if (membership && !['ADMIN', 'LOCAL_ADMIN'].includes(membership.role)) {
      throw new AppError('Only admins can initialize SoA', 403);
    }

    const controls = await prisma.control.findMany({
      where: { organizationId },
      select: { id: true },
    });

    const existingEntries = await prisma.soAEntry.findMany({
      where: { organizationId },
      select: { controlId: true },
    });

    const existingControlIds = new Set(existingEntries.map(e => e.controlId));

    const newEntries = controls
      .filter(c => !existingControlIds.has(c.id))
      .map(c => ({
        organizationId,
        controlId: c.id,
        isApplicable: true,
        justification: 'Pending review',
        status: 'IN_PROGRESS' as const,
        controlSource: 'Annex A ISO 27001:2022',
        version: 0.1,
        approvalStatus: 'DRAFT' as const,
      }));

    if (newEntries.length > 0) {
      await prisma.soAEntry.createMany({ data: newEntries });
    }

    await createAuditLog({
      userId: authReq.user.id,
      organizationId,
      action: 'CREATE',
      entityType: 'SoA',
      newValues: { initialized: true, entriesCreated: newEntries.length },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({
      success: true,
      data: {
        existingEntries: existingEntries.length,
        newEntriesCreated: newEntries.length,
        totalControls: controls.length,
      },
    });
  })
);

// Bulk submit all DRAFT entries for review
router.post(
  '/bulk-submit',
  authenticate,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const { organizationId } = req.body;

    if (!organizationId) {
      throw new AppError('Organization ID is required', 400);
    }

    const membership = authReq.user.organizationMemberships.find(
      m => m.organizationId === organizationId
    );
    if (!membership && authReq.user.role !== 'ADMIN') {
      throw new AppError('You are not a member of this organization', 403);
    }

    if (membership?.role === 'VIEWER') {
      throw new AppError('Viewers cannot submit SoA for review', 403);
    }

    const draftEntries = await prisma.soAEntry.findMany({
      where: {
        organizationId: organizationId as string,
        approvalStatus: { in: ['DRAFT', 'REJECTED'] },
      },
    });

    if (draftEntries.length === 0) {
      throw new AppError('No draft entries to submit', 400);
    }

    await prisma.soAEntry.updateMany({
      where: {
        organizationId: organizationId as string,
        approvalStatus: { in: ['DRAFT', 'REJECTED'] },
      },
      data: {
        approvalStatus: 'PENDING_FIRST_APPROVAL',
        updatedAt: new Date(),
      },
    });

    await createAuditLog({
      userId: authReq.user.id,
      organizationId: organizationId as string,
      action: 'UPDATE',
      entityType: 'SoA',
      newValues: { bulkSubmitted: draftEntries.length },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({
      success: true,
      data: { submitted: draftEntries.length },
      message: `${draftEntries.length} SoA entries submitted for 1st level approval`,
    });
  })
);

export default router;
