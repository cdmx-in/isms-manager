import { Router } from 'express';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { paginationQuery } from '../middleware/validators.js';
import { itopService } from '../services/itop.service.js';

const router = Router();

// Get incidents from iTop
router.get(
  '/',
  authenticate,
  requirePermission('incidents', 'view'),
  paginationQuery,
  validate,
  asyncHandler(async (req, res) => {
    const {
      page = 1,
      limit = 50,
      organizationId,
      status,
      severity,
      search,
      team,
      origin,
    } = req.query;

    if (!organizationId) {
      throw new AppError('Organization ID is required', 400);
    }

    const result = await itopService.getIncidents({
      status: status as string | undefined,
      search: search as string | undefined,
      team: team as string | undefined,
      origin: origin as string | undefined,
      limit: Number(limit),
      page: Number(page),
    });

    // Apply severity filter client-side (iTop uses priority, not severity)
    let filteredData = result.data;
    let filteredTotal = result.total;
    if (severity) {
      filteredData = filteredData.filter((inc: any) => inc.severity === severity);
      filteredTotal = filteredData.length;
    }

    res.json({
      success: true,
      data: filteredData,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: filteredTotal,
        totalPages: Math.ceil(filteredTotal / Number(limit)),
      },
    });
  })
);

// Get incident statistics from iTop
router.get(
  '/stats',
  authenticate,
  requirePermission('incidents', 'view'),
  asyncHandler(async (req, res) => {
    const { organizationId } = req.query;

    if (!organizationId) {
      throw new AppError('Organization ID is required', 400);
    }

    const stats = await itopService.getIncidentStats();

    res.json({
      success: true,
      data: stats,
    });
  })
);

export default router;
