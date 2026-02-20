import { Router } from 'express';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import {
  startSync,
  getSyncJobStatus,
  getKnowledgeBaseStatus,
  searchIncidents,
  findSimilarIncidents,
  askAboutIncidents,
} from '../services/incidentKnowledge.service.js';

const router = Router();

// Start sync from iTop
router.post(
  '/sync',
  authenticate,
  requirePermission('incidents', 'edit'),
  asyncHandler(async (req, res) => {
    const { organizationId, mode } = req.body;

    if (!organizationId) {
      throw new AppError('Organization ID is required', 400);
    }

    if (!process.env.OPENAI_API_KEY) {
      throw new AppError('OpenAI API key is not configured', 503);
    }

    try {
      const result = await startSync(organizationId, mode || 'incremental');
      res.json({
        success: true,
        data: result,
      });
    } catch (err: any) {
      if (err.message?.startsWith('Sync cooldown')) {
        throw new AppError(err.message, 429);
      }
      throw err;
    }
  })
);

// Get sync job progress
router.get(
  '/sync/:jobId',
  authenticate,
  requirePermission('incidents', 'view'),
  asyncHandler(async (req, res) => {
    const job = await getSyncJobStatus(req.params.jobId);

    if (!job) {
      throw new AppError('Sync job not found', 404);
    }

    res.json({
      success: true,
      data: job,
    });
  })
);

// Get knowledge base status
router.get(
  '/status',
  authenticate,
  requirePermission('incidents', 'view'),
  asyncHandler(async (req, res) => {
    const { organizationId } = req.query;

    if (!organizationId) {
      throw new AppError('Organization ID is required', 400);
    }

    const status = await getKnowledgeBaseStatus(organizationId as string);

    res.json({
      success: true,
      data: status,
    });
  })
);

// Semantic search over incidents
router.get(
  '/search',
  authenticate,
  requirePermission('incidents', 'view'),
  asyncHandler(async (req, res) => {
    const { organizationId, q, limit } = req.query;

    if (!organizationId) {
      throw new AppError('Organization ID is required', 400);
    }
    if (!q) {
      throw new AppError('Search query (q) is required', 400);
    }

    if (!process.env.OPENAI_API_KEY) {
      throw new AppError('OpenAI API key is not configured', 503);
    }

    const results = await searchIncidents(
      q as string,
      organizationId as string,
      Number(limit) || 10
    );

    res.json({
      success: true,
      data: results,
    });
  })
);

// Find similar incidents
router.get(
  '/similar/:itopId',
  authenticate,
  requirePermission('incidents', 'view'),
  asyncHandler(async (req, res) => {
    const { organizationId, limit } = req.query;
    const { itopId } = req.params;

    if (!organizationId) {
      throw new AppError('Organization ID is required', 400);
    }

    if (!process.env.OPENAI_API_KEY) {
      throw new AppError('OpenAI API key is not configured', 503);
    }

    const results = await findSimilarIncidents(
      itopId,
      organizationId as string,
      Number(limit) || 5
    );

    res.json({
      success: true,
      data: results,
    });
  })
);

// RAG Q&A over incidents
router.post(
  '/ask',
  authenticate,
  requirePermission('incidents', 'view'),
  asyncHandler(async (req, res) => {
    const { organizationId, question } = req.body;

    if (!organizationId) {
      throw new AppError('Organization ID is required', 400);
    }
    if (!question) {
      throw new AppError('Question is required', 400);
    }

    if (!process.env.OPENAI_API_KEY) {
      throw new AppError('OpenAI API key is not configured', 503);
    }

    const answer = await askAboutIncidents(question, organizationId);

    res.json({
      success: true,
      data: answer,
    });
  })
);

export default router;
