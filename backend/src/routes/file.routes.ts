import { Router } from 'express';
import { prisma } from '../index.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { authenticate, AuthenticatedRequest } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { uuidParam } from '../middleware/validators.js';
import { createAuditLog } from '../services/audit.service.js';
import { storageService } from '../services/storage.service.js';
import multer from 'multer';
import path from 'path';
import crypto from 'crypto';

const router = Router();

// Map entityType to valid FileCategory enum values
const ENTITY_TYPE_TO_CATEGORY: Record<string, string> = {
  control: 'EVIDENCE',
  asset: 'ASSET_DOCUMENT',
  incident: 'INCIDENT_EVIDENCE',
  policy: 'POLICY_ATTACHMENT',
  audit: 'AUDIT_REPORT',
};

function resolveFileCategory(entityType?: string): string {
  if (!entityType) return 'OTHER';
  return ENTITY_TYPE_TO_CATEGORY[entityType.toLowerCase()] || 'OTHER';
}

// Configure multer
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow common document types
    const allowedMimes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain',
      'text/csv',
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'application/zip',
      'application/x-zip-compressed',
    ];

    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} is not allowed`));
    }
  },
});

// Upload file
router.post(
  '/upload',
  authenticate,
  upload.single('file'),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const { organizationId, entityType, entityId, description } = req.body;

    if (!req.file) {
      throw new AppError('File is required', 400);
    }

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

    if (membership?.role === 'VIEWER') {
      throw new AppError('Viewers cannot upload files', 403);
    }

    // Use the unified upload service
    const fileRecord = await storageService.uploadFile(req.file, {
      organizationId,
      userId: authReq.user.id,
      category: resolveFileCategory(entityType) as any,
      description,
      ...(entityType === 'asset' && entityId ? { assetId: entityId } : {}),
      ...(entityType === 'control' && entityId ? { controlId: entityId } : {}),
      ...(entityType === 'incident' && entityId ? { incidentId: entityId } : {}),
    });

    await createAuditLog({
      userId: authReq.user.id,
      organizationId,
      action: 'CREATE',
      entityType: 'File',
      entityId: fileRecord.id,
      newValues: { originalName: req.file.originalname, size: req.file.size },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.status(201).json({
      success: true,
      data: fileRecord,
    });
  })
);

// Upload multiple files
router.post(
  '/upload-multiple',
  authenticate,
  upload.array('files', 10),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const { organizationId, entityType, entityId } = req.body;
    const files = req.files as Express.Multer.File[];

    if (!files || files.length === 0) {
      throw new AppError('At least one file is required', 400);
    }

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

    const uploadedFiles = [];

    for (const file of files) {
      const fileRecord = await storageService.uploadFile(file, {
        organizationId,
        userId: authReq.user.id,
        category: resolveFileCategory(entityType as string) as any,
        ...(entityType === 'asset' && entityId ? { assetId: entityId } : {}),
        ...(entityType === 'control' && entityId ? { controlId: entityId } : {}),
        ...(entityType === 'incident' && entityId ? { incidentId: entityId } : {}),
      });

      uploadedFiles.push(fileRecord);
    }

    await createAuditLog({
      userId: authReq.user.id,
      organizationId,
      action: 'CREATE',
      entityType: 'File',
      newValues: { filesUploaded: uploadedFiles.length },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.status(201).json({
      success: true,
      data: uploadedFiles,
    });
  })
);

// Get file download URL
router.get(
  '/:id/download',
  authenticate,
  uuidParam('id'),
  validate,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const authReq = req as AuthenticatedRequest;

    const file = await prisma.fileUpload.findUnique({ where: { id } });
    if (!file) {
      throw new AppError('File not found', 404);
    }

    // Check membership
    const membership = authReq.user.organizationMemberships.find(
      m => m.organizationId === file.organizationId
    );
    if (!membership && authReq.user.role !== 'ADMIN') {
      throw new AppError('You are not authorized to access this file', 403);
    }

    // Generate presigned URL
    const url = await storageService.getPresignedUrl(file.storagePath, 3600); // 1 hour expiry

    res.json({
      success: true,
      data: {
        url,
        filename: file.originalName,
        mimeType: file.mimeType,
        expiresIn: 3600,
      },
    });
  })
);

// Stream file directly
router.get(
  '/:id/stream',
  authenticate,
  uuidParam('id'),
  validate,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const authReq = req as AuthenticatedRequest;

    const file = await prisma.fileUpload.findUnique({ where: { id } });
    if (!file) {
      throw new AppError('File not found', 404);
    }

    // Check membership
    const membership = authReq.user.organizationMemberships.find(
      m => m.organizationId === file.organizationId
    );
    if (!membership && authReq.user.role !== 'ADMIN') {
      throw new AppError('You are not authorized to access this file', 403);
    }

    const result = await storageService.getFileStream(file.id, authReq.user.id);

    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${file.originalName}"`);

    result.stream.pipe(res);
  })
);

// List files for organization
router.get(
  '/',
  authenticate,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const {
      organizationId,
      entityType,
      entityId,
      page = 1,
      limit = 20,
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
    if (entityType === 'asset' && entityId) where.assetId = entityId;
    if (entityType === 'control' && entityId) where.controlId = entityId;
    if (entityType === 'incident' && entityId) where.incidentId = entityId;

    const [files, total] = await Promise.all([
      prisma.fileUpload.findMany({
        where,
        include: {
          uploadedBy: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
      prisma.fileUpload.count({ where }),
    ]);

    res.json({
      success: true,
      data: files,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit)),
      },
    });
  })
);

// Delete file
router.delete(
  '/:id',
  authenticate,
  uuidParam('id'),
  validate,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const authReq = req as AuthenticatedRequest;

    const file = await prisma.fileUpload.findUnique({ where: { id } });
    if (!file) {
      throw new AppError('File not found', 404);
    }

    // Check membership and role
    const membership = authReq.user.organizationMemberships.find(
      m => m.organizationId === file.organizationId
    );
    if (!membership && authReq.user.role !== 'ADMIN') {
      throw new AppError('You are not authorized', 403);
    }

    // Only admins or file uploader can delete
    const canDelete =
      authReq.user.role === 'ADMIN' ||
      membership?.role === 'ADMIN' ||
      membership?.role === 'LOCAL_ADMIN' ||
      file.uploadedById === authReq.user.id;

    if (!canDelete) {
      throw new AppError('You are not authorized to delete this file', 403);
    }

    // Delete from storage and database
    await storageService.deleteFile(file.id, authReq.user.id);

    await createAuditLog({
      userId: authReq.user.id,
      organizationId: file.organizationId,
      action: 'DELETE',
      entityType: 'File',
      entityId: id,
      oldValues: { originalName: file.originalName },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({
      success: true,
      message: 'File deleted successfully',
    });
  })
);

export default router;
