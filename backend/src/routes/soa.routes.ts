import { Router } from 'express';
import { prisma } from '../index.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { authenticate, requirePermission, hasPermission, AuthenticatedRequest } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { uuidParam, paginationQuery } from '../middleware/validators.js';
import { createAuditLog } from '../services/audit.service.js';

import { logger } from '../utils/logger.js';

const router = Router();

// ============================================
// HELPERS
// ============================================

const createNotification = async (
  userId: string,
  organizationId: string,
  type: string,
  title: string,
  message: string,
  link?: string
) => {
  try {
    await prisma.notification.create({
      data: { userId, organizationId, type, title, message, link },
    });
  } catch (err) {
    logger.error('Failed to create notification:', err);
  }
};

const getOrCreateSoADocument = async (organizationId: string) => {
  let doc = await prisma.soADocument.findUnique({
    where: { organizationId },
    include: {
      reviewer: { select: { id: true, firstName: true, lastName: true, email: true, avatar: true, designation: true } },
      approver: { select: { id: true, firstName: true, lastName: true, email: true, avatar: true, designation: true } },
      _count: { select: { versions: true } },
    },
  });

  if (!doc) {
    doc = await prisma.soADocument.create({
      data: { organizationId, version: 0.1, approvalStatus: 'DRAFT' },
      include: {
        reviewer: { select: { id: true, firstName: true, lastName: true, email: true, designation: true } },
        approver: { select: { id: true, firstName: true, lastName: true, email: true, designation: true } },
        _count: { select: { versions: true } },
      },
    });
  }

  return doc;
};

const getNextDocVersion = async (soaDocumentId: string, isMajor: boolean): Promise<number> => {
  const lastVersion = await prisma.soAVersion.findFirst({
    where: { soaDocumentId },
    orderBy: { version: 'desc' },
    select: { version: true },
  });

  if (!lastVersion) return 0.1;

  if (isMajor) {
    return Math.floor(lastVersion.version) + 1.0;
  }

  const major = Math.floor(lastVersion.version);
  const minor = Math.round((lastVersion.version - major) * 10);
  return Number((major + (minor + 1) / 10).toFixed(1));
};

const createDocVersionEntry = async (params: {
  soaDocumentId: string;
  version: number;
  changeDescription: string;
  actor: string;
  actorDesignation?: string;
  action: string;
  createdById?: string;
  approvedById?: string;
}) => {
  return prisma.soAVersion.upsert({
    where: {
      soaDocumentId_version: {
        soaDocumentId: params.soaDocumentId,
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
    },
    create: {
      soaDocumentId: params.soaDocumentId,
      version: params.version,
      changeDescription: params.changeDescription,
      actor: params.actor,
      actorDesignation: params.actorDesignation,
      action: params.action,
      createdById: params.createdById,
      approvedById: params.approvedById,
    },
  });
};

// ============================================
// DOCUMENT ROUTES
// ============================================

// Get SoA document (auto-creates if needed)
router.get(
  '/document',
  authenticate,
  requirePermission('soa', 'view'),
  asyncHandler(async (req, res) => {
    const { organizationId } = req.query;
    if (!organizationId) throw new AppError('Organization ID is required', 400);

    const doc = await getOrCreateSoADocument(organizationId as string);

    res.json({ success: true, data: doc });
  })
);

// Update SoA document metadata (reviewer, approver, title, etc.)
router.patch(
  '/document',
  authenticate,
  requirePermission('soa', 'edit'),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const { organizationId, reviewerId, approverId, title, identification, classification } = req.body;

    if (!organizationId) throw new AppError('Organization ID is required', 400);

    const doc = await getOrCreateSoADocument(organizationId);

    const updateData: any = {};
    if (reviewerId !== undefined) updateData.reviewerId = reviewerId || null;
    if (approverId !== undefined) updateData.approverId = approverId || null;
    if (title !== undefined) updateData.title = title;
    if (identification !== undefined) updateData.identification = identification;
    if (classification !== undefined) updateData.classification = classification;

    const updated = await prisma.soADocument.update({
      where: { id: doc.id },
      data: updateData,
      include: {
        reviewer: { select: { id: true, firstName: true, lastName: true, email: true, designation: true } },
        approver: { select: { id: true, firstName: true, lastName: true, email: true, designation: true } },
        _count: { select: { versions: true } },
      },
    });

    await createAuditLog({
      userId: authReq.user.id,
      organizationId,
      action: 'UPDATE',
      entityType: 'SoADocument',
      entityId: doc.id,
      newValues: updateData,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({ success: true, data: updated });
  })
);

// Get document version history
router.get(
  '/document/versions',
  authenticate,
  requirePermission('soa', 'view'),
  asyncHandler(async (req, res) => {
    const { organizationId } = req.query;
    if (!organizationId) throw new AppError('Organization ID is required', 400);

    const doc = await getOrCreateSoADocument(organizationId as string);

    const versions = await prisma.soAVersion.findMany({
      where: { soaDocumentId: doc.id },
      orderBy: { version: 'desc' },
    });

    res.json({ success: true, data: versions });
  })
);

// Update version entry description
router.patch(
  '/document/versions/:versionId',
  authenticate,
  requirePermission('soa', 'edit'),
  asyncHandler(async (req, res) => {
    const { versionId } = req.params;
    const authReq = req as AuthenticatedRequest;
    const { changeDescription } = req.body;

    if (!changeDescription?.trim()) throw new AppError('Change description is required', 400);

    const version = await prisma.soAVersion.findUnique({ where: { id: versionId } });
    if (!version) throw new AppError('Version entry not found', 404);

    const doc = await prisma.soADocument.findUnique({ where: { id: version.soaDocumentId } });
    if (!doc) throw new AppError('SoA document not found', 404);

    const membership = authReq.user.organizationMemberships.find(
      (m: any) => m.organizationId === doc.organizationId
    );
    if (!membership && authReq.user.role !== 'ADMIN') {
      throw new AppError('You are not a member of this organization', 403);
    }

    const updated = await prisma.soAVersion.update({
      where: { id: versionId },
      data: { changeDescription: changeDescription.trim() },
    });

    await createAuditLog({
      userId: authReq.user.id,
      organizationId: doc.organizationId,
      action: 'UPDATE',
      entityType: 'SoAVersion',
      entityId: versionId,
      oldValues: { changeDescription: version.changeDescription },
      newValues: { changeDescription: changeDescription.trim() },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({ success: true, data: updated });
  })
);

// Submit SoA document for review
router.post(
  '/document/submit-for-review',
  authenticate,
  requirePermission('soa', 'edit'),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const { organizationId, changeDescription, versionBump } = req.body;

    if (!organizationId) throw new AppError('Organization ID is required', 400);
    if (!changeDescription) throw new AppError('Description of change is required', 400);

    const doc = await getOrCreateSoADocument(organizationId);

    const membership = authReq.user.organizationMemberships.find(
      (m: any) => m.organizationId === organizationId
    );
    if (!membership && authReq.user.role !== 'ADMIN') {
      throw new AppError('You are not a member of this organization', 403);
    }
    if (membership?.role === 'VIEWER') {
      throw new AppError('Viewers cannot submit SoA for review', 403);
    }

    if (doc.approvalStatus !== 'DRAFT' && doc.approvalStatus !== 'REJECTED') {
      throw new AppError(`SoA cannot be submitted for review from ${doc.approvalStatus} status`, 400);
    }

    // 'none'/undefined = keep current, 'minor'/'major' = bump
    const nextVersion = (!versionBump || versionBump === 'none')
      ? doc.version
      : await getNextDocVersion(doc.id, versionBump === 'major');

    const updated = await prisma.soADocument.update({
      where: { id: doc.id },
      data: { approvalStatus: 'PENDING_FIRST_APPROVAL', version: nextVersion, updatedAt: new Date() },
      include: {
        reviewer: { select: { id: true, firstName: true, lastName: true, email: true, designation: true } },
        approver: { select: { id: true, firstName: true, lastName: true, email: true, designation: true } },
      },
    });

    await createDocVersionEntry({
      soaDocumentId: doc.id,
      version: nextVersion,
      changeDescription: changeDescription || 'SoA submitted for review',
      actor: `${authReq.user.firstName} ${authReq.user.lastName}`,
      actorDesignation: authReq.user.designation || membership?.role || authReq.user.role,
      action: 'Submitted for Review',
      createdById: authReq.user.id,
    });

    await createAuditLog({
      userId: authReq.user.id,
      organizationId,
      action: 'UPDATE',
      entityType: 'SoADocument',
      entityId: doc.id,
      oldValues: { approvalStatus: doc.approvalStatus },
      newValues: { approvalStatus: 'PENDING_FIRST_APPROVAL' },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    // Notify reviewer
    if (updated.reviewerId) {
      await createNotification(
        updated.reviewerId,
        organizationId,
        'soa_submitted',
        'SoA Submitted for Review',
        `${authReq.user.firstName} ${authReq.user.lastName} has submitted the Statement of Applicability (v${nextVersion.toFixed(1)}) for your review.`,
        '/soa?tab=approvals'
      );
    }

    res.json({
      success: true,
      data: updated,
      message: 'SoA submitted for 1st level approval',
    });
  })
);

// First level approval — only the assigned reviewer can approve
router.post(
  '/document/first-approval',
  authenticate,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const { organizationId } = req.body;

    if (!organizationId) throw new AppError('Organization ID is required', 400);

    const doc = await getOrCreateSoADocument(organizationId);

    if (doc.approvalStatus !== 'PENDING_FIRST_APPROVAL') {
      throw new AppError(`SoA is not pending 1st level approval (current: ${doc.approvalStatus})`, 400);
    }

    // Only the assigned reviewer (or global ADMIN) can give 1st level approval
    if (authReq.user.role !== 'ADMIN' && doc.reviewerId !== authReq.user.id) {
      throw new AppError('Only the assigned reviewer can provide 1st level approval', 403);
    }

    const membership = authReq.user.organizationMemberships.find(
      (m: any) => m.organizationId === organizationId
    );
    if (!membership && authReq.user.role !== 'ADMIN') {
      throw new AppError('You are not a member of this organization', 403);
    }

    const currentVersion = doc.version;

    const updated = await prisma.soADocument.update({
      where: { id: doc.id },
      data: { approvalStatus: 'PENDING_SECOND_APPROVAL', updatedAt: new Date() },
      include: {
        reviewer: { select: { id: true, firstName: true, lastName: true, email: true, designation: true } },
        approver: { select: { id: true, firstName: true, lastName: true, email: true, designation: true } },
      },
    });

    await createAuditLog({
      userId: authReq.user.id,
      organizationId,
      action: 'APPROVE',
      entityType: 'SoADocument',
      entityId: doc.id,
      oldValues: { approvalStatus: 'PENDING_FIRST_APPROVAL' },
      newValues: { approvalStatus: 'PENDING_SECOND_APPROVAL' },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    // Notify approver
    if (updated.approverId) {
      await createNotification(
        updated.approverId,
        organizationId,
        'soa_approved_first',
        'SoA Pending Final Approval',
        `${authReq.user.firstName} ${authReq.user.lastName} has given 1st level approval for the SoA (v${currentVersion.toFixed(1)}). Your final approval is needed.`,
        '/soa?tab=approvals'
      );
    }

    res.json({
      success: true,
      data: updated,
      message: '1st level approval granted. Pending 2nd level approval.',
    });
  })
);

// Second level approval — only the assigned approver can approve
router.post(
  '/document/second-approval',
  authenticate,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const { organizationId } = req.body;

    if (!organizationId) throw new AppError('Organization ID is required', 400);

    const doc = await getOrCreateSoADocument(organizationId);

    if (doc.approvalStatus !== 'PENDING_SECOND_APPROVAL') {
      throw new AppError(`SoA is not pending 2nd level approval (current: ${doc.approvalStatus})`, 400);
    }

    // Only the assigned approver (or global ADMIN) can give 2nd level approval
    if (authReq.user.role !== 'ADMIN' && doc.approverId !== authReq.user.id) {
      throw new AppError('Only the assigned approver can provide 2nd level approval', 403);
    }

    const membership = authReq.user.organizationMemberships.find(
      (m: any) => m.organizationId === organizationId
    );
    if (!membership && authReq.user.role !== 'ADMIN') {
      throw new AppError('You are not a member of this organization', 403);
    }

    const currentVersion = doc.version;

    const updated = await prisma.soADocument.update({
      where: { id: doc.id },
      data: { approvalStatus: 'APPROVED', updatedAt: new Date() },
      include: {
        reviewer: { select: { id: true, firstName: true, lastName: true, email: true, designation: true } },
        approver: { select: { id: true, firstName: true, lastName: true, email: true, designation: true } },
      },
    });

    await createAuditLog({
      userId: authReq.user.id,
      organizationId,
      action: 'APPROVE',
      entityType: 'SoADocument',
      entityId: doc.id,
      oldValues: { approvalStatus: 'PENDING_SECOND_APPROVAL' },
      newValues: { approvalStatus: 'APPROVED' },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    // Notify reviewer that SoA is fully approved
    if (updated.reviewerId && updated.reviewerId !== authReq.user.id) {
      await createNotification(
        updated.reviewerId,
        organizationId,
        'soa_approved_final',
        'SoA Fully Approved',
        `The Statement of Applicability has been fully approved (v${currentVersion.toFixed(1)}) by ${authReq.user.firstName} ${authReq.user.lastName}.`,
        '/soa?tab=versions'
      );
    }

    res.json({
      success: true,
      data: updated,
      message: 'SoA fully approved (v' + currentVersion.toFixed(1) + ')',
    });
  })
);

// Create new revision (reset APPROVED → DRAFT for a new editing cycle)
router.post(
  '/document/new-revision',
  authenticate,
  requirePermission('soa', 'edit'),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const { organizationId, changeDescription, versionBump } = req.body;

    if (!organizationId) throw new AppError('Organization ID is required', 400);
    if (!changeDescription) throw new AppError('Description of change is required', 400);

    const doc = await getOrCreateSoADocument(organizationId);

    if (doc.approvalStatus !== 'APPROVED') {
      throw new AppError(`Can only create a new revision from APPROVED status (current: ${doc.approvalStatus})`, 400);
    }

    const nextVersion = await getNextDocVersion(doc.id, versionBump === 'major');

    const membership = authReq.user.organizationMemberships.find(
      (m: any) => m.organizationId === organizationId
    );
    if (!membership && authReq.user.role !== 'ADMIN') {
      throw new AppError('You are not a member of this organization', 403);
    }

    const updated = await prisma.soADocument.update({
      where: { id: doc.id },
      data: { approvalStatus: 'DRAFT', version: nextVersion, updatedAt: new Date() },
      include: {
        reviewer: { select: { id: true, firstName: true, lastName: true, email: true, designation: true } },
        approver: { select: { id: true, firstName: true, lastName: true, email: true, designation: true } },
        _count: { select: { versions: true } },
      },
    });

    await createDocVersionEntry({
      soaDocumentId: doc.id,
      version: nextVersion,
      changeDescription: changeDescription || 'New revision started',
      actor: `${authReq.user.firstName} ${authReq.user.lastName}`,
      actorDesignation: authReq.user.designation || membership?.role || authReq.user.role,
      action: 'Draft & Review',
      createdById: authReq.user.id,
    });

    await createAuditLog({
      userId: authReq.user.id,
      organizationId,
      action: 'UPDATE',
      entityType: 'SoADocument',
      entityId: doc.id,
      oldValues: { approvalStatus: 'APPROVED', version: doc.version },
      newValues: { approvalStatus: 'DRAFT', version: nextVersion },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({
      success: true,
      data: updated,
      message: `New revision started (v${nextVersion.toFixed(1)}). You can now make changes and submit for review.`,
    });
  })
);

// Discard a new revision (revert to APPROVED with previous version)
router.post(
  '/document/discard-revision',
  authenticate,
  requirePermission('soa', 'edit'),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const { organizationId } = req.body;

    if (!organizationId) throw new AppError('Organization ID is required', 400);

    const doc = await getOrCreateSoADocument(organizationId);

    if (doc.approvalStatus !== 'DRAFT') {
      throw new AppError('Can only discard a revision when status is DRAFT', 400);
    }

    const allVersions = await prisma.soAVersion.findMany({
      where: { soaDocumentId: doc.id },
      orderBy: { version: 'desc' },
    });

    if (allVersions.length === 0) {
      throw new AppError('No version entries found', 400);
    }

    const latestVersion = allVersions[0];

    if (latestVersion.action !== 'Draft & Review') {
      throw new AppError('Can only discard a revision that has not yet been submitted for review', 400);
    }

    const previousVersions = allVersions.filter(v => v.version < latestVersion.version);
    if (previousVersions.length === 0) {
      throw new AppError('Cannot discard — this is the initial version', 400);
    }

    const prevVersion = previousVersions[0].version;

    await prisma.soAVersion.deleteMany({
      where: { soaDocumentId: doc.id, version: latestVersion.version },
    });

    const updated = await prisma.soADocument.update({
      where: { id: doc.id },
      data: {
        version: prevVersion,
        approvalStatus: 'APPROVED',
        updatedAt: new Date(),
      },
    });

    await createAuditLog({
      userId: authReq.user.id,
      organizationId,
      action: 'UPDATE',
      entityType: 'SoADocument',
      entityId: doc.id,
      oldValues: { approvalStatus: 'DRAFT', version: latestVersion.version },
      newValues: { approvalStatus: 'APPROVED', version: prevVersion },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({
      success: true,
      data: updated,
      message: `Revision v${latestVersion.version.toFixed(1)} discarded. Reverted to v${prevVersion.toFixed(1)} (APPROVED).`,
    });
  })
);

// Reject SoA document
router.post(
  '/document/reject',
  authenticate,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const { organizationId, reason } = req.body;

    if (!organizationId) throw new AppError('Organization ID is required', 400);
    if (!reason) throw new AppError('Rejection reason is required', 400);

    const doc = await getOrCreateSoADocument(organizationId);

    if (!['PENDING_FIRST_APPROVAL', 'PENDING_SECOND_APPROVAL'].includes(doc.approvalStatus)) {
      throw new AppError(`SoA is not pending approval (current: ${doc.approvalStatus})`, 400);
    }

    // Only the stage-specific assignee (or global ADMIN) can reject
    const isReviewer = doc.reviewerId === authReq.user.id;
    const isApprover = doc.approverId === authReq.user.id;
    const isGlobalAdmin = authReq.user.role === 'ADMIN';

    if (!isGlobalAdmin) {
      if (doc.approvalStatus === 'PENDING_FIRST_APPROVAL' && !isReviewer) {
        throw new AppError('Only the assigned reviewer can reject at this stage', 403);
      }
      if (doc.approvalStatus === 'PENDING_SECOND_APPROVAL' && !isApprover) {
        throw new AppError('Only the assigned approver can reject at this stage', 403);
      }
    }

    const membership = authReq.user.organizationMemberships.find(
      (m: any) => m.organizationId === organizationId
    );
    if (!membership && !isGlobalAdmin) {
      throw new AppError('You are not a member of this organization', 403);
    }

    // Keep same version on rejection
    const updated = await prisma.soADocument.update({
      where: { id: doc.id },
      data: { approvalStatus: 'REJECTED', updatedAt: new Date() },
      include: {
        reviewer: { select: { id: true, firstName: true, lastName: true, email: true, designation: true } },
        approver: { select: { id: true, firstName: true, lastName: true, email: true, designation: true } },
      },
    });

    await createAuditLog({
      userId: authReq.user.id,
      organizationId,
      action: 'REJECT',
      entityType: 'SoADocument',
      entityId: doc.id,
      oldValues: { approvalStatus: doc.approvalStatus },
      newValues: { approvalStatus: 'REJECTED', reason },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    // Notify reviewer (if approver rejected) or approver (if reviewer rejected)
    const notifyUserId = updated.reviewerId && updated.reviewerId !== authReq.user.id
      ? updated.reviewerId
      : updated.approverId && updated.approverId !== authReq.user.id
        ? updated.approverId
        : null;

    if (notifyUserId) {
      await createNotification(
        notifyUserId,
        organizationId,
        'soa_rejected',
        'SoA Rejected',
        `${authReq.user.firstName} ${authReq.user.lastName} has rejected the SoA: "${reason}"`,
        '/soa?tab=approvals'
      );
    }

    res.json({
      success: true,
      data: updated,
      message: 'SoA rejected and sent back for revision.',
    });
  })
);

// ============================================
// SOA ENTRY ROUTES
// ============================================

// Get Statement of Applicability entries
router.get(
  '/',
  authenticate,
  requirePermission('soa', 'view'),
  paginationQuery,
  validate,
  asyncHandler(async (req, res) => {
    const {
      page = 1,
      limit = 200,
      organizationId,
      category,
      applicable,
      status,
      frameworkSlug,
      search,
      sortBy = 'controlId',
      sortOrder = 'asc',
    } = req.query;

    if (!organizationId) throw new AppError('Organization ID is required', 400);

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
    if (frameworkSlug) {
      where.control = { ...where.control, framework: { slug: frameworkSlug as string } };
    }
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
      select: { isApplicable: true, status: true },
    });

    const stats = {
      total: allEntries.length,
      applicable: allEntries.filter(e => e.isApplicable).length,
      notApplicable: allEntries.filter(e => !e.isApplicable).length,
      implemented: allEntries.filter(e => e.isApplicable && e.status === 'IMPLEMENTED').length,
      inProgress: allEntries.filter(e => e.isApplicable && e.status === 'IN_PROGRESS').length,
      notStarted: allEntries.filter(e => e.isApplicable && e.status === 'NOT_STARTED').length,
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
  requirePermission('soa', 'view'),
  asyncHandler(async (req, res) => {
    const { organizationId, format = 'json' } = req.query;

    if (!organizationId) throw new AppError('Organization ID is required', 400);

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
      ].join(','));

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="soa-${organization?.slug}.csv"`);
      return res.send([headers, ...rows].join('\n'));
    }

    const groupedByCategory = entries.reduce((acc: any, entry) => {
      const cat = entry.control.category;
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(entry);
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
      },
    });

    if (!entry) throw new AppError('SoA entry not found', 404);

    const membership = authReq.user.organizationMemberships.find(
      m => m.organizationId === entry.organizationId
    );
    if (!membership && authReq.user.role !== 'ADMIN') {
      throw new AppError('You are not authorized to view this entry', 403);
    }

    res.json({ success: true, data: entry });
  })
);

// ============================================
// UPDATE SoA ENTRY (bumps document version)
// ============================================

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
    if (!existingEntry) throw new AppError('SoA entry not found', 404);

    if (!hasPermission(authReq.user, existingEntry.organizationId, 'soa', 'edit')) {
      throw new AppError('You do not have permission to update SoA entries', 403);
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

    const entry = await prisma.soAEntry.update({
      where: { id },
      data: updateData,
      include: {
        control: {
          select: { id: true, controlId: true, name: true, category: true, implementationStatus: true },
        },
      },
    });

    // Update document timestamp (no version bump — user controls versioning at submit time)
    const doc = await getOrCreateSoADocument(existingEntry.organizationId);

    const docUpdate: any = { updatedAt: new Date() };
    // If doc was approved, reset to draft
    if (doc.approvalStatus === 'APPROVED') {
      docUpdate.approvalStatus = 'DRAFT';
    }

    await prisma.soADocument.update({
      where: { id: doc.id },
      data: docUpdate,
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
      },
      newValues: updateData,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({ success: true, data: entry });
  })
);

// Bulk update SoA entries
router.patch(
  '/bulk',
  authenticate,
  requirePermission('soa', 'edit'),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const { organizationId, updates } = req.body;

    if (!organizationId) throw new AppError('Organization ID is required', 400);
    if (!Array.isArray(updates)) throw new AppError('Updates must be an array', 400);

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

    // Update document timestamp (no version bump — user controls versioning at submit time)
    const doc = await getOrCreateSoADocument(organizationId);

    const docUpdate: any = { updatedAt: new Date() };
    if (doc.approvalStatus === 'APPROVED') {
      docUpdate.approvalStatus = 'DRAFT';
    }

    await prisma.soADocument.update({ where: { id: doc.id }, data: docUpdate });

    await createAuditLog({
      userId: authReq.user.id,
      organizationId,
      action: 'UPDATE',
      entityType: 'SoA',
      newValues: { bulkUpdated: updates.length },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({ success: true, data: { updated: results.length } });
  })
);

// ============================================
// INITIALIZE
// ============================================

router.post(
  '/initialize',
  authenticate,
  requirePermission('soa', 'edit'),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const { organizationId } = req.body;

    if (!organizationId) throw new AppError('Organization ID is required', 400);

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
      }));

    if (newEntries.length > 0) {
      await prisma.soAEntry.createMany({ data: newEntries });
    }

    // Ensure SoA document exists and create initial version
    const doc = await getOrCreateSoADocument(organizationId);

    const membership = authReq.user.organizationMemberships.find(
      (m: any) => m.organizationId === organizationId
    );

    // Create initial version entry if none exists
    const existingVersions = await prisma.soAVersion.count({ where: { soaDocumentId: doc.id } });
    if (existingVersions === 0) {
      await createDocVersionEntry({
        soaDocumentId: doc.id,
        version: 0.1,
        changeDescription: 'Initial Version',
        actor: `${authReq.user.firstName} ${authReq.user.lastName}`,
        actorDesignation: authReq.user.designation || membership?.role || authReq.user.role,
        action: 'Draft & Review',
        createdById: authReq.user.id,
      });
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

export default router;
