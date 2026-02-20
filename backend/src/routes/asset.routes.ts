import { Router } from 'express';
import { prisma } from '../index.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { authenticate, requirePermission, AuthenticatedRequest } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { createAssetValidator, uuidParam, paginationQuery } from '../middleware/validators.js';
import { createAuditLog } from '../services/audit.service.js';
import { parse } from 'csv-parse/sync';
import multer from 'multer';
import { itopService } from '../services/itop.service.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// Get assets for organization (from iTop)
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
      search, 
      assetType, 
      classification,
      sortBy = 'name',
      sortOrder = 'asc'
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

    // Fetch all assets from iTop
    let assets = await itopService.getAllAssets();

    // Apply filters
    if (search) {
      const searchLower = (search as string).toLowerCase();
      assets = assets.filter(asset =>
        asset.name?.toLowerCase().includes(searchLower) ||
        asset.description?.toLowerCase().includes(searchLower) ||
        asset.location?.toLowerCase().includes(searchLower) ||
        asset.owner?.toLowerCase().includes(searchLower)
      );
    }

    if (assetType) {
      assets = assets.filter(asset => asset.assetType === assetType);
    }

    if (classification) {
      assets = assets.filter(asset => asset.classification === classification);
    }

    // Sort assets
    assets.sort((a, b) => {
      const aValue = a[sortBy as string] || '';
      const bValue = b[sortBy as string] || '';
      if (sortOrder === 'desc') {
        return bValue > aValue ? 1 : -1;
      }
      return aValue > bValue ? 1 : -1;
    });

    // Paginate
    const total = assets.length;
    const start = (Number(page) - 1) * Number(limit);
    const paginatedAssets = assets.slice(start, start + Number(limit));

    res.json({
      success: true,
      data: paginatedAssets,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit)),
      },
    });
  })
);

// Get single asset (from iTop - read-only)
router.get(
  '/:id',
  authenticate,
  validate,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const authReq = req as AuthenticatedRequest;
    const { organizationId } = req.query;

    if (!organizationId) {
      throw new AppError('Organization ID is required', 400);
    }

    // Check membership
    const membership = authReq.user.organizationMemberships.find(
      m => m.organizationId === organizationId
    );
    if (!membership && authReq.user.role !== 'ADMIN') {
      throw new AppError('You are not authorized to view this asset', 403);
    }

    // Get all assets and find by ID
    const assets = await itopService.getAllAssets();
    const asset = assets.find(a => a.id === id);

    if (!asset) {
      throw new AppError('Asset not found', 404);
    }

    res.json({
      success: true,
      data: asset,
    });
  })
);

/*
 * Assets are now read-only from iTop.
 * Create, Update, and Delete operations are disabled.
 * Please manage assets in iTop directly.
 */

// Create asset - DISABLED (assets come from iTop)
// router.post('/', ...)

// Update asset - DISABLED (assets come from iTop)
// router.patch('/:id', ...)

// Delete asset - DISABLED (assets come from iTop)
// router.delete('/:id', ...)

// Import assets from CSV - DISABLED (assets come from iTop)
// router.post('/import', ...)

export default router;
