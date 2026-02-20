import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../index.js';
import { authenticate, requirePermission, AuthenticatedRequest } from '../middleware/auth.js';
import { createAuditLog } from '../services/audit.service.js';
import { ASSESSMENT_FRAMEWORKS, getFrameworkBySlug } from '../data/assessment-frameworks.js';
import multer from 'multer';
import { uploadFile } from '../services/storage.service.js';
import OpenAI from 'openai';
import { logger } from '../utils/logger.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// ============================================
// GET /api/assessments - List assessments
// ============================================
router.get('/',
  authenticate,
  requirePermission('assessments', 'view'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const orgId = authReq.organizationId || req.query.organizationId as string;

      const assessments = await prisma.assessment.findMany({
        where: { organizationId: orgId },
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: {
              requirements: true,
              findings: true,
            },
          },
        },
      });

      // Calculate progress for each assessment
      const enriched = await Promise.all(assessments.map(async (a) => {
        const statusCounts = await prisma.assessmentRequirement.groupBy({
          by: ['status'],
          where: { assessmentId: a.id },
          _count: true,
        });

        const total = statusCounts.reduce((sum, s) => sum + s._count, 0);
        const assessed = statusCounts
          .filter(s => s.status !== 'NOT_STARTED')
          .reduce((sum, s) => sum + s._count, 0);

        return {
          ...a,
          totalRequirements: total,
          assessedRequirements: assessed,
          progressPercent: total > 0 ? Math.round((assessed / total) * 100) : 0,
          findingsCount: a._count.findings,
        };
      }));

      res.json({ data: enriched });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// GET /api/assessments/frameworks - List available frameworks for assessment
// ============================================
router.get('/frameworks',
  authenticate,
  async (_req: Request, res: Response) => {
    const frameworks = ASSESSMENT_FRAMEWORKS.map(f => ({
      slug: f.slug,
      name: f.name,
      shortName: f.shortName,
      description: f.description,
      domainCount: f.domains.length,
      requirementCount: f.domains.reduce((t, d) => t + d.requirements.length, 0),
    }));
    res.json({ data: frameworks });
  }
);

// ============================================
// POST /api/assessments - Create new assessment
// ============================================
router.post('/',
  authenticate,
  requirePermission('assessments', 'edit'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const orgId = authReq.organizationId || req.body.organizationId;
      const { title, description, clientName, assessorName, frameworkSlugs, startDate, targetEndDate } = req.body;

      if (!title || !frameworkSlugs || !Array.isArray(frameworkSlugs) || frameworkSlugs.length === 0) {
        return res.status(400).json({ error: 'Title and at least one framework are required' });
      }

      // Validate framework slugs
      const validSlugs = ASSESSMENT_FRAMEWORKS.map(f => f.slug);
      const invalidSlugs = frameworkSlugs.filter((s: string) => !validSlugs.includes(s));
      if (invalidSlugs.length > 0) {
        return res.status(400).json({ error: `Invalid framework slugs: ${invalidSlugs.join(', ')}` });
      }

      const assessment = await prisma.assessment.create({
        data: {
          organizationId: orgId,
          title,
          description,
          clientName,
          assessorName,
          frameworkSlugs,
          startDate: startDate ? new Date(startDate) : null,
          targetEndDate: targetEndDate ? new Date(targetEndDate) : null,
          createdById: authReq.user.id,
        },
      });

      // Auto-initialize requirements for selected frameworks
      const requirementData: any[] = [];
      let globalSort = 0;

      for (const slug of frameworkSlugs) {
        const fw = getFrameworkBySlug(slug);
        if (!fw) continue;

        for (const domain of fw.domains) {
          for (const req of domain.requirements) {
            requirementData.push({
              assessmentId: assessment.id,
              frameworkSlug: slug,
              domainCode: domain.code,
              domainName: domain.name,
              requirementCode: req.requirementCode,
              title: req.title,
              description: req.description,
              guidance: req.guidance,
              evidenceHint: req.evidenceHint,
              sortOrder: globalSort++,
            });
          }
        }
      }

      if (requirementData.length > 0) {
        await prisma.assessmentRequirement.createMany({ data: requirementData });
      }

      await createAuditLog({
        userId: authReq.user.id,
        organizationId: orgId,
        action: 'CREATE',
        entityType: 'Assessment',
        entityId: assessment.id,
        newValues: { title, frameworkSlugs, requirementCount: requirementData.length },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      res.status(201).json({ data: { ...assessment, requirementCount: requirementData.length } });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// GET /api/assessments/:id - Get assessment detail
// ============================================
router.get('/:id',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const assessment = await prisma.assessment.findUnique({
        where: { id: req.params.id },
        include: {
          _count: { select: { requirements: true, findings: true } },
        },
      });

      if (!assessment) {
        return res.status(404).json({ error: 'Assessment not found' });
      }

      res.json({ data: assessment });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// PATCH /api/assessments/:id - Update assessment
// ============================================
router.patch('/:id',
  authenticate,
  requirePermission('assessments', 'edit'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const { title, description, clientName, assessorName, status, currentPhase, startDate, targetEndDate } = req.body;

      const updateData: any = {};
      if (title !== undefined) updateData.title = title;
      if (description !== undefined) updateData.description = description;
      if (clientName !== undefined) updateData.clientName = clientName;
      if (assessorName !== undefined) updateData.assessorName = assessorName;
      if (status !== undefined) updateData.status = status;
      if (currentPhase !== undefined) updateData.currentPhase = currentPhase;
      if (startDate !== undefined) updateData.startDate = startDate ? new Date(startDate) : null;
      if (targetEndDate !== undefined) updateData.targetEndDate = targetEndDate ? new Date(targetEndDate) : null;

      if (status === 'COMPLETED') {
        updateData.completedDate = new Date();
      }

      const assessment = await prisma.assessment.update({
        where: { id: req.params.id },
        data: updateData,
      });

      await createAuditLog({
        userId: authReq.user.id,
        organizationId: assessment.organizationId,
        action: 'UPDATE',
        entityType: 'Assessment',
        entityId: assessment.id,
        newValues: updateData,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      res.json({ data: assessment });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// DELETE /api/assessments/:id - Delete assessment
// ============================================
router.delete('/:id',
  authenticate,
  requirePermission('assessments', 'edit'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthenticatedRequest;

      const assessment = await prisma.assessment.findUnique({ where: { id: req.params.id } });
      if (!assessment) {
        return res.status(404).json({ error: 'Assessment not found' });
      }

      await prisma.assessment.delete({ where: { id: req.params.id } });

      await createAuditLog({
        userId: authReq.user.id,
        organizationId: assessment.organizationId,
        action: 'DELETE',
        entityType: 'Assessment',
        entityId: assessment.id,
        oldValues: { title: assessment.title },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      res.json({ message: 'Assessment deleted' });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// GET /api/assessments/:id/requirements - List requirements
// ============================================
router.get('/:id/requirements',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { frameworkSlug, domainCode, status } = req.query;

      const where: any = { assessmentId: req.params.id };
      if (frameworkSlug) where.frameworkSlug = frameworkSlug;
      if (domainCode) where.domainCode = domainCode;
      if (status) where.status = status;

      const requirements = await prisma.assessmentRequirement.findMany({
        where,
        orderBy: { sortOrder: 'asc' },
        include: {
          evidence: true,
        },
      });

      res.json({ data: requirements });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// PATCH /api/assessments/:id/requirements/:reqId - Update requirement
// ============================================
router.patch('/:id/requirements/:reqId',
  authenticate,
  requirePermission('assessments', 'edit'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const { status, assessorNotes, findings, riskLevel } = req.body;

      const updateData: any = {};
      if (status !== undefined) updateData.status = status;
      if (assessorNotes !== undefined) updateData.assessorNotes = assessorNotes;
      if (findings !== undefined) updateData.findings = findings;
      if (riskLevel !== undefined) updateData.riskLevel = riskLevel;

      // If setting any assessment-related field, record assessor and time
      if (status || assessorNotes !== undefined || findings !== undefined) {
        updateData.assessedAt = new Date();
        updateData.assessedById = authReq.user.id;
      }

      const requirement = await prisma.assessmentRequirement.update({
        where: { id: req.params.reqId },
        data: updateData,
        include: { evidence: true },
      });

      res.json({ data: requirement });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// POST /api/assessments/:id/requirements/:reqId/evidence - Add evidence
// ============================================
router.post('/:id/requirements/:reqId/evidence',
  authenticate,
  requirePermission('assessments', 'edit'),
  upload.single('file'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const { title, description, evidenceType, link } = req.body;

      // Validate requirement exists
      const requirement = await prisma.assessmentRequirement.findUnique({
        where: { id: req.params.reqId },
      });
      if (!requirement) {
        return res.status(404).json({ error: 'Requirement not found' });
      }

      let fileUploadId: string | null = null;

      // Handle file upload if present
      if (req.file) {
        const assessment = await prisma.assessment.findUnique({ where: { id: req.params.id } });
        if (!assessment) {
          return res.status(404).json({ error: 'Assessment not found' });
        }

        const fileRecord = await uploadFile(req.file, {
          organizationId: assessment.organizationId,
          userId: authReq.user.id,
          category: 'EVIDENCE',
          description: title || req.file.originalname,
        });
        fileUploadId = fileRecord.id;
      }

      const evidence = await prisma.assessmentEvidence.create({
        data: {
          requirementId: req.params.reqId,
          fileUploadId,
          title: title || (req.file ? req.file.originalname : 'Evidence'),
          description,
          evidenceType: evidenceType || (req.file ? 'document' : link ? 'link' : 'note'),
          link,
          collectedById: authReq.user.id,
        },
      });

      res.status(201).json({ data: evidence });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// DELETE /api/assessments/:id/evidence/:evidenceId - Remove evidence
// ============================================
router.delete('/:id/evidence/:evidenceId',
  authenticate,
  requirePermission('assessments', 'edit'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await prisma.assessmentEvidence.delete({ where: { id: req.params.evidenceId } });
      res.json({ message: 'Evidence removed' });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// GET /api/assessments/:id/findings - List findings
// ============================================
router.get('/:id/findings',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { frameworkSlug, severity, status } = req.query;

      const where: any = { assessmentId: req.params.id };
      if (frameworkSlug) where.frameworkSlug = frameworkSlug;
      if (severity) where.severity = severity;
      if (status) where.status = status;

      const findings = await prisma.assessmentFinding.findMany({
        where,
        orderBy: [{ severity: 'asc' }, { createdAt: 'desc' }],
      });

      res.json({ data: findings });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// POST /api/assessments/:id/findings - Create finding
// ============================================
router.post('/:id/findings',
  authenticate,
  requirePermission('assessments', 'edit'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const { title, description, frameworkSlug, requirementId, severity, likelihood, impact, recommendation, remediationPlan, targetDate, ownerId } = req.body;

      if (!title || !description) {
        return res.status(400).json({ error: 'Title and description are required' });
      }

      // Generate finding reference
      const existingCount = await prisma.assessmentFinding.count({
        where: { assessmentId: req.params.id },
      });
      const findingRef = `F-${String(existingCount + 1).padStart(3, '0')}`;

      const riskScore = (likelihood || 3) * (impact || 3);

      const finding = await prisma.assessmentFinding.create({
        data: {
          assessmentId: req.params.id,
          requirementId,
          findingRef,
          title,
          description,
          frameworkSlug,
          severity: severity || 'MEDIUM',
          likelihood: likelihood || 3,
          impact: impact || 3,
          riskScore,
          recommendation,
          remediationPlan,
          targetDate: targetDate ? new Date(targetDate) : null,
          ownerId,
        },
      });

      const assessment = await prisma.assessment.findUnique({ where: { id: req.params.id } });
      await createAuditLog({
        userId: authReq.user.id,
        organizationId: assessment?.organizationId || '',
        action: 'CREATE',
        entityType: 'AssessmentFinding',
        entityId: finding.id,
        newValues: { findingRef, title, severity },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      res.status(201).json({ data: finding });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// PATCH /api/assessments/:id/findings/:findingId - Update finding
// ============================================
router.patch('/:id/findings/:findingId',
  authenticate,
  requirePermission('assessments', 'edit'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { title, description, severity, likelihood, impact, recommendation, remediationPlan, targetDate, ownerId, status } = req.body;

      const updateData: any = {};
      if (title !== undefined) updateData.title = title;
      if (description !== undefined) updateData.description = description;
      if (severity !== undefined) updateData.severity = severity;
      if (likelihood !== undefined) updateData.likelihood = likelihood;
      if (impact !== undefined) updateData.impact = impact;
      if (recommendation !== undefined) updateData.recommendation = recommendation;
      if (remediationPlan !== undefined) updateData.remediationPlan = remediationPlan;
      if (targetDate !== undefined) updateData.targetDate = targetDate ? new Date(targetDate) : null;
      if (ownerId !== undefined) updateData.ownerId = ownerId;
      if (status !== undefined) updateData.status = status;

      // Recalculate risk score if likelihood or impact changed
      if (likelihood !== undefined || impact !== undefined) {
        const existing = await prisma.assessmentFinding.findUnique({ where: { id: req.params.findingId } });
        const l = likelihood ?? existing?.likelihood ?? 3;
        const i = impact ?? existing?.impact ?? 3;
        updateData.riskScore = l * i;
      }

      const finding = await prisma.assessmentFinding.update({
        where: { id: req.params.findingId },
        data: updateData,
      });

      res.json({ data: finding });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// DELETE /api/assessments/:id/findings/:findingId - Delete finding
// ============================================
router.delete('/:id/findings/:findingId',
  authenticate,
  requirePermission('assessments', 'edit'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await prisma.assessmentFinding.delete({ where: { id: req.params.findingId } });
      res.json({ message: 'Finding deleted' });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// GET /api/assessments/:id/progress - Progress statistics
// ============================================
router.get('/:id/progress',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const assessmentId = req.params.id;

      // Get per-framework progress
      const requirements = await prisma.assessmentRequirement.findMany({
        where: { assessmentId },
        select: { frameworkSlug: true, domainCode: true, domainName: true, status: true },
      });

      // Group by framework
      const frameworkMap: Record<string, any> = {};
      for (const r of requirements) {
        if (!frameworkMap[r.frameworkSlug]) {
          const fw = getFrameworkBySlug(r.frameworkSlug);
          frameworkMap[r.frameworkSlug] = {
            slug: r.frameworkSlug,
            name: fw?.name || r.frameworkSlug,
            shortName: fw?.shortName || r.frameworkSlug,
            total: 0,
            assessed: 0,
            compliant: 0,
            partiallyCompliant: 0,
            nonCompliant: 0,
            notApplicable: 0,
            notStarted: 0,
            inProgress: 0,
            domains: {} as Record<string, any>,
          };
        }

        const fw = frameworkMap[r.frameworkSlug];
        fw.total++;
        if (r.status !== 'NOT_STARTED') fw.assessed++;
        if (r.status === 'COMPLIANT') fw.compliant++;
        if (r.status === 'PARTIALLY_COMPLIANT') fw.partiallyCompliant++;
        if (r.status === 'NON_COMPLIANT') fw.nonCompliant++;
        if (r.status === 'NOT_APPLICABLE') fw.notApplicable++;
        if (r.status === 'NOT_STARTED') fw.notStarted++;
        if (r.status === 'IN_PROGRESS') fw.inProgress++;

        // Domain-level grouping
        if (!fw.domains[r.domainCode]) {
          fw.domains[r.domainCode] = {
            code: r.domainCode,
            name: r.domainName,
            total: 0,
            assessed: 0,
          };
        }
        fw.domains[r.domainCode].total++;
        if (r.status !== 'NOT_STARTED') fw.domains[r.domainCode].assessed++;
      }

      // Convert domain maps to arrays and calculate percentages
      const frameworks = Object.values(frameworkMap).map((fw: any) => ({
        ...fw,
        progressPercent: fw.total > 0 ? Math.round((fw.assessed / fw.total) * 100) : 0,
        domains: Object.values(fw.domains),
      }));

      // Overall totals
      const overall = {
        total: requirements.length,
        assessed: requirements.filter(r => r.status !== 'NOT_STARTED').length,
        compliant: requirements.filter(r => r.status === 'COMPLIANT').length,
        partiallyCompliant: requirements.filter(r => r.status === 'PARTIALLY_COMPLIANT').length,
        nonCompliant: requirements.filter(r => r.status === 'NON_COMPLIANT').length,
        notApplicable: requirements.filter(r => r.status === 'NOT_APPLICABLE').length,
        notStarted: requirements.filter(r => r.status === 'NOT_STARTED').length,
        inProgress: requirements.filter(r => r.status === 'IN_PROGRESS').length,
        progressPercent: requirements.length > 0
          ? Math.round((requirements.filter(r => r.status !== 'NOT_STARTED').length / requirements.length) * 100)
          : 0,
      };

      // Findings summary
      const findings = await prisma.assessmentFinding.findMany({
        where: { assessmentId },
        select: { severity: true, status: true },
      });

      const findingsSummary = {
        total: findings.length,
        open: findings.filter(f => f.status === 'OPEN').length,
        inRemediation: findings.filter(f => f.status === 'IN_REMEDIATION').length,
        closed: findings.filter(f => f.status === 'CLOSED' || f.status === 'REMEDIATED').length,
        critical: findings.filter(f => f.severity === 'CRITICAL').length,
        high: findings.filter(f => f.severity === 'HIGH').length,
        medium: findings.filter(f => f.severity === 'MEDIUM').length,
        low: findings.filter(f => f.severity === 'LOW').length,
        informational: findings.filter(f => f.severity === 'INFORMATIONAL').length,
      };

      res.json({ data: { overall, frameworks, findings: findingsSummary } });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// POST /api/assessments/:id/ai-analyze - AI analysis of full assessment
// ============================================
router.post('/:id/ai-analyze',
  authenticate,
  requirePermission('assessments', 'view'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        return res.status(503).json({ error: 'OpenAI API key is not configured. Please set OPENAI_API_KEY.' });
      }

      const assessment = await prisma.assessment.findUnique({
        where: { id: req.params.id },
      });
      if (!assessment) {
        return res.status(404).json({ error: 'Assessment not found' });
      }

      const requirements = await prisma.assessmentRequirement.findMany({
        where: { assessmentId: req.params.id },
        orderBy: { sortOrder: 'asc' },
        include: { evidence: { select: { title: true, evidenceType: true } } },
      });

      const findings = await prisma.assessmentFinding.findMany({
        where: { assessmentId: req.params.id },
        orderBy: [{ severity: 'asc' }, { createdAt: 'desc' }],
      });

      // Build a comprehensive context for the AI
      const total = requirements.length;
      const compliant = requirements.filter(r => r.status === 'COMPLIANT').length;
      const partial = requirements.filter(r => r.status === 'PARTIALLY_COMPLIANT').length;
      const nonComp = requirements.filter(r => r.status === 'NON_COMPLIANT').length;
      const notStarted = requirements.filter(r => r.status === 'NOT_STARTED').length;
      const na = requirements.filter(r => r.status === 'NOT_APPLICABLE').length;

      // Summarize requirements by framework
      const fwSummaries: string[] = [];
      const grouped = new Map<string, typeof requirements>();
      for (const r of requirements) {
        const arr = grouped.get(r.frameworkSlug) || [];
        arr.push(r);
        grouped.set(r.frameworkSlug, arr);
      }

      for (const [slug, reqs] of grouped) {
        const fw = getFrameworkBySlug(slug);
        const fwName = fw?.name || slug;
        const fwCompliant = reqs.filter(r => r.status === 'COMPLIANT').length;
        const fwPartial = reqs.filter(r => r.status === 'PARTIALLY_COMPLIANT').length;
        const fwNonComp = reqs.filter(r => r.status === 'NON_COMPLIANT').length;

        let fwDetail = `\n### ${fwName} (${reqs.length} requirements)\n`;
        fwDetail += `Compliant: ${fwCompliant}, Partially Compliant: ${fwPartial}, Non-Compliant: ${fwNonComp}\n`;

        // Include details only for non-compliant and partially compliant requirements
        const issues = reqs.filter(r => r.status === 'NON_COMPLIANT' || r.status === 'PARTIALLY_COMPLIANT' || (r.assessorNotes && r.assessorNotes.length > 10));
        for (const r of issues) {
          fwDetail += `\n- **${r.requirementCode}: ${r.title}** [Status: ${r.status.replace(/_/g, ' ')}]`;
          if (r.assessorNotes) fwDetail += `\n  Assessor Notes: ${r.assessorNotes.substring(0, 500)}`;
          if (r.findings) fwDetail += `\n  Findings: ${r.findings.substring(0, 300)}`;
          if (r.evidence.length > 0) fwDetail += `\n  Evidence: ${r.evidence.map(e => e.title).join(', ')}`;
        }
        fwSummaries.push(fwDetail);
      }

      // Findings summary
      let findingsContext = '';
      if (findings.length > 0) {
        findingsContext = '\n## Recorded Findings\n';
        for (const f of findings) {
          findingsContext += `- **${f.findingRef}: ${f.title}** [${f.severity}, Risk Score: ${f.riskScore || f.likelihood * f.impact}, Status: ${f.status}]\n`;
          findingsContext += `  ${f.description.substring(0, 300)}\n`;
          if (f.recommendation) findingsContext += `  Recommendation: ${f.recommendation.substring(0, 200)}\n`;
        }
      }

      const contextMessage = `
# Assessment: ${assessment.title}
Client: ${assessment.clientName || 'Not specified'}
Assessor: ${assessment.assessorName || 'Not specified'}
Status: ${assessment.status}
Phase: ${assessment.currentPhase}/4

## Overall Summary
- Total Requirements: ${total}
- Compliant: ${compliant} (${total > 0 ? Math.round((compliant / total) * 100) : 0}%)
- Partially Compliant: ${partial}
- Non-Compliant: ${nonComp}
- Not Started: ${notStarted}
- Not Applicable: ${na}
- Total Findings: ${findings.length} (Critical: ${findings.filter(f => f.severity === 'CRITICAL').length}, High: ${findings.filter(f => f.severity === 'HIGH').length}, Medium: ${findings.filter(f => f.severity === 'MEDIUM').length})

## Framework Details
${fwSummaries.join('\n')}
${findingsContext}
`;

      const openai = new OpenAI({ apiKey });
      const chatModel = process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini';

      const completion = await openai.chat.completions.create({
        model: chatModel,
        messages: [
          {
            role: 'system',
            content: `You are an expert regulatory compliance consultant specializing in FCA regulations (Operational Resilience PS21/3, EMRs/PSRs Safeguarding, REP018/EBA ICT guidelines), ISO 27001:2022, and EU DORA.

You are reviewing a completed (or in-progress) regulatory risk assessment. Provide a detailed but practical analysis. Your analysis should help an assessor who is new to FCA compliance understand their position.

Structure your response with these sections:
1. **Executive Summary** - A 2-3 sentence overview of the assessment status and key risks
2. **Key Strengths** - What areas are well-covered (bullet points)
3. **Critical Gaps & Concerns** - Areas of non-compliance or partial compliance that need urgent attention (prioritized by risk)
4. **Recommendations** - Specific, actionable next steps to improve compliance posture
5. **Observations on Evidence** - Comment on the quality/completeness of evidence collected
6. **Risk Rating** - Overall risk rating (Critical/High/Medium/Low) with brief justification

Be specific and reference requirement codes where relevant. Focus on practical, actionable advice.`,
          },
          {
            role: 'user',
            content: `Please analyze this regulatory assessment and provide your expert review:\n${contextMessage}`,
          },
        ],
        temperature: 0.3,
        max_tokens: 3000,
      });

      const analysis = completion.choices[0]?.message?.content || 'Unable to generate analysis.';

      logger.info(`AI analysis generated for assessment ${req.params.id}`);

      res.json({ data: { analysis, generatedAt: new Date().toISOString() } });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// POST /api/assessments/:id/requirements/:reqId/ai-assist - AI assistance for requirement
// ============================================
router.post('/:id/requirements/:reqId/ai-assist',
  authenticate,
  requirePermission('assessments', 'view'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        return res.status(503).json({ error: 'OpenAI API key is not configured. Please set OPENAI_API_KEY.' });
      }

      const requirement = await prisma.assessmentRequirement.findUnique({
        where: { id: req.params.reqId },
        include: {
          evidence: { select: { title: true, evidenceType: true, description: true } },
        },
      });
      if (!requirement) {
        return res.status(404).json({ error: 'Requirement not found' });
      }

      const fw = getFrameworkBySlug(requirement.frameworkSlug);
      const { question } = req.body; // Optional user question about this requirement

      const contextMessage = `
# Requirement Assessment Context
Framework: ${fw?.name || requirement.frameworkSlug}
Domain: ${requirement.domainCode} - ${requirement.domainName}
Requirement: ${requirement.requirementCode} - ${requirement.title}
Description: ${requirement.description || 'N/A'}
Current Status: ${requirement.status.replace(/_/g, ' ')}
Risk Level: ${requirement.riskLevel || 'Not set'}

## Verification Guidance (from framework)
${requirement.guidance || 'No guidance available'}

## Expected Evidence
${requirement.evidenceHint || 'No evidence hints'}

## Current Assessment
Assessor Notes: ${requirement.assessorNotes || 'None provided'}
Findings: ${requirement.findings || 'None recorded'}
Evidence Collected: ${requirement.evidence.length > 0 ? requirement.evidence.map(e => `${e.title} (${e.evidenceType})`).join(', ') : 'None'}
`;

      const userQuestion = question
        ? `The assessor asks: "${question}"`
        : 'Please provide guidance on how to assess this requirement effectively.';

      const openai = new OpenAI({ apiKey });
      const chatModel = process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini';

      const completion = await openai.chat.completions.create({
        model: chatModel,
        messages: [
          {
            role: 'system',
            content: `You are an expert regulatory compliance consultant helping an assessor evaluate a specific requirement. The assessor is relatively new to FCA compliance and needs practical, specific guidance.

Your response should be structured and helpful:
- If the requirement hasn't been assessed yet, provide step-by-step guidance on how to verify compliance
- If partially/non-compliant, suggest specific remediation steps
- If compliant, confirm what makes it compliant and suggest any improvements
- Always suggest what specific evidence should be collected
- Keep responses concise and actionable (300 words max)
- Reference specific documents, policies, or controls where appropriate`,
          },
          {
            role: 'user',
            content: `${contextMessage}\n\n${userQuestion}`,
          },
        ],
        temperature: 0.3,
        max_tokens: 1000,
      });

      const response = completion.choices[0]?.message?.content || 'Unable to generate assistance.';

      res.json({ data: { response, requirementId: req.params.reqId, generatedAt: new Date().toISOString() } });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// GET /api/assessments/:id/report - Generate PDF report
// ============================================
router.get('/:id/report',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { PDFDocument, rgb, StandardFonts } = await import('pdf-lib');

      const assessment = await prisma.assessment.findUnique({
        where: { id: req.params.id },
      });
      if (!assessment) {
        return res.status(404).json({ error: 'Assessment not found' });
      }

      const requirements = await prisma.assessmentRequirement.findMany({
        where: { assessmentId: req.params.id },
        orderBy: { sortOrder: 'asc' },
      });

      const findings = await prisma.assessmentFinding.findMany({
        where: { assessmentId: req.params.id },
        orderBy: [{ severity: 'asc' }, { createdAt: 'asc' }],
      });

      // Create PDF
      const pdfDoc = await PDFDocument.create();
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      const pageWidth = 842; // A4 landscape
      const pageHeight = 595;
      const margin = 50;

      // Helper: wrap text to fit within maxWidth, return array of lines
      const wrapText = (text: string, maxWidth: number, fontSize: number, usedFont: any): string[] => {
        if (!text) return [''];
        const words = text.replace(/\n/g, ' ').split(' ');
        const lines: string[] = [];
        let currentLine = '';
        for (const word of words) {
          const testLine = currentLine ? `${currentLine} ${word}` : word;
          const testWidth = usedFont.widthOfTextAtSize(testLine, fontSize);
          if (testWidth > maxWidth && currentLine) {
            lines.push(currentLine);
            currentLine = word;
          } else {
            currentLine = testLine;
          }
        }
        if (currentLine) lines.push(currentLine);
        return lines.length > 0 ? lines : [''];
      };

      // Helper: draw wrapped text and return the total height used
      const drawWrappedText = (
        pg: any, text: string, x: number, yPos: number,
        maxWidth: number, fontSize: number, usedFont: any, color?: any
      ): number => {
        const lines = wrapText(text, maxWidth, fontSize, usedFont);
        const lineHeight = fontSize + 3;
        for (let idx = 0; idx < lines.length; idx++) {
          pg.drawText(lines[idx], { x, y: yPos - (idx * lineHeight), font: usedFont, size: fontSize, ...(color ? { color } : {}) });
        }
        return lines.length * lineHeight;
      };

      // --- COVER PAGE ---
      let page = pdfDoc.addPage([pageWidth, pageHeight]);
      let y = pageHeight - 120;

      page.drawText('Regulatory Risk Assessment Report', { x: margin, y, font: fontBold, size: 24, color: rgb(0.1, 0.1, 0.4) });
      y -= 40;
      page.drawText(assessment.title, { x: margin, y, font: fontBold, size: 18, color: rgb(0.2, 0.2, 0.2) });
      y -= 50;

      const meta = [
        ['Client:', assessment.clientName || 'N/A'],
        ['Assessor:', assessment.assessorName || 'N/A'],
        ['Status:', assessment.status],
        ['Start Date:', assessment.startDate ? new Date(assessment.startDate).toLocaleDateString() : 'N/A'],
        ['Generated:', new Date().toLocaleDateString()],
      ];
      for (const [label, value] of meta) {
        page.drawText(label, { x: margin, y, font: fontBold, size: 11, color: rgb(0.3, 0.3, 0.3) });
        page.drawText(value, { x: margin + 100, y, font, size: 11, color: rgb(0.1, 0.1, 0.1) });
        y -= 20;
      }

      // Frameworks included
      y -= 20;
      page.drawText('Frameworks in Scope:', { x: margin, y, font: fontBold, size: 12, color: rgb(0.1, 0.1, 0.4) });
      y -= 20;
      const slugs = (assessment.frameworkSlugs as string[]) || [];
      for (const slug of slugs) {
        const fw = getFrameworkBySlug(slug);
        if (fw) {
          page.drawText(`  - ${fw.name}`, { x: margin + 10, y, font, size: 10 });
          y -= 16;
        }
      }

      // --- EXECUTIVE SUMMARY ---
      y -= 30;
      page.drawText('Executive Summary', { x: margin, y, font: fontBold, size: 14, color: rgb(0.1, 0.1, 0.4) });
      y -= 25;

      const total = requirements.length;
      const compliant = requirements.filter(r => r.status === 'COMPLIANT').length;
      const partial = requirements.filter(r => r.status === 'PARTIALLY_COMPLIANT').length;
      const nonComp = requirements.filter(r => r.status === 'NON_COMPLIANT').length;
      const na = requirements.filter(r => r.status === 'NOT_APPLICABLE').length;

      const summaryLines = [
        `Total Requirements Assessed: ${total}`,
        `Compliant: ${compliant} | Partially Compliant: ${partial} | Non-Compliant: ${nonComp} | Not Applicable: ${na}`,
        `Total Findings: ${findings.length} (Critical: ${findings.filter(f => f.severity === 'CRITICAL').length}, High: ${findings.filter(f => f.severity === 'HIGH').length}, Medium: ${findings.filter(f => f.severity === 'MEDIUM').length}, Low: ${findings.filter(f => f.severity === 'LOW').length})`,
      ];
      for (const line of summaryLines) {
        page.drawText(line, { x: margin, y, font, size: 10 });
        y -= 16;
      }

      // --- FINDINGS TABLE ---
      if (findings.length > 0) {
        page = pdfDoc.addPage([pageWidth, pageHeight]);
        y = pageHeight - margin;

        page.drawText('Findings Register', { x: margin, y, font: fontBold, size: 14, color: rgb(0.1, 0.1, 0.4) });
        y -= 25;

        // Table header
        const cols = [margin, margin + 60, margin + 250, margin + 350, margin + 420, margin + 490, margin + 560];
        const headers = ['Ref', 'Title', 'Severity', 'Likelihood', 'Impact', 'Score', 'Status'];
        for (let i = 0; i < headers.length; i++) {
          page.drawText(headers[i], { x: cols[i], y, font: fontBold, size: 9, color: rgb(0.3, 0.3, 0.3) });
        }
        y -= 5;
        page.drawLine({ start: { x: margin, y }, end: { x: pageWidth - margin, y }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7) });
        y -= 15;

        for (const f of findings) {
          // Calculate row height based on wrapped title
          const titleLines = wrapText(f.title, cols[2] - cols[1] - 10, 9, font);
          const rowHeight = Math.max(16, titleLines.length * 12);
          if (y < margin + rowHeight + 10) {
            page = pdfDoc.addPage([pageWidth, pageHeight]);
            y = pageHeight - margin;
          }
          page.drawText(f.findingRef, { x: cols[0], y, font, size: 9 });
          drawWrappedText(page, f.title, cols[1], y, cols[2] - cols[1] - 10, 9, font);
          page.drawText(f.severity, { x: cols[2], y, font, size: 9 });
          page.drawText(String(f.likelihood), { x: cols[3], y, font, size: 9 });
          page.drawText(String(f.impact), { x: cols[4], y, font, size: 9 });
          page.drawText(String(f.riskScore || f.likelihood * f.impact), { x: cols[5], y, font, size: 9 });
          page.drawText(f.status, { x: cols[6], y, font, size: 9 });
          y -= rowHeight;
        }
      }

      // --- REQUIREMENTS BY FRAMEWORK ---
      const grouped = new Map<string, typeof requirements>();
      for (const r of requirements) {
        const arr = grouped.get(r.frameworkSlug) || [];
        arr.push(r);
        grouped.set(r.frameworkSlug, arr);
      }

      for (const [slug, reqs] of grouped) {
        const fw = getFrameworkBySlug(slug);
        page = pdfDoc.addPage([pageWidth, pageHeight]);
        y = pageHeight - margin;

        page.drawText(fw?.name || slug, { x: margin, y, font: fontBold, size: 14, color: rgb(0.1, 0.1, 0.4) });
        y -= 25;

        const rCols = [margin, margin + 60, margin + 280, margin + 420, margin + 510];
        const rHeaders = ['Code', 'Requirement', 'Status', 'Risk Level', 'Notes'];
        for (let i = 0; i < rHeaders.length; i++) {
          page.drawText(rHeaders[i], { x: rCols[i], y, font: fontBold, size: 9, color: rgb(0.3, 0.3, 0.3) });
        }
        y -= 5;
        page.drawLine({ start: { x: margin, y }, end: { x: pageWidth - margin, y }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7) });
        y -= 15;

        for (const r of reqs) {
          // Calculate row height based on wrapped text
          const titleMaxW = rCols[2] - rCols[1] - 10;
          const notesMaxW = pageWidth - margin - rCols[4] - 10;
          const titleLines = wrapText(r.title, titleMaxW, 9, font);
          const notesText = r.assessorNotes || '';
          const notesLines = notesText ? wrapText(notesText.substring(0, 120) + (notesText.length > 120 ? '...' : ''), notesMaxW, 8, font) : [''];
          const rowHeight = Math.max(16, Math.max(titleLines.length, notesLines.length) * 12);
          if (y < margin + rowHeight + 10) {
            page = pdfDoc.addPage([pageWidth, pageHeight]);
            y = pageHeight - margin;
          }
          page.drawText(r.requirementCode, { x: rCols[0], y, font, size: 9 });
          drawWrappedText(page, r.title, rCols[1], y, titleMaxW, 9, font);
          page.drawText(r.status.replace(/_/g, ' '), { x: rCols[2], y, font, size: 9 });
          page.drawText(r.riskLevel || '-', { x: rCols[3], y, font, size: 9 });
          if (notesText) {
            drawWrappedText(page, notesText.substring(0, 120) + (notesText.length > 120 ? '...' : ''), rCols[4], y, notesMaxW, 8, font);
          }
          y -= rowHeight;
        }
      }

      const pdfBytes = await pdfDoc.save();
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="assessment-report-${assessment.id.substring(0, 8)}.pdf"`);
      res.send(Buffer.from(pdfBytes));
    } catch (error) {
      next(error);
    }
  }
);

export default router;
