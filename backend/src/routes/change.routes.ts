import { Router } from 'express';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { paginationQuery } from '../middleware/validators.js';
import { itopService } from '../services/itop.service.js';

const router = Router();

// Get changes from iTop
router.get(
  '/',
  authenticate,
  requirePermission('changes', 'view'),
  paginationQuery,
  validate,
  asyncHandler(async (req, res) => {
    const {
      page = 1,
      limit = 50,
      organizationId,
      status,
      search,
      team,
      changeType,
    } = req.query;

    if (!organizationId) {
      throw new AppError('Organization ID is required', 400);
    }

    const result = await itopService.getChanges({
      status: status as string | undefined,
      search: search as string | undefined,
      team: team as string | undefined,
      changeType: changeType as string | undefined,
      limit: Number(limit),
      page: Number(page),
    });

    res.json({
      success: true,
      data: result.data,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: result.total,
        totalPages: Math.ceil(result.total / Number(limit)),
      },
    });
  })
);

// Get change statistics from iTop
router.get(
  '/stats',
  authenticate,
  requirePermission('changes', 'view'),
  asyncHandler(async (req, res) => {
    const { organizationId } = req.query;

    if (!organizationId) {
      throw new AppError('Organization ID is required', 400);
    }

    const stats = await itopService.getChangeStats();

    res.json({
      success: true,
      data: stats,
    });
  })
);

export default router;
