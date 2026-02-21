import { Router } from 'express';
import { prisma } from '../index.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { authenticate, requirePermission, AuthenticatedRequest } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { createRiskValidator, uuidParam, paginationQuery } from '../middleware/validators.js';
import { createAuditLog } from '../services/audit.service.js';
import { logger } from '../utils/logger.js';
import OpenAI from 'openai';

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
// DOCUMENT-LEVEL HELPERS
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

const getOrCreateRiskRegisterDocument = async (organizationId: string) => {
  let doc = await prisma.riskRegisterDocument.findUnique({
    where: { organizationId },
    include: {
      reviewer: { select: { id: true, firstName: true, lastName: true, email: true, avatar: true, designation: true } },
      approver: { select: { id: true, firstName: true, lastName: true, email: true, avatar: true, designation: true } },
      _count: { select: { versions: true } },
    },
  });

  if (!doc) {
    doc = await prisma.riskRegisterDocument.create({
      data: { organizationId, version: 0.1, approvalStatus: 'DRAFT' },
      include: {
        reviewer: { select: { id: true, firstName: true, lastName: true, email: true, avatar: true, designation: true } },
        approver: { select: { id: true, firstName: true, lastName: true, email: true, avatar: true, designation: true } },
        _count: { select: { versions: true } },
      },
    });
  }

  return doc;
};

const getNextRiskRegisterDocVersion = async (docId: string, isMajor: boolean): Promise<number> => {
  const lastVersion = await prisma.riskRegisterVersion.findFirst({
    where: { riskRegisterDocumentId: docId },
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

const createRiskRegisterDocVersionEntry = async (params: {
  riskRegisterDocumentId: string;
  version: number;
  changeDescription: string;
  actor: string;
  actorDesignation?: string;
  action: string;
  createdById?: string;
  approvedById?: string;
}) => {
  return prisma.riskRegisterVersion.upsert({
    where: {
      riskRegisterDocumentId_version: {
        riskRegisterDocumentId: params.riskRegisterDocumentId,
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
      riskRegisterDocumentId: params.riskRegisterDocumentId,
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
// DOCUMENT-LEVEL ROUTES
// ============================================

// Get Risk Register document (auto-creates if needed)
router.get(
  '/document',
  authenticate,
  requirePermission('risks', 'view'),
  asyncHandler(async (req, res) => {
    const { organizationId } = req.query;
    if (!organizationId) throw new AppError('Organization ID is required', 400);

    const doc = await getOrCreateRiskRegisterDocument(organizationId as string);

    res.json({ success: true, data: doc });
  })
);

// Update Risk Register document metadata (reviewer, approver, title, etc.)
router.patch(
  '/document',
  authenticate,
  requirePermission('risks', 'edit'),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const { organizationId, reviewerId, approverId, title, identification, classification } = req.body;

    if (!organizationId) throw new AppError('Organization ID is required', 400);

    const doc = await getOrCreateRiskRegisterDocument(organizationId);

    const updateData: any = {};
    if (reviewerId !== undefined) updateData.reviewerId = reviewerId || null;
    if (approverId !== undefined) updateData.approverId = approverId || null;
    if (title !== undefined) updateData.title = title;
    if (identification !== undefined) updateData.identification = identification;
    if (classification !== undefined) updateData.classification = classification;

    const updated = await prisma.riskRegisterDocument.update({
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
      entityType: 'RiskRegisterDocument',
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
  requirePermission('risks', 'view'),
  asyncHandler(async (req, res) => {
    const { organizationId } = req.query;
    if (!organizationId) throw new AppError('Organization ID is required', 400);

    const doc = await getOrCreateRiskRegisterDocument(organizationId as string);

    const versions = await prisma.riskRegisterVersion.findMany({
      where: { riskRegisterDocumentId: doc.id },
      orderBy: { version: 'desc' },
    });

    res.json({ success: true, data: versions });
  })
);

// Update version entry description
router.patch(
  '/document/versions/:versionId',
  authenticate,
  requirePermission('risks', 'edit'),
  asyncHandler(async (req, res) => {
    const { versionId } = req.params;
    const authReq = req as AuthenticatedRequest;
    const { changeDescription } = req.body;

    if (!changeDescription?.trim()) throw new AppError('Change description is required', 400);

    const version = await prisma.riskRegisterVersion.findUnique({ where: { id: versionId } });
    if (!version) throw new AppError('Version entry not found', 404);

    const doc = await prisma.riskRegisterDocument.findUnique({ where: { id: version.riskRegisterDocumentId } });
    if (!doc) throw new AppError('Risk Register document not found', 404);

    const membership = authReq.user.organizationMemberships.find(
      (m: any) => m.organizationId === doc.organizationId
    );
    if (!membership && authReq.user.role !== 'ADMIN') {
      throw new AppError('You are not a member of this organization', 403);
    }

    const updated = await prisma.riskRegisterVersion.update({
      where: { id: versionId },
      data: { changeDescription: changeDescription.trim() },
    });

    await createAuditLog({
      userId: authReq.user.id,
      organizationId: doc.organizationId,
      action: 'UPDATE',
      entityType: 'RiskRegisterVersion',
      entityId: versionId,
      oldValues: { changeDescription: version.changeDescription },
      newValues: { changeDescription: changeDescription.trim() },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({ success: true, data: updated });
  })
);

// Submit Risk Register document for review
router.post(
  '/document/submit-for-review',
  authenticate,
  requirePermission('risks', 'edit'),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const { organizationId, changeDescription, versionBump } = req.body;

    if (!organizationId) throw new AppError('Organization ID is required', 400);
    if (!changeDescription) throw new AppError('Description of change is required', 400);

    const doc = await getOrCreateRiskRegisterDocument(organizationId);

    const membership = authReq.user.organizationMemberships.find(
      (m: any) => m.organizationId === organizationId
    );
    if (!membership && authReq.user.role !== 'ADMIN') {
      throw new AppError('You are not a member of this organization', 403);
    }
    if (membership?.role === 'VIEWER') {
      throw new AppError('Viewers cannot submit Risk Register for review', 403);
    }

    if (doc.approvalStatus !== 'DRAFT' && doc.approvalStatus !== 'REJECTED') {
      throw new AppError(`Risk Register cannot be submitted for review from ${doc.approvalStatus} status`, 400);
    }

    const nextVersion = (!versionBump || versionBump === 'none')
      ? doc.version
      : await getNextRiskRegisterDocVersion(doc.id, versionBump === 'major');

    const updated = await prisma.riskRegisterDocument.update({
      where: { id: doc.id },
      data: { approvalStatus: 'PENDING_FIRST_APPROVAL', version: nextVersion, updatedAt: new Date() },
      include: {
        reviewer: { select: { id: true, firstName: true, lastName: true, email: true, designation: true } },
        approver: { select: { id: true, firstName: true, lastName: true, email: true, designation: true } },
      },
    });

    await createRiskRegisterDocVersionEntry({
      riskRegisterDocumentId: doc.id,
      version: nextVersion,
      changeDescription: changeDescription || 'Risk Register submitted for review',
      actor: `${authReq.user.firstName} ${authReq.user.lastName}`,
      actorDesignation: authReq.user.designation || membership?.role || authReq.user.role,
      action: 'Submitted for Review',
      createdById: authReq.user.id,
    });

    await createAuditLog({
      userId: authReq.user.id,
      organizationId,
      action: 'UPDATE',
      entityType: 'RiskRegisterDocument',
      entityId: doc.id,
      oldValues: { approvalStatus: doc.approvalStatus },
      newValues: { approvalStatus: 'PENDING_FIRST_APPROVAL' },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    if (updated.reviewerId) {
      await createNotification(
        updated.reviewerId,
        organizationId,
        'risk_register_submitted',
        'Risk Register Submitted for Review',
        `${authReq.user.firstName} ${authReq.user.lastName} has submitted the Risk Register (v${nextVersion.toFixed(1)}) for your review.`,
        '/risks?tab=approvals'
      );
    }

    res.json({
      success: true,
      data: updated,
      message: 'Risk Register submitted for 1st level approval',
    });
  })
);

// First level approval
router.post(
  '/document/first-approval',
  authenticate,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const { organizationId } = req.body;

    if (!organizationId) throw new AppError('Organization ID is required', 400);

    const doc = await getOrCreateRiskRegisterDocument(organizationId);

    if (doc.approvalStatus !== 'PENDING_FIRST_APPROVAL') {
      throw new AppError(`Risk Register is not pending 1st level approval (current: ${doc.approvalStatus})`, 400);
    }

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

    const updated = await prisma.riskRegisterDocument.update({
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
      entityType: 'RiskRegisterDocument',
      entityId: doc.id,
      oldValues: { approvalStatus: 'PENDING_FIRST_APPROVAL' },
      newValues: { approvalStatus: 'PENDING_SECOND_APPROVAL' },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    if (updated.approverId) {
      await createNotification(
        updated.approverId,
        organizationId,
        'risk_register_approved_first',
        'Risk Register Pending Final Approval',
        `${authReq.user.firstName} ${authReq.user.lastName} has given 1st level approval for the Risk Register (v${currentVersion.toFixed(1)}). Your final approval is needed.`,
        '/risks?tab=approvals'
      );
    }

    res.json({
      success: true,
      data: updated,
      message: '1st level approval granted. Pending 2nd level approval.',
    });
  })
);

// Second level approval (final)
router.post(
  '/document/second-approval',
  authenticate,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const { organizationId } = req.body;

    if (!organizationId) throw new AppError('Organization ID is required', 400);

    const doc = await getOrCreateRiskRegisterDocument(organizationId);

    if (doc.approvalStatus !== 'PENDING_SECOND_APPROVAL') {
      throw new AppError(`Risk Register is not pending 2nd level approval (current: ${doc.approvalStatus})`, 400);
    }

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

    const updated = await prisma.riskRegisterDocument.update({
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
      entityType: 'RiskRegisterDocument',
      entityId: doc.id,
      oldValues: { approvalStatus: 'PENDING_SECOND_APPROVAL' },
      newValues: { approvalStatus: 'APPROVED' },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    if (updated.reviewerId && updated.reviewerId !== authReq.user.id) {
      await createNotification(
        updated.reviewerId,
        organizationId,
        'risk_register_approved_final',
        'Risk Register Fully Approved',
        `The Risk Register has been fully approved (v${currentVersion.toFixed(1)}) by ${authReq.user.firstName} ${authReq.user.lastName}.`,
        '/risks?tab=versions'
      );
    }

    res.json({
      success: true,
      data: updated,
      message: 'Risk Register fully approved (v' + currentVersion.toFixed(1) + ')',
    });
  })
);

// Create new revision (reset APPROVED → DRAFT for a new editing cycle)
router.post(
  '/document/new-revision',
  authenticate,
  requirePermission('risks', 'edit'),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const { organizationId, changeDescription, versionBump } = req.body;

    if (!organizationId) throw new AppError('Organization ID is required', 400);
    if (!changeDescription) throw new AppError('Description of change is required', 400);

    const doc = await getOrCreateRiskRegisterDocument(organizationId);

    if (doc.approvalStatus !== 'APPROVED') {
      throw new AppError(`Can only create a new revision from APPROVED status (current: ${doc.approvalStatus})`, 400);
    }

    const nextVersion = await getNextRiskRegisterDocVersion(doc.id, versionBump === 'major');

    const membership = authReq.user.organizationMemberships.find(
      (m: any) => m.organizationId === organizationId
    );
    if (!membership && authReq.user.role !== 'ADMIN') {
      throw new AppError('You are not a member of this organization', 403);
    }

    const updated = await prisma.riskRegisterDocument.update({
      where: { id: doc.id },
      data: { approvalStatus: 'DRAFT', version: nextVersion, updatedAt: new Date() },
      include: {
        reviewer: { select: { id: true, firstName: true, lastName: true, email: true, designation: true } },
        approver: { select: { id: true, firstName: true, lastName: true, email: true, designation: true } },
        _count: { select: { versions: true } },
      },
    });

    await createRiskRegisterDocVersionEntry({
      riskRegisterDocumentId: doc.id,
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
      entityType: 'RiskRegisterDocument',
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
  requirePermission('risks', 'edit'),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const { organizationId } = req.body;

    if (!organizationId) throw new AppError('Organization ID is required', 400);

    const doc = await getOrCreateRiskRegisterDocument(organizationId);

    if (doc.approvalStatus !== 'DRAFT') {
      throw new AppError('Can only discard a revision when status is DRAFT', 400);
    }

    const allVersions = await prisma.riskRegisterVersion.findMany({
      where: { riskRegisterDocumentId: doc.id },
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

    await prisma.riskRegisterVersion.deleteMany({
      where: { riskRegisterDocumentId: doc.id, version: latestVersion.version },
    });

    const updated = await prisma.riskRegisterDocument.update({
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
      entityType: 'RiskRegisterDocument',
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

// Reject Risk Register document
router.post(
  '/document/reject',
  authenticate,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const { organizationId, reason } = req.body;

    if (!organizationId) throw new AppError('Organization ID is required', 400);
    if (!reason) throw new AppError('Rejection reason is required', 400);

    const doc = await getOrCreateRiskRegisterDocument(organizationId);

    if (!['PENDING_FIRST_APPROVAL', 'PENDING_SECOND_APPROVAL'].includes(doc.approvalStatus)) {
      throw new AppError(`Risk Register is not pending approval (current: ${doc.approvalStatus})`, 400);
    }

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

    const updated = await prisma.riskRegisterDocument.update({
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
      entityType: 'RiskRegisterDocument',
      entityId: doc.id,
      oldValues: { approvalStatus: doc.approvalStatus },
      newValues: { approvalStatus: 'REJECTED', reason },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    const notifyUserId = updated.reviewerId && updated.reviewerId !== authReq.user.id
      ? updated.reviewerId
      : updated.approverId && updated.approverId !== authReq.user.id
        ? updated.approverId
        : null;

    if (notifyUserId) {
      await createNotification(
        notifyUserId,
        organizationId,
        'risk_register_rejected',
        'Risk Register Rejected',
        `${authReq.user.firstName} ${authReq.user.lastName} has rejected the Risk Register: "${reason}"`,
        '/risks?tab=approvals'
      );
    }

    res.json({
      success: true,
      data: updated,
      message: 'Risk Register rejected and sent back for revision.',
    });
  })
);

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

// Get all treatments for an organization (must be before /:id)
router.get(
  '/treatments/all',
  authenticate,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const { organizationId } = req.query;

    if (!organizationId) {
      throw new AppError('organizationId is required', 400);
    }

    const membership = authReq.user.organizationMemberships.find(
      m => m.organizationId === organizationId
    );
    if (!membership && authReq.user.role !== 'ADMIN') {
      throw new AppError('You are not authorized to view these treatments', 403);
    }

    const treatments = await prisma.riskTreatment.findMany({
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
              select: { id: true, firstName: true, lastName: true, email: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      success: true,
      data: treatments,
    });
  })
);

// ============================================
// AI ENDPOINTS (must be before /:id)
// ============================================

// AI: Analyze entire risk register
router.post(
  '/ai-analyze-register',
  authenticate,
  requirePermission('risks', 'view'),
  asyncHandler(async (req, res) => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new AppError('OpenAI API key is not configured. Please set OPENAI_API_KEY.', 503);
    }

    const authReq = req as AuthenticatedRequest;
    const { organizationId } = req.body;
    if (!organizationId) throw new AppError('Organization ID is required', 400);

    const membership = authReq.user.organizationMemberships.find(
      (m: any) => m.organizationId === organizationId
    );
    if (!membership && authReq.user.role !== 'ADMIN') {
      throw new AppError('Not authorized', 403);
    }

    const risks = await prisma.risk.findMany({
      where: { organizationId },
      include: {
        controls: { include: { control: { select: { controlId: true, name: true, implementationStatus: true } } } },
        treatments: { orderBy: { createdAt: 'desc' }, take: 1 },
        owner: { select: { firstName: true, lastName: true } },
      },
      orderBy: { inherentRisk: 'desc' },
    });

    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { name: true, riskAcceptConfidentiality: true, riskAcceptIntegrity: true, riskAcceptAvailability: true },
    });

    const activeRisks = risks.filter((r: any) => r.status !== 'CLOSED');
    const critical = activeRisks.filter((r: any) => r.inherentRisk && r.inherentRisk >= 20).length;
    const high = activeRisks.filter((r: any) => r.inherentRisk && r.inherentRisk >= 15 && r.inherentRisk < 20).length;
    const medium = activeRisks.filter((r: any) => r.inherentRisk && r.inherentRisk >= 6 && r.inherentRisk < 15).length;
    const low = activeRisks.filter((r: any) => r.inherentRisk && r.inherentRisk < 6).length;

    const treatmentDist = {
      MITIGATE: activeRisks.filter((r: any) => r.treatment === 'MITIGATE').length,
      ACCEPT: activeRisks.filter((r: any) => r.treatment === 'ACCEPT').length,
      TRANSFER: activeRisks.filter((r: any) => r.treatment === 'TRANSFER').length,
      AVOID: activeRisks.filter((r: any) => r.treatment === 'AVOID').length,
      PENDING: activeRisks.filter((r: any) => r.treatment === 'PENDING').length,
    };

    const noControls = activeRisks.filter((r: any) => r.controls.length === 0 && !r.controlsReference).length;
    const noOwner = activeRisks.filter((r: any) => !r.ownerId).length;

    const riskDetails = activeRisks.slice(0, 40).map((r: any) => {
      const ctrls = r.controls.map((rc: any) => rc.control.controlId).join(', ') || r.controlsReference || 'None';
      return `${r.riskId}: ${r.title} | L:${r.likelihood} I:${r.impact} Score:${r.inherentRisk} | Residual:${r.residualRisk || 'N/A'} | Treatment:${r.treatment} | Controls:[${ctrls}] | Owner:${r.owner ? `${r.owner.firstName} ${r.owner.lastName}` : 'Unassigned'} | CIA:${r.affectsConfidentiality ? 'C' : ''}${r.affectsIntegrity ? 'I' : ''}${r.affectsAvailability ? 'A' : ''}`;
    }).join('\n');

    const contextMessage = `
# Risk Register Analysis for: ${org?.name || 'Organization'}

## Statistics
- Total Risks: ${risks.length} (Active: ${activeRisks.length})
- Distribution: Critical(>=20): ${critical}, High(15-19): ${high}, Medium(6-14): ${medium}, Low(<6): ${low}
- Treatment: Mitigate: ${treatmentDist.MITIGATE}, Accept: ${treatmentDist.ACCEPT}, Transfer: ${treatmentDist.TRANSFER}, Avoid: ${treatmentDist.AVOID}, Pending: ${treatmentDist.PENDING}

## Coverage Gaps
- Risks without linked controls: ${noControls}
- Risks without assigned owner: ${noOwner}
- Risks pending treatment: ${treatmentDist.PENDING}

## Organization Risk Acceptance Thresholds
- Confidentiality: ${org?.riskAcceptConfidentiality}, Integrity: ${org?.riskAcceptIntegrity}, Availability: ${org?.riskAcceptAvailability}

## Risk Details (Top ${Math.min(activeRisks.length, 40)} by inherent score)
${riskDetails}
`;

    const openai = new OpenAI({ apiKey });
    const chatModel = process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini';

    const completion = await openai.chat.completions.create({
      model: chatModel,
      messages: [
        {
          role: 'system',
          content: `You are an ISO 27001:2022 risk management expert. Analyze this organization's complete risk register and provide a comprehensive review:

1. **Executive Summary** - 2-3 sentence overview of the organization's risk posture
2. **Risk Distribution Analysis** - Comment on the balance of risk levels, identify if there are too many high/critical risks unaddressed
3. **Top Priority Risks** - Identify the 3-5 risks that need the most urgent attention and explain why
4. **Treatment Coverage Gaps** - Risks still pending treatment, risks where the treatment strategy seems insufficient
5. **Control Mapping Gaps** - Risks without adequate ISO 27001 Annex A control references; suggest which controls should be mapped
6. **Ownership Gaps** - Risks without assigned owners
7. **Recommendations** - 3-5 specific, actionable recommendations to improve the overall risk posture

Focus on practical, actionable advice. Reference specific risk IDs and ISO 27001 control IDs (A.x.x) where relevant.`,
        },
        { role: 'user', content: `Please analyze this risk register:\n${contextMessage}` },
      ],
      temperature: 0.3,
      max_tokens: 3000,
    });

    const analysis = completion.choices[0]?.message?.content || 'Unable to generate analysis.';
    logger.info(`AI register analysis generated for organization ${organizationId}`);

    res.json({ success: true, data: { analysis, generatedAt: new Date().toISOString() } });
  })
);

// AI: Suggest scoring/controls for new risk
router.post(
  '/ai-suggest',
  authenticate,
  requirePermission('risks', 'edit'),
  asyncHandler(async (req, res) => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new AppError('OpenAI API key is not configured. Please set OPENAI_API_KEY.', 503);
    }

    const authReq = req as AuthenticatedRequest;
    const { title, description, organizationId } = req.body;
    if (!organizationId || !title || !description) {
      throw new AppError('organizationId, title, and description are required', 400);
    }

    const membership = authReq.user.organizationMemberships.find(
      (m: any) => m.organizationId === organizationId
    );
    if (!membership && authReq.user.role !== 'ADMIN') {
      throw new AppError('Not authorized', 403);
    }

    const existingRisks = await prisma.risk.findMany({
      where: { organizationId, status: { not: 'CLOSED' } },
      select: { riskId: true, title: true },
      take: 60,
    });

    const controls = await prisma.control.findMany({
      where: { organizationId, frameworkSlug: 'iso27001' },
      select: { controlId: true, name: true, implementationStatus: true },
    });

    const existingList = existingRisks.map((r: any) => `${r.riskId}: ${r.title}`).join('\n  ');
    const controlsList = controls.map((c: any) => `${c.controlId}: ${c.name} [${c.implementationStatus}]`).join('\n  ');

    const contextMessage = `
# New Risk Being Created
Title: ${title}
Description: ${description}

## Existing Risks in Register (check for duplicates)
  ${existingList}

## Available ISO 27001 Controls
  ${controlsList}
`;

    const openai = new OpenAI({ apiKey });
    const chatModel = process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini';

    const completion = await openai.chat.completions.create({
      model: chatModel,
      messages: [
        {
          role: 'system',
          content: `You are an ISO 27001:2022 risk management expert. A user is creating a new risk entry. Based on the title and description, provide suggestions in this EXACT JSON format (no markdown, just valid JSON):

{
  "suggestedLikelihood": <1-5>,
  "likelihoodRationale": "<brief explanation>",
  "suggestedImpact": <1-5>,
  "impactRationale": "<brief explanation>",
  "suggestedControls": ["<controlId1>", "<controlId2>"],
  "controlsRationale": "<brief explanation>",
  "affectsConfidentiality": <true/false>,
  "affectsIntegrity": <true/false>,
  "affectsAvailability": <true/false>,
  "ciaRationale": "<brief explanation>",
  "potentialDuplicates": ["<RISK-XXX>"],
  "duplicateNotes": "<explanation or 'No similar risks identified'>",
  "suggestedCategory": "<OPERATIONAL|TECHNICAL|COMPLIANCE|FINANCIAL|STRATEGIC>",
  "additionalNotes": "<any other relevant observations, max 2 sentences>"
}

Only reference control IDs from the provided list. Likelihood scale: 1=Rare, 2=Unlikely, 3=Possible, 4=Likely, 5=Frequent. Impact scale: 1=Incidental, 2=Minor, 3=Moderate, 4=Major, 5=Catastrophic. Be practical and conservative. Return ONLY valid JSON.`,
        },
        { role: 'user', content: contextMessage },
      ],
      temperature: 0.3,
      max_tokens: 1000,
    });

    const rawResponse = completion.choices[0]?.message?.content || '{}';
    let suggestions;
    try {
      const cleaned = rawResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      suggestions = JSON.parse(cleaned);
    } catch {
      suggestions = { error: 'Failed to parse AI suggestions', rawResponse };
    }

    logger.info(`AI suggestion generated for new risk in org ${organizationId}`);
    res.json({ success: true, data: { suggestions, generatedAt: new Date().toISOString() } });
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

// Get risk treatments for a specific risk
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

// AI: Review a single risk
router.post(
  '/:id/ai-review',
  authenticate,
  uuidParam('id'),
  validate,
  asyncHandler(async (req, res) => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new AppError('OpenAI API key is not configured. Please set OPENAI_API_KEY.', 503);
    }

    const { id } = req.params;
    const authReq = req as AuthenticatedRequest;

    const risk = await prisma.risk.findUnique({
      where: { id },
      include: {
        organization: { select: { id: true, name: true, riskAcceptConfidentiality: true, riskAcceptIntegrity: true, riskAcceptAvailability: true } },
        owner: { select: { firstName: true, lastName: true, email: true } },
        controls: { include: { control: { select: { controlId: true, name: true, implementationStatus: true, category: true } } } },
        assets: { include: { asset: { select: { name: true, classification: true, assetType: true } } } },
        treatments: { orderBy: { createdAt: 'desc' }, take: 5 },
      },
    });

    if (!risk) throw new AppError('Risk not found', 404);

    const membership = authReq.user.organizationMemberships.find(
      (m: any) => m.organizationId === risk.organizationId
    );
    if (!membership && authReq.user.role !== 'ADMIN') {
      throw new AppError('Not authorized', 403);
    }

    const otherRisks = await prisma.risk.findMany({
      where: { organizationId: risk.organizationId, id: { not: id }, status: { not: 'CLOSED' } },
      select: { riskId: true, title: true, likelihood: true, impact: true, inherentRisk: true, treatment: true },
      take: 50,
    });

    const linkedControls = risk.controls.map((rc: any) =>
      `${rc.control.controlId} - ${rc.control.name} [${rc.control.implementationStatus}]`
    ).join('\n  ') || 'None linked';

    const linkedAssets = risk.assets.map((ra: any) =>
      `${ra.asset.name} (${ra.asset.assetType}, ${ra.asset.classification})`
    ).join(', ') || 'None linked';

    const treatmentHistory = risk.treatments.map((t: any) =>
      `Response: ${t.riskResponse}, Residual: ${t.residualProbability}x${t.residualImpact}=${t.residualRisk}, Control: ${(t.controlDescription || '').substring(0, 100)}`
    ).join('\n  ') || 'No treatments recorded';

    const otherRisksSummary = otherRisks.map((r: any) =>
      `${r.riskId}: ${r.title} [Score:${r.inherentRisk}]`
    ).join('\n  ');

    const contextMessage = `
# Risk Under Review
Risk ID: ${risk.riskId}
Title: ${risk.title}
Description: ${risk.description || 'No description'}
Category: ${risk.category || 'Not categorized'}

## Risk Scoring
- Inherent: Likelihood=${risk.likelihood}, Impact=${risk.impact}, Score=${risk.inherentRisk}
- Residual: Probability=${risk.residualProbability || 'N/A'}, Impact=${risk.residualImpact || 'N/A'}, Score=${risk.residualRisk || 'N/A'}

## CIA Impact
- Confidentiality: ${risk.affectsConfidentiality ? 'YES' : 'No'} (Org threshold: ${risk.organization.riskAcceptConfidentiality})
- Integrity: ${risk.affectsIntegrity ? 'YES' : 'No'} (Org threshold: ${risk.organization.riskAcceptIntegrity})
- Availability: ${risk.affectsAvailability ? 'YES' : 'No'} (Org threshold: ${risk.organization.riskAcceptAvailability})

## Treatment: ${risk.treatment}
Control Description: ${risk.controlDescription || 'None'}
Controls Reference: ${risk.controlsReference || 'None'}

## Linked ISO 27001 Controls
  ${linkedControls}

## Linked Assets: ${linkedAssets}

## Treatment History
  ${treatmentHistory}

## Owner: ${risk.owner ? `${risk.owner.firstName} ${risk.owner.lastName}` : 'Unassigned'}

## Other Risks in Register (for duplicate detection)
  ${otherRisksSummary}
`;

    const openai = new OpenAI({ apiKey });
    const chatModel = process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini';

    const completion = await openai.chat.completions.create({
      model: chatModel,
      messages: [
        {
          role: 'system',
          content: `You are an ISO 27001:2022 risk management expert reviewing a single risk assessment entry. Provide a thorough but concise review:

1. **Assessment Quality** - Is the risk description comprehensive? Does it clearly identify threat, vulnerability, and impact?
2. **Scoring Analysis** - Is the likelihood/impact scoring appropriate? Is the inherent risk score reasonable?
3. **Treatment Evaluation** - Is the chosen treatment strategy appropriate? Are residual risk levels acceptable given org thresholds?
4. **Control Mapping** - Are the linked ISO 27001 Annex A controls adequate? Suggest additional controls (reference specific A.x.x IDs).
5. **CIA Analysis** - Are the confidentiality/integrity/availability flags correctly set?
6. **Potential Duplicates** - Flag any risks in the register that appear similar or overlapping.
7. **Recommendations** - Specific, actionable improvements for this risk entry.

Be concise but specific. Reference ISO 27001:2022 Annex A control numbers. Keep total response under 800 words.`,
        },
        { role: 'user', content: `Please review this risk assessment:\n${contextMessage}` },
      ],
      temperature: 0.3,
      max_tokens: 2000,
    });

    const analysis = completion.choices[0]?.message?.content || 'Unable to generate analysis.';
    logger.info(`AI review generated for risk ${id} (${risk.riskId})`);

    res.json({ success: true, data: { analysis, generatedAt: new Date().toISOString() } });
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
      controlsReference,
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
    const riskUpdate: any = {
      residualRisk: residualProbability * residualImpact,
      residualProbability,
      residualImpact,
      treatment: riskResponse,
      controlDescription,
      reviewedAt: new Date(),
    };
    if (controlsReference !== undefined) {
      riskUpdate.controlsReference = controlsReference;
    }
    await prisma.risk.update({
      where: { id },
      data: riskUpdate,
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
