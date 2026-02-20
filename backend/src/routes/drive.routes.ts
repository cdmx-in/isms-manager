import { Router } from 'express';
import { prisma } from '../index.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { authenticate, requirePermission, AuthenticatedRequest } from '../middleware/auth.js';
import {
  isDriveConfigured,
  listFolderContents,
  getFileMetadata,
  searchDriveFiles,
  syncFolderToDb,
  syncAllFolders,
} from '../services/googleDrive.service.js';

const router = Router();

// ============================================
// FOLDER CONFIGURATION (Admin)
// ============================================

// List configured Drive folders for an organization
router.get(
  '/folders',
  authenticate,
  requirePermission('policies', 'view'),
  asyncHandler(async (req, res) => {
    const { organizationId } = req.query;

    if (!organizationId) {
      throw new AppError('Organization ID is required', 400);
    }

    const folders = await prisma.driveFolder.findMany({
      where: { organizationId: organizationId as string },
      include: {
        _count: { select: { documents: true } },
      },
      orderBy: { name: 'asc' },
    });

    res.json({
      success: true,
      data: folders,
      driveConfigured: isDriveConfigured(),
    });
  })
);

// Add a Drive folder to organization config
router.post(
  '/folders',
  authenticate,
  requirePermission('policies', 'edit'),
  asyncHandler(async (req, res) => {
    const { organizationId, driveId, name, folderType } = req.body;

    if (!organizationId || !driveId || !name) {
      throw new AppError('organizationId, driveId, and name are required', 400);
    }

    const folder = await prisma.driveFolder.create({
      data: {
        organizationId,
        driveId,
        name,
        folderType: folderType || 'DOCUMENTS',
      },
    });

    res.status(201).json({ success: true, data: folder });
  })
);

// Update a configured Drive folder
router.patch(
  '/folders/:id',
  authenticate,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const { id } = req.params;
    const { name, folderType } = req.body;

    const folder = await prisma.driveFolder.findUnique({ where: { id } });
    if (!folder) throw new AppError('Folder not found', 404);

    const membership = authReq.user.organizationMemberships.find(
      m => m.organizationId === folder.organizationId
    );
    if (!membership || (membership.role !== 'ADMIN' && authReq.user.role !== 'ADMIN')) {
      throw new AppError('Admin access required', 403);
    }

    const updated = await prisma.driveFolder.update({
      where: { id },
      data: { ...(name && { name }), ...(folderType && { folderType }) },
    });

    res.json({ success: true, data: updated });
  })
);

// Remove a configured Drive folder
router.delete(
  '/folders/:id',
  authenticate,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const { id } = req.params;

    const folder = await prisma.driveFolder.findUnique({ where: { id } });
    if (!folder) throw new AppError('Folder not found', 404);

    const membership = authReq.user.organizationMemberships.find(
      m => m.organizationId === folder.organizationId
    );
    if (!membership || (membership.role !== 'ADMIN' && authReq.user.role !== 'ADMIN')) {
      throw new AppError('Admin access required', 403);
    }

    await prisma.driveFolder.delete({ where: { id } });
    res.json({ success: true, message: 'Folder removed' });
  })
);

// ============================================
// FOLDER BROWSING
// ============================================

// List contents of a Drive folder (live from Google Drive)
router.get(
  '/folders/:folderId/contents',
  authenticate,
  asyncHandler(async (req, res) => {
    const { folderId } = req.params;
    const { pageToken } = req.query;

    if (!isDriveConfigured()) {
      throw new AppError('Google Drive is not configured', 503);
    }

    const result = await listFolderContents(folderId, pageToken as string | undefined);
    res.json({ success: true, data: result.files, nextPageToken: result.nextPageToken });
  })
);

// Get file metadata
router.get(
  '/files/:fileId',
  authenticate,
  asyncHandler(async (req, res) => {
    const { fileId } = req.params;

    if (!isDriveConfigured()) {
      throw new AppError('Google Drive is not configured', 503);
    }

    const file = await getFileMetadata(fileId);
    res.json({ success: true, data: file });
  })
);

// Search files by name
router.get(
  '/search',
  authenticate,
  requirePermission('policies', 'view'),
  asyncHandler(async (req, res) => {
    const { organizationId, q } = req.query;

    if (!organizationId || !q) {
      throw new AppError('organizationId and q (query) are required', 400);
    }

    if (!isDriveConfigured()) {
      throw new AppError('Google Drive is not configured', 503);
    }

    // Get configured folder IDs for this org
    const folders = await prisma.driveFolder.findMany({
      where: { organizationId: organizationId as string },
      select: { driveId: true },
    });

    const folderIds = folders.map(f => f.driveId);
    const files = await searchDriveFiles(q as string, folderIds.length > 0 ? folderIds : undefined);

    res.json({ success: true, data: files });
  })
);

// ============================================
// SYNC OPERATIONS
// ============================================

// Sync all configured folders for an organization
router.post(
  '/sync',
  authenticate,
  requirePermission('policies', 'edit'),
  asyncHandler(async (req, res) => {
    const { organizationId } = req.body;

    if (!organizationId) {
      throw new AppError('organizationId is required', 400);
    }

    if (!isDriveConfigured()) {
      throw new AppError('Google Drive is not configured', 503);
    }

    const result = await syncAllFolders(organizationId);

    res.json({
      success: true,
      message: `Synced ${result.synced} files with ${result.errors} errors`,
      data: result,
    });
  })
);

// Sync a specific folder
router.post(
  '/sync/:folderId',
  authenticate,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const { folderId } = req.params;

    const folder = await prisma.driveFolder.findUnique({ where: { id: folderId } });
    if (!folder) throw new AppError('Folder not found', 404);

    const membership = authReq.user.organizationMemberships.find(
      m => m.organizationId === folder.organizationId
    );
    if (!membership || (membership.role !== 'ADMIN' && authReq.user.role !== 'ADMIN')) {
      throw new AppError('Admin access required', 403);
    }

    if (!isDriveConfigured()) {
      throw new AppError('Google Drive is not configured', 503);
    }

    const result = await syncFolderToDb(folder.driveId, folder.organizationId, folder.id);

    res.json({
      success: true,
      message: `Synced ${result.synced} files with ${result.errors} errors`,
      data: result,
    });
  })
);

// ============================================
// DOCUMENT LISTING (from DB - synced documents)
// ============================================

// List all synced documents for an organization
router.get(
  '/documents',
  authenticate,
  requirePermission('policies', 'view'),
  asyncHandler(async (req, res) => {
    const { organizationId, folderId, search } = req.query;

    if (!organizationId) {
      throw new AppError('Organization ID is required', 400);
    }

    const where: any = { organizationId: organizationId as string };
    if (folderId) where.folderId = folderId as string;
    if (search) where.name = { contains: search as string, mode: 'insensitive' };

    const documents = await prisma.driveDocument.findMany({
      where,
      include: {
        folder: { select: { id: true, name: true, folderType: true } },
      },
      orderBy: { driveModifiedAt: 'desc' },
    });

    res.json({ success: true, data: documents });
  })
);

export default router;
