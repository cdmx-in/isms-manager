import { Router } from 'express';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { authenticate, AuthenticatedRequest } from '../middleware/auth.js';
import {
  indexDocument,
  indexAllDocuments,
  semanticSearch,
  answerQuestion,
  getIndexingStatus,
} from '../services/rag.service.js';

const router = Router();

// ============================================
// INDEXING
// ============================================

// Index a specific document
router.post(
  '/index/:documentId',
  authenticate,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const { documentId } = req.params;

    // Admin only
    if (authReq.user.role !== 'ADMIN') {
      const isOrgAdmin = authReq.user.organizationMemberships.some(m => m.role === 'ADMIN');
      if (!isOrgAdmin) throw new AppError('Admin access required', 403);
    }

    if (!process.env.OPENAI_API_KEY) {
      throw new AppError('OpenAI API key is not configured', 503);
    }

    const result = await indexDocument(documentId);

    res.json({
      success: true,
      message: `Document indexed successfully with ${result.chunkCount} chunks`,
      data: result,
    });
  })
);

// Index all un-indexed documents for an organization
router.post(
  '/index-all',
  authenticate,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const { organizationId } = req.body;

    if (!organizationId) {
      throw new AppError('organizationId is required', 400);
    }

    // Admin only
    const membership = authReq.user.organizationMemberships.find(
      m => m.organizationId === organizationId
    );
    if (!membership || (membership.role !== 'ADMIN' && authReq.user.role !== 'ADMIN')) {
      throw new AppError('Admin access required', 403);
    }

    if (!process.env.OPENAI_API_KEY) {
      throw new AppError('OpenAI API key is not configured', 503);
    }

    const result = await indexAllDocuments(organizationId);

    res.json({
      success: true,
      message: `Indexed ${result.indexed} documents (${result.totalChunks} chunks), ${result.errors} errors`,
      data: result,
    });
  })
);

// ============================================
// SEARCH & Q&A
// ============================================

// Semantic search across indexed documents
router.get(
  '/search',
  authenticate,
  asyncHandler(async (req, res) => {
    const { organizationId, q, limit, folderId } = req.query;

    if (!organizationId || !q) {
      throw new AppError('organizationId and q (query) are required', 400);
    }

    if (!process.env.OPENAI_API_KEY) {
      throw new AppError('OpenAI API key is not configured', 503);
    }

    const authReq = req as AuthenticatedRequest;
    const membership = authReq.user.organizationMemberships.find(
      m => m.organizationId === organizationId
    );
    if (!membership && authReq.user.role !== 'ADMIN') {
      throw new AppError('You are not a member of this organization', 403);
    }

    const results = await semanticSearch(q as string, organizationId as string, {
      limit: limit ? parseInt(limit as string) : 10,
      folderId: folderId as string | undefined,
    });

    res.json({ success: true, data: results });
  })
);

// Ask a question (RAG Q&A)
router.post(
  '/ask',
  authenticate,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const { organizationId, question } = req.body;

    if (!organizationId || !question) {
      throw new AppError('organizationId and question are required', 400);
    }

    if (!process.env.OPENAI_API_KEY) {
      throw new AppError('OpenAI API key is not configured', 503);
    }

    const membership = authReq.user.organizationMemberships.find(
      m => m.organizationId === organizationId
    );
    if (!membership && authReq.user.role !== 'ADMIN') {
      throw new AppError('You are not a member of this organization', 403);
    }

    const answer = await answerQuestion(question, organizationId);

    res.json({ success: true, data: answer });
  })
);

// ============================================
// STATUS
// ============================================

// Get indexing status
router.get(
  '/status',
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
      throw new AppError('You are not a member of this organization', 403);
    }

    const status = await getIndexingStatus(organizationId as string);

    res.json({
      success: true,
      data: {
        ...status,
        openaiConfigured: !!process.env.OPENAI_API_KEY,
        driveConfigured: !!process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH,
      },
    });
  })
);

export default router;
