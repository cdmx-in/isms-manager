import { Router } from 'express';
import { prisma } from '../index.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { authenticate, AuthenticatedRequest } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { createIncidentValidator, uuidParam, paginationQuery } from '../middleware/validators.js';
import { createAuditLog } from '../services/audit.service.js';

const router = Router();

// Generate next incident ID for organization
const generateIncidentId = async (organizationId: string): Promise<string> => {
  const lastIncident = await prisma.incident.findFirst({
    where: { organizationId },
    orderBy: { createdAt: 'desc' },
    select: { incidentId: true },
  });

  if (!lastIncident) {
    return 'INC-001';
  }

  const lastNumber = parseInt(lastIncident.incidentId.replace('INC-', '')) || 0;
  return `INC-${String(lastNumber + 1).padStart(3, '0')}`;
};

// Get incidents for organization
router.get(
  '/',
  authenticate,
  paginationQuery,
  validate,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const {
      page = 1,
      limit = 20,
      organizationId,
      status,
      severity,
      category,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = req.query;

    if (!organizationId) {
      throw new AppError('Organization ID is required', 400);
    }

    // Check membership
    const membership = authReq.user.organizationMemberships.find(
      m => m.organizationId === organizationId
    );
    if (!membership && authReq.user.role !== 'ADMIN') {
      throw new AppError('You are not a member of this organization', 403);
    }

    const where: any = { organizationId };
    if (status) where.status = status;
    if (severity) where.severity = severity;
    if (search) {
      where.OR = [
        { incidentId: { contains: search as string, mode: 'insensitive' } },
        { title: { contains: search as string, mode: 'insensitive' } },
        { description: { contains: search as string, mode: 'insensitive' } },
      ];
    }

    const [incidents, total] = await Promise.all([
      prisma.incident.findMany({
        where,
        include: {
          createdBy: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
          assignee: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
          _count: {
            select: { files: true },
          },
        },
        orderBy: { [sortBy as string]: sortOrder },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
      prisma.incident.count({ where }),
    ]);

    res.json({
      success: true,
      data: incidents,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit)),
      },
    });
  })
);

// Get incident statistics
router.get(
  '/stats',
  authenticate,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const { organizationId, days = 30 } = req.query;

    if (!organizationId) {
      throw new AppError('Organization ID is required', 400);
    }

    // Check membership
    const membership = authReq.user.organizationMemberships.find(
      m => m.organizationId === organizationId
    );
    if (!membership && authReq.user.role !== 'ADMIN') {
      throw new AppError('You are not a member of this organization', 403);
    }

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - Number(days));

    // Get status breakdown
    const statusStats = await prisma.incident.groupBy({
      by: ['status'],
      where: { organizationId: organizationId as string },
      _count: true,
    });

    // Get severity breakdown
    const severityStats = await prisma.incident.groupBy({
      by: ['severity'],
      where: { organizationId: organizationId as string },
      _count: true,
    });

    // Get recent incidents count
    const recentCount = await prisma.incident.count({
      where: {
        organizationId: organizationId as string,
        createdAt: { gte: startDate },
      },
    });

    // Calculate average resolution time for closed incidents
    const closedIncidents = await prisma.incident.findMany({
      where: {
        organizationId: organizationId as string,
        status: 'CLOSED',
        resolvedAt: { not: null },
      },
      select: { reportedAt: true, resolvedAt: true },
    });

    let avgResolutionHours = 0;
    if (closedIncidents.length > 0) {
      const totalHours = closedIncidents.reduce((sum, inc) => {
        const reportedAt = inc.reportedAt || new Date();
        const resolvedAt = inc.resolvedAt || new Date();
        return sum + (resolvedAt.getTime() - reportedAt.getTime()) / (1000 * 60 * 60);
      }, 0);
      avgResolutionHours = Math.round(totalHours / closedIncidents.length);
    }

    res.json({
      success: true,
      data: {
        total: statusStats.reduce((sum, s) => sum + s._count, 0),
        byStatus: statusStats.reduce((acc, s) => ({ ...acc, [s.status]: s._count }), {}),
        bySeverity: severityStats.reduce((acc, s) => ({ ...acc, [s.severity]: s._count }), {}),
        recentIncidents: recentCount,
        avgResolutionHours,
      },
    });
  })
);

// Get single incident
router.get(
  '/:id',
  authenticate,
  uuidParam('id'),
  validate,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const authReq = req as AuthenticatedRequest;

    const incident = await prisma.incident.findUnique({
      where: { id },
      include: {
        organization: {
          select: { id: true, name: true, slug: true },
        },
        createdBy: {
          select: { id: true, firstName: true, lastName: true, email: true, avatar: true },
        },
        assignee: {
          select: { id: true, firstName: true, lastName: true, email: true, avatar: true },
        },
        files: {
          select: { id: true, originalName: true, mimeType: true, size: true, createdAt: true },
        },
      },
    });

    if (!incident) {
      throw new AppError('Incident not found', 404);
    }

    // Check membership
    const membership = authReq.user.organizationMemberships.find(
      m => m.organizationId === incident.organizationId
    );
    if (!membership && authReq.user.role !== 'ADMIN') {
      throw new AppError('You are not authorized to view this incident', 403);
    }

    res.json({
      success: true,
      data: incident,
    });
  })
);

// Create incident
router.post(
  '/',
  authenticate,
  createIncidentValidator,
  validate,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const {
      organizationId,
      title,
      description,
      category,
      severity = 'MEDIUM',
      affectedAssets,
      impactDescription,
      reportedAt,
      assignedToId,
    } = req.body;

    // Check membership
    const membership = authReq.user.organizationMemberships.find(
      m => m.organizationId === organizationId
    );
    if (!membership && authReq.user.role !== 'ADMIN') {
      throw new AppError('You are not a member of this organization', 403);
    }

    const incidentId = await generateIncidentId(organizationId);

    const incident = await prisma.incident.create({
      data: {
        organizationId,
        incidentId,
        title,
        description,
        severity,
        reportedAt: reportedAt ? new Date(reportedAt) : new Date(),
        createdById: authReq.user.id,
        assigneeId: assignedToId,
        status: 'REPORTED',
      },
      include: {
        createdBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        assignee: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    await createAuditLog({
      userId: authReq.user.id,
      organizationId,
      action: 'CREATE',
      entityType: 'Incident',
      entityId: incident.id,
      newValues: { incidentId, title, severity },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.status(201).json({
      success: true,
      data: incident,
    });
  })
);

// Update incident
router.patch(
  '/:id',
  authenticate,
  uuidParam('id'),
  validate,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const authReq = req as AuthenticatedRequest;

    const existingIncident = await prisma.incident.findUnique({ where: { id } });
    if (!existingIncident) {
      throw new AppError('Incident not found', 404);
    }

    // Check membership
    const membership = authReq.user.organizationMemberships.find(
      m => m.organizationId === existingIncident.organizationId
    );
    if (!membership && authReq.user.role !== 'ADMIN') {
      throw new AppError('You are not authorized to update this incident', 403);
    }

    if (membership?.role === 'VIEWER') {
      throw new AppError('Viewers cannot update incidents', 403);
    }

    const {
      title,
      description,
      severity,
      status,
      rootCause,
      lessonsLearned,
      assignedToId,
      resolvedAt,
      containedAt,
      detectedAt,
    } = req.body;

    const updateData: any = {};
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (severity !== undefined) updateData.severity = severity;
    if (status !== undefined) updateData.status = status;
    if (rootCause !== undefined) updateData.rootCause = rootCause;
    if (lessonsLearned !== undefined) updateData.lessonsLearned = lessonsLearned;
    if (assignedToId !== undefined) updateData.assigneeId = assignedToId;
    if (resolvedAt !== undefined) updateData.resolvedAt = resolvedAt ? new Date(resolvedAt) : null;
    if (containedAt !== undefined) updateData.containedAt = containedAt ? new Date(containedAt) : null;
    if (detectedAt !== undefined) updateData.detectedAt = detectedAt ? new Date(detectedAt) : null;

    // Auto-set resolvedAt when status changes to CLOSED
    if (status === 'CLOSED' && !existingIncident.resolvedAt && !resolvedAt) {
      updateData.resolvedAt = new Date();
    }

    const incident = await prisma.incident.update({
      where: { id },
      data: updateData,
      include: {
        createdBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        assignee: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    await createAuditLog({
      userId: authReq.user.id,
      organizationId: existingIncident.organizationId,
      action: 'UPDATE',
      entityType: 'Incident',
      entityId: id,
      oldValues: { status: existingIncident.status },
      newValues: updateData,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({
      success: true,
      data: incident,
    });
  })
);

// Delete incident
router.delete(
  '/:id',
  authenticate,
  uuidParam('id'),
  validate,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const authReq = req as AuthenticatedRequest;

    const incident = await prisma.incident.findUnique({ where: { id } });
    if (!incident) {
      throw new AppError('Incident not found', 404);
    }

    // Only admins can delete
    const membership = authReq.user.organizationMemberships.find(
      m => m.organizationId === incident.organizationId
    );
    if (!membership && authReq.user.role !== 'ADMIN') {
      throw new AppError('You are not authorized', 403);
    }

    if (membership && !['ADMIN', 'LOCAL_ADMIN'].includes(membership.role)) {
      throw new AppError('Only admins can delete incidents', 403);
    }

    await prisma.incident.delete({ where: { id } });

    await createAuditLog({
      userId: authReq.user.id,
      organizationId: incident.organizationId,
      action: 'DELETE',
      entityType: 'Incident',
      entityId: id,
      oldValues: { incidentId: incident.incidentId, title: incident.title },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({
      success: true,
      message: 'Incident deleted successfully',
    });
  })
);

export default router;
