import { Router } from 'express';
import { prisma } from '../index.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { authenticate, AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

// List all active frameworks
// No auth required for the list, but include org-specific progress if organizationId query param provided
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { organizationId } = req.query;

    const frameworks = await prisma.complianceFramework.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });

    // Always compute per-framework control counts (and progress if organizationId given)
    const frameworksWithCounts = await Promise.all(
      frameworks.map(async (framework) => {
        const whereClause: any = { frameworkId: framework.id };
        if (organizationId) {
          whereClause.organizationId = organizationId as string;
        }

        const controls = await prisma.control.findMany({
          where: whereClause,
          select: {
            implementationStatus: true,
            implementationPercent: true,
          },
        });

        const total = controls.length;
        const fullyImplemented = controls.filter(
          (c) => c.implementationStatus === 'FULLY_IMPLEMENTED'
        ).length;
        const partiallyImplemented = controls.filter(
          (c) => c.implementationStatus === 'PARTIALLY_IMPLEMENTED'
        ).length;
        const notImplemented = controls.filter(
          (c) => c.implementationStatus === 'NOT_IMPLEMENTED'
        ).length;
        const notApplicable = controls.filter(
          (c) => c.implementationStatus === 'NOT_APPLICABLE'
        ).length;

        const applicableTotal = total - notApplicable;
        const progressPercent =
          applicableTotal > 0
            ? Math.round(
                ((fullyImplemented + partiallyImplemented * 0.5) / applicableTotal) * 100
              )
            : 0;

        return {
          ...framework,
          controlCount: total,
          progress: {
            total,
            fullyImplemented,
            partiallyImplemented,
            notImplemented,
            notApplicable,
            progressPercent,
          },
        };
      })
    );

    res.json({
      success: true,
      data: frameworksWithCounts,
    });
  })
);

// Get framework details by slug, including control count and category breakdown
router.get(
  '/:slug',
  asyncHandler(async (req, res) => {
    const { slug } = req.params;

    const framework = await prisma.complianceFramework.findUnique({
      where: { slug },
    });

    if (!framework) {
      throw new AppError('Framework not found', 404);
    }

    // Get total control count across all organizations for this framework
    const controlCount = await prisma.control.count({
      where: { frameworkId: framework.id },
    });

    // Get category breakdown
    const categoryBreakdown = await prisma.control.groupBy({
      by: ['category'],
      where: { frameworkId: framework.id },
      _count: true,
    });

    res.json({
      success: true,
      data: {
        ...framework,
        controlCount,
        categories: categoryBreakdown.map((cat) => ({
          category: cat.category,
          controlCount: cat._count,
        })),
      },
    });
  })
);

// Get implementation progress for a framework within an organization
// Requires organizationId query param
router.get(
  '/:slug/progress',
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
        category: true,
        implementationStatus: true,
        implementationPercent: true,
      },
    });

    // Group by category
    const categoryMap: {
      [key: string]: {
        total: number;
        fullyImplemented: number;
        partiallyImplemented: number;
        notImplemented: number;
        notApplicable: number;
        avgImplementationPercent: number;
        totalImplementationPercent: number;
      };
    } = {};

    controls.forEach((control) => {
      if (!categoryMap[control.category]) {
        categoryMap[control.category] = {
          total: 0,
          fullyImplemented: 0,
          partiallyImplemented: 0,
          notImplemented: 0,
          notApplicable: 0,
          avgImplementationPercent: 0,
          totalImplementationPercent: 0,
        };
      }

      const cat = categoryMap[control.category];
      cat.total++;
      cat.totalImplementationPercent += control.implementationPercent;

      switch (control.implementationStatus) {
        case 'FULLY_IMPLEMENTED':
          cat.fullyImplemented++;
          break;
        case 'PARTIALLY_IMPLEMENTED':
          cat.partiallyImplemented++;
          break;
        case 'NOT_IMPLEMENTED':
          cat.notImplemented++;
          break;
        case 'NOT_APPLICABLE':
          cat.notApplicable++;
          break;
      }
    });

    // Calculate averages
    const categories = Object.entries(categoryMap).map(([category, stats]) => ({
      category,
      total: stats.total,
      fullyImplemented: stats.fullyImplemented,
      partiallyImplemented: stats.partiallyImplemented,
      notImplemented: stats.notImplemented,
      notApplicable: stats.notApplicable,
      avgImplementationPercent:
        stats.total > 0
          ? Math.round(stats.totalImplementationPercent / stats.total)
          : 0,
    }));

    // Overall summary
    const totalControls = controls.length;
    const totalFullyImplemented = controls.filter(
      (c) => c.implementationStatus === 'FULLY_IMPLEMENTED'
    ).length;
    const totalPartiallyImplemented = controls.filter(
      (c) => c.implementationStatus === 'PARTIALLY_IMPLEMENTED'
    ).length;
    const totalNotApplicable = controls.filter(
      (c) => c.implementationStatus === 'NOT_APPLICABLE'
    ).length;
    const applicableTotal = totalControls - totalNotApplicable;
    const overallProgress =
      applicableTotal > 0
        ? Math.round(
            ((totalFullyImplemented + totalPartiallyImplemented * 0.5) / applicableTotal) *
              100
          )
        : 0;

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
          totalControls,
          fullyImplemented: totalFullyImplemented,
          partiallyImplemented: totalPartiallyImplemented,
          notImplemented: controls.filter(
            (c) => c.implementationStatus === 'NOT_IMPLEMENTED'
          ).length,
          notApplicable: totalNotApplicable,
          overallProgress,
        },
        categories,
      },
    });
  })
);

export default router;
