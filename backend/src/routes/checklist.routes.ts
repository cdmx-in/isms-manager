import { Router } from 'express';
import { prisma } from '../index.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { authenticate, requirePermission, AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

// ============================================
// CHECKLIST TEMPLATES BY FRAMEWORK
// ============================================

const ISO_27001_CHECKLIST_ITEMS = [
  {
    title: 'Review control requirements and applicability',
    description: 'Thoroughly review the ISO 27001 control requirements and determine applicability to your organization.',
    sortOrder: 1,
  },
  {
    title: 'Identify current implementation gaps',
    description: 'Perform a gap analysis to identify areas where current practices fall short of the control requirements.',
    sortOrder: 2,
  },
  {
    title: 'Draft implementation plan and assign responsibilities',
    description: 'Create a detailed implementation plan with clear timelines, milestones, and responsible parties.',
    sortOrder: 3,
  },
  {
    title: 'Implement technical/organizational measures',
    description: 'Execute the planned technical and organizational measures to satisfy the control requirements.',
    sortOrder: 4,
  },
  {
    title: 'Document implementation evidence',
    description: 'Collect and organize documentation that demonstrates the control has been implemented effectively.',
    sortOrder: 5,
  },
  {
    title: 'Test and validate control effectiveness',
    description: 'Conduct testing to verify that the implemented control is operating as intended and meeting its objectives.',
    sortOrder: 6,
  },
  {
    title: 'Obtain management approval',
    description: 'Present implementation evidence and test results to management for formal approval.',
    sortOrder: 7,
  },
  {
    title: 'Schedule periodic review',
    description: 'Establish a schedule for periodic review to ensure ongoing control effectiveness and compliance.',
    sortOrder: 8,
  },
];

const ISO_42001_CHECKLIST_ITEMS = [
  {
    title: 'Review AI management system requirements',
    description: 'Review the ISO 42001 AI management system requirements and their applicability to your AI systems.',
    sortOrder: 1,
  },
  {
    title: 'Assess current AI governance maturity',
    description: 'Evaluate the current state of AI governance within your organization against the standard requirements.',
    sortOrder: 2,
  },
  {
    title: 'Define AI-specific policies and procedures',
    description: 'Develop or update policies and procedures that address AI-specific governance, ethics, and risk management.',
    sortOrder: 3,
  },
  {
    title: 'Implement AI risk controls and safeguards',
    description: 'Put in place technical and organizational controls to manage AI-related risks and ensure responsible AI use.',
    sortOrder: 4,
  },
  {
    title: 'Document AI system inventory and data flows',
    description: 'Create and maintain a comprehensive inventory of AI systems, including data flows and dependencies.',
    sortOrder: 5,
  },
  {
    title: 'Validate AI system compliance',
    description: 'Verify that AI systems comply with the defined policies, procedures, and regulatory requirements.',
    sortOrder: 6,
  },
  {
    title: 'Establish monitoring and reporting mechanisms',
    description: 'Set up ongoing monitoring and reporting processes to track AI system performance and compliance.',
    sortOrder: 7,
  },
  {
    title: 'Schedule periodic AI governance review',
    description: 'Plan regular reviews of AI governance practices to ensure continued alignment with the standard.',
    sortOrder: 8,
  },
];

const DPDPA_CHECKLIST_ITEMS = [
  {
    title: 'Review DPDPA regulatory requirements',
    description: 'Study the Digital Personal Data Protection Act requirements applicable to your data processing activities.',
    sortOrder: 1,
  },
  {
    title: 'Map personal data processing activities',
    description: 'Identify and document all personal data processing activities, including data flows and storage locations.',
    sortOrder: 2,
  },
  {
    title: 'Implement consent management mechanisms',
    description: 'Establish systems and processes for obtaining, recording, and managing data subject consent.',
    sortOrder: 3,
  },
  {
    title: 'Establish data subject rights procedures',
    description: 'Create procedures to handle data subject rights requests including access, correction, and erasure.',
    sortOrder: 4,
  },
  {
    title: 'Document data protection measures',
    description: 'Document all technical and organizational measures implemented to protect personal data.',
    sortOrder: 5,
  },
  {
    title: 'Conduct data protection impact assessment',
    description: 'Perform a DPIA to assess and mitigate risks associated with personal data processing.',
    sortOrder: 6,
  },
  {
    title: 'Train relevant personnel on compliance',
    description: 'Provide training to staff involved in data processing on DPDPA requirements and compliance procedures.',
    sortOrder: 7,
  },
  {
    title: 'Schedule periodic compliance review',
    description: 'Set up a schedule for regular compliance reviews to ensure ongoing adherence to DPDPA requirements.',
    sortOrder: 8,
  },
];

const FRAMEWORK_CHECKLIST_MAP: { [key: string]: typeof ISO_27001_CHECKLIST_ITEMS } = {
  iso27001: ISO_27001_CHECKLIST_ITEMS,
  iso42001: ISO_42001_CHECKLIST_ITEMS,
  dpdpa: DPDPA_CHECKLIST_ITEMS,
};

// ============================================
// ROUTES
// ============================================

// Get checklist items for a control (filtered by organizationId query param)
router.get(
  '/controls/:id/checklist',
  authenticate,
  requirePermission('frameworks', 'view'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { organizationId } = req.query;

    if (!organizationId) {
      throw new AppError('Organization ID is required', 400);
    }

    // Verify the control exists
    const control = await prisma.control.findUnique({
      where: { id },
      select: { id: true, organizationId: true, controlId: true, name: true },
    });

    if (!control) {
      throw new AppError('Control not found', 404);
    }

    const checklistItems = await prisma.checklistItem.findMany({
      where: {
        controlId: id,
        organizationId: organizationId as string,
      },
      orderBy: { sortOrder: 'asc' },
    });

    const completedCount = checklistItems.filter((item) => item.isCompleted).length;
    const totalCount = checklistItems.length;
    const progressPercent =
      totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

    res.json({
      success: true,
      data: checklistItems,
      summary: {
        total: totalCount,
        completed: completedCount,
        remaining: totalCount - completedCount,
        progressPercent,
      },
    });
  })
);

// Create default checklist items for a control based on its framework
router.post(
  '/controls/:id/checklist/initialize',
  authenticate,
  requirePermission('frameworks', 'edit'),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const { id } = req.params;
    const { organizationId } = req.body;

    if (!organizationId) {
      throw new AppError('Organization ID is required', 400);
    }

    // Verify the control exists and get its framework
    const control = await prisma.control.findUnique({
      where: { id },
      include: {
        framework: {
          select: { id: true, slug: true, name: true },
        },
      },
    });

    if (!control) {
      throw new AppError('Control not found', 404);
    }

    if (control.organizationId !== organizationId) {
      throw new AppError('Control does not belong to this organization', 403);
    }

    // Check if checklist items already exist
    const existingItems = await prisma.checklistItem.count({
      where: {
        controlId: id,
        organizationId: organizationId as string,
      },
    });

    if (existingItems > 0) {
      throw new AppError('Checklist items already exist for this control. Delete existing items before re-initializing.', 409);
    }

    // Determine which template to use based on framework slug
    const frameworkSlug = control.framework?.slug || '';
    const templateItems = FRAMEWORK_CHECKLIST_MAP[frameworkSlug] || ISO_27001_CHECKLIST_ITEMS;

    // Create checklist items
    const checklistData = templateItems.map((item) => ({
      controlId: id,
      organizationId: organizationId as string,
      title: item.title,
      description: item.description,
      sortOrder: item.sortOrder,
      isCompleted: false,
    }));

    await prisma.checklistItem.createMany({ data: checklistData });

    // Fetch the created items
    const createdItems = await prisma.checklistItem.findMany({
      where: {
        controlId: id,
        organizationId: organizationId as string,
      },
      orderBy: { sortOrder: 'asc' },
    });

    res.status(201).json({
      success: true,
      data: createdItems,
      message: `${createdItems.length} checklist items created based on ${control.framework?.name || 'default'} template`,
    });
  })
);

// Update a checklist item (toggle isCompleted, add notes, evidenceRef)
router.patch(
  '/:itemId',
  authenticate,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const { itemId } = req.params;

    const existingItem = await prisma.checklistItem.findUnique({
      where: { id: itemId },
    });

    if (!existingItem) {
      throw new AppError('Checklist item not found', 404);
    }

    // Check membership
    const membership = authReq.user.organizationMemberships.find(
      (m) => m.organizationId === existingItem.organizationId
    );
    if (!membership && authReq.user.role !== 'ADMIN') {
      throw new AppError('You are not a member of this organization', 403);
    }

    if (membership?.role === 'VIEWER') {
      throw new AppError('Viewers cannot update checklist items', 403);
    }

    const { isCompleted, notes, evidenceRef } = req.body;

    const updateData: any = {};
    if (isCompleted !== undefined) {
      updateData.isCompleted = isCompleted;
      updateData.completedAt = isCompleted ? new Date() : null;
      updateData.completedById = isCompleted ? authReq.user.id : null;
    }
    if (notes !== undefined) updateData.notes = notes;
    if (evidenceRef !== undefined) updateData.evidenceRef = evidenceRef;

    const updatedItem = await prisma.checklistItem.update({
      where: { id: itemId },
      data: updateData,
    });

    res.json({
      success: true,
      data: updatedItem,
    });
  })
);

// Get aggregate checklist completion percentage for a framework (requires organizationId)
router.get(
  '/frameworks/:slug/checklist-progress',
  authenticate,
  requirePermission('frameworks', 'view'),
  asyncHandler(async (req, res) => {
    const { slug } = req.params;
    const { organizationId } = req.query;

    if (!organizationId) {
      throw new AppError('Organization ID is required', 400);
    }

    const framework = await prisma.complianceFramework.findUnique({
      where: { slug },
    });

    if (!framework) {
      throw new AppError('Framework not found', 404);
    }

    // Get all controls for this framework and organization
    const controls = await prisma.control.findMany({
      where: {
        organizationId: organizationId as string,
        frameworkId: framework.id,
      },
      select: {
        id: true,
        controlId: true,
        name: true,
        category: true,
      },
    });

    const controlIds = controls.map((c) => c.id);

    // Get all checklist items for these controls
    const checklistItems = await prisma.checklistItem.findMany({
      where: {
        controlId: { in: controlIds },
        organizationId: organizationId as string,
      },
      select: {
        id: true,
        controlId: true,
        isCompleted: true,
      },
    });

    const totalItems = checklistItems.length;
    const completedItems = checklistItems.filter((item) => item.isCompleted).length;
    const overallProgress =
      totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

    // Per-control breakdown
    const controlProgressMap: {
      [controlId: string]: { total: number; completed: number };
    } = {};

    checklistItems.forEach((item) => {
      if (!controlProgressMap[item.controlId]) {
        controlProgressMap[item.controlId] = { total: 0, completed: 0 };
      }
      controlProgressMap[item.controlId].total++;
      if (item.isCompleted) {
        controlProgressMap[item.controlId].completed++;
      }
    });

    const controlProgress = controls.map((control) => {
      const progress = controlProgressMap[control.id] || { total: 0, completed: 0 };
      return {
        controlId: control.controlId,
        controlName: control.name,
        category: control.category,
        totalItems: progress.total,
        completedItems: progress.completed,
        progressPercent:
          progress.total > 0
            ? Math.round((progress.completed / progress.total) * 100)
            : 0,
      };
    });

    res.json({
      success: true,
      data: {
        framework: {
          id: framework.id,
          slug: framework.slug,
          name: framework.name,
          shortName: framework.shortName,
        },
        summary: {
          totalControls: controls.length,
          controlsWithChecklist: Object.keys(controlProgressMap).length,
          totalItems,
          completedItems,
          overallProgress,
        },
        controls: controlProgress,
      },
    });
  })
);

export default router;
