import { Router } from 'express';
import { prisma } from '../index.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { authenticate, requirePermission } from '../middleware/auth.js';

const router = Router();

// Get dashboard overview
router.get(
  '/',
  authenticate,
  requirePermission('dashboard', 'view'),
  asyncHandler(async (req, res) => {
    const { organizationId } = req.query;

    if (!organizationId) {
      throw new AppError('Organization ID is required', 400);
    }

    const orgId = organizationId as string;

    // Fetch all stats in parallel
    const [
      assetStats,
      riskStats,
      controlStats,
      documentStats,
      incidentStats,
      recentActivity,
      upcomingTasks,
    ] = await Promise.all([
      // Asset statistics
      prisma.asset.groupBy({
        by: ['isActive'],
        where: { organizationId: orgId },
        _count: true,
      }),

      // Risk statistics
      Promise.all([
        prisma.risk.count({ where: { organizationId: orgId } }),
        prisma.risk.count({ where: { organizationId: orgId, status: 'IDENTIFIED' } }),
        prisma.risk.findMany({
          where: { organizationId: orgId, status: { notIn: ['CLOSED'] } },
          select: { inherentRisk: true },
        }),
      ]),

      // Control implementation statistics
      prisma.control.groupBy({
        by: ['implementationStatus'],
        where: { organizationId: orgId },
        _count: true,
      }),

      // Document statistics (from Google Drive sync)
      Promise.all([
        prisma.driveDocument.count({ where: { organizationId: orgId } }),
        prisma.driveDocument.count({ where: { organizationId: orgId, isIndexed: true } }),
      ]),

      // Incident statistics (last 30 days)
      Promise.all([
        prisma.incident.count({ where: { organizationId: orgId } }),
        prisma.incident.count({ where: { organizationId: orgId, status: { notIn: ['CLOSED'] } } }),
        prisma.incident.groupBy({
          by: ['severity'],
          where: { organizationId: orgId },
          _count: true,
        }),
      ]),

      // Recent activity
      prisma.auditLog.findMany({
        where: { organizationId: orgId },
        include: {
          user: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),

      // Upcoming tasks (risks and controls with due dates)
      Promise.all([
        prisma.risk.findMany({
          where: {
            organizationId: orgId,
            treatmentDueDate: { not: null, gte: new Date() },
            status: { notIn: ['CLOSED'] },
          },
          select: {
            id: true,
            riskId: true,
            title: true,
            treatmentDueDate: true,
            treatment: true,
          },
          orderBy: { treatmentDueDate: 'asc' },
          take: 5,
        }),
        prisma.control.findMany({
          where: {
            organizationId: orgId,
            dueDate: { not: null, gte: new Date() },
            implementationStatus: { not: 'FULLY_IMPLEMENTED' },
          },
          select: {
            id: true,
            controlId: true,
            name: true,
            dueDate: true,
            implementationStatus: true,
          },
          orderBy: { dueDate: 'asc' },
          take: 5,
        }),
        prisma.driveDocument.findMany({
          where: {
            organizationId: orgId,
            isIndexed: false,
            syncStatus: { not: 'ERROR' },
          },
          select: {
            id: true,
            name: true,
            driveModifiedAt: true,
          },
          orderBy: { driveModifiedAt: 'desc' },
          take: 5,
        }),
      ]),
    ]);

    // Calculate compliance score
    const controlStatusMap = controlStats.reduce((acc: any, s) => ({
      ...acc,
      [s.implementationStatus]: s._count,
    }), {});
    
    const totalControls = Object.values(controlStatusMap).reduce((sum: number, count: any) => sum + count, 0) as number;
    const fullyImplemented = controlStatusMap['FULLY_IMPLEMENTED'] || 0;
    const partiallyImplemented = controlStatusMap['PARTIALLY_IMPLEMENTED'] || 0;
    const complianceScore = totalControls > 0
      ? Math.round(((fullyImplemented + partiallyImplemented * 0.5) / totalControls) * 100)
      : 0;

    // Risk score calculation
    const riskScores = riskStats[2].map((r: any) => r.inherentRisk || 0);
    const avgRiskScore = riskScores.length > 0
      ? Math.round(riskScores.reduce((a: number, b: number) => a + b, 0) / riskScores.length)
      : 0;

    const criticalRisks = riskScores.filter((s: number) => Number(s) >= 20).length;
    const highRisks = riskScores.filter((s: number) => Number(s) >= 12 && Number(s) < 20).length;

    res.json({
      success: true,
      data: {
        summary: {
          complianceScore,
          avgRiskScore,
          criticalRisks,
          highRisks,
          openIncidents: incidentStats[1],
        },
        assets: {
          total: assetStats.reduce((sum, s) => sum + s._count, 0),
          active: assetStats.find(s => s.isActive === true)?._count || 0,
          inactive: assetStats.find(s => s.isActive === false)?._count || 0,
        },
        risks: {
          total: riskStats[0],
          open: riskStats[1],
        },
        controls: {
          total: totalControls,
          byStatus: controlStatusMap,
        },
        documents: {
          total: documentStats[0],
          indexed: documentStats[1],
        },
        incidents: {
          total: incidentStats[0],
          open: incidentStats[1],
          bySeverity: incidentStats[2].reduce((acc: any, s) => ({ ...acc, [s.severity]: s._count }), {}),
        },
        recentActivity: recentActivity.map(log => ({
          id: log.id,
          action: log.action,
          entityType: log.entityType,
          entityId: log.entityId,
          user: log.user,
          timestamp: log.createdAt,
        })),
        upcomingTasks: {
          risks: upcomingTasks[0],
          controls: upcomingTasks[1],
          pendingDocuments: upcomingTasks[2],
        },
      },
    });
  })
);

// Get compliance trend data
router.get(
  '/compliance-trend',
  authenticate,
  requirePermission('dashboard', 'view'),
  asyncHandler(async (req, res) => {
    const { organizationId, days = 30 } = req.query;

    if (!organizationId) {
      throw new AppError('Organization ID is required', 400);
    }

    // Get control implementation changes over time from audit logs
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - Number(days));

    const controlUpdates = await prisma.auditLog.findMany({
      where: {
        organizationId: organizationId as string,
        entityType: 'Control',
        action: 'UPDATE',
        createdAt: { gte: startDate },
      },
      select: {
        createdAt: true,
        newValues: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    // Group by date
    const dailyData: { [key: string]: { implemented: number; updated: number } } = {};
    
    controlUpdates.forEach(log => {
      const dateKey = log.createdAt.toISOString().split('T')[0];
      if (!dailyData[dateKey]) {
        dailyData[dateKey] = { implemented: 0, updated: 0 };
      }
      dailyData[dateKey].updated++;
      
      const newValues = log.newValues as any;
      if (newValues?.implementationStatus === 'FULLY_IMPLEMENTED') {
        dailyData[dateKey].implemented++;
      }
    });

    res.json({
      success: true,
      data: {
        period: { days: Number(days), startDate, endDate: new Date() },
        dailyData: Object.entries(dailyData).map(([date, stats]) => ({
          date,
          ...stats,
        })),
      },
    });
  })
);

// Get compliance overview (SoA status by control category)
router.get(
  '/compliance-overview',
  authenticate,
  requirePermission('dashboard', 'view'),
  asyncHandler(async (req, res) => {
    const { organizationId } = req.query;

    if (!organizationId) {
      throw new AppError('Organization ID is required', 400);
    }

    // Get all active frameworks
    const frameworks = await prisma.complianceFramework.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });

    // Get SoA entries with their control and framework info
    const soaEntries = await prisma.soAEntry.findMany({
      where: { organizationId: organizationId as string },
      include: {
        control: {
          include: {
            framework: {
              select: { id: true, slug: true, name: true, shortName: true },
            },
          },
        },
      },
    });

    // Group results by framework, then by category within each framework
    const frameworkResults = frameworks.map(framework => {
      const frameworkEntries = soaEntries.filter(
        entry => entry.control.frameworkId === framework.id
      );

      // Build dynamic categories from actual data
      const categoryMap: { [key: string]: { total: number; applicable: number; implemented: number } } = {};

      frameworkEntries.forEach(entry => {
        const controlId = entry.control.controlId;
        const category = controlId.split('.').slice(0, 2).join('.');

        if (!categoryMap[category]) {
          categoryMap[category] = { total: 0, applicable: 0, implemented: 0 };
        }

        categoryMap[category].total++;
        if (entry.isApplicable) {
          categoryMap[category].applicable++;
          if (entry.control.implementationStatus === 'FULLY_IMPLEMENTED') {
            categoryMap[category].implemented++;
          }
        }
      });

      const categories = Object.entries(categoryMap).map(([key, value]) => ({
        category: key,
        total: value.total,
        applicable: value.applicable,
        implemented: value.implemented,
        percentage: value.applicable > 0 ? Math.round((value.implemented / value.applicable) * 100) : 0,
      }));

      const totalApplicable = frameworkEntries.filter(e => e.isApplicable).length;
      const totalImplemented = frameworkEntries.filter(
        e => e.isApplicable && e.control.implementationStatus === 'FULLY_IMPLEMENTED'
      ).length;

      return {
        framework: {
          id: framework.id,
          slug: framework.slug,
          name: framework.name,
          shortName: framework.shortName,
        },
        summary: {
          total: frameworkEntries.length,
          applicable: totalApplicable,
          implemented: totalImplemented,
          percentage: totalApplicable > 0 ? Math.round((totalImplemented / totalApplicable) * 100) : 0,
        },
        categories,
      };
    });

    // Also include entries without a framework (legacy/unlinked controls)
    const unlinkedEntries = soaEntries.filter(entry => !entry.control.frameworkId);
    if (unlinkedEntries.length > 0) {
      const categoryMap: { [key: string]: { total: number; applicable: number; implemented: number } } = {};

      unlinkedEntries.forEach(entry => {
        const controlId = entry.control.controlId;
        const category = controlId.split('.').slice(0, 2).join('.');

        if (!categoryMap[category]) {
          categoryMap[category] = { total: 0, applicable: 0, implemented: 0 };
        }

        categoryMap[category].total++;
        if (entry.isApplicable) {
          categoryMap[category].applicable++;
          if (entry.control.implementationStatus === 'FULLY_IMPLEMENTED') {
            categoryMap[category].implemented++;
          }
        }
      });

      frameworkResults.push({
        framework: {
          id: 'unlinked',
          slug: 'unlinked',
          name: 'Unlinked Controls',
          shortName: 'Unlinked',
        },
        summary: {
          total: unlinkedEntries.length,
          applicable: unlinkedEntries.filter(e => e.isApplicable).length,
          implemented: unlinkedEntries.filter(
            e => e.isApplicable && e.control.implementationStatus === 'FULLY_IMPLEMENTED'
          ).length,
          percentage: (() => {
            const applicable = unlinkedEntries.filter(e => e.isApplicable).length;
            const implemented = unlinkedEntries.filter(
              e => e.isApplicable && e.control.implementationStatus === 'FULLY_IMPLEMENTED'
            ).length;
            return applicable > 0 ? Math.round((implemented / applicable) * 100) : 0;
          })(),
        },
        categories: Object.entries(categoryMap).map(([key, value]) => ({
          category: key,
          total: value.total,
          applicable: value.applicable,
          implemented: value.implemented,
          percentage: value.applicable > 0 ? Math.round((value.implemented / value.applicable) * 100) : 0,
        })),
      });
    }

    res.json({
      success: true,
      data: frameworkResults,
    });
  })
);

// Get risk trend over time
router.get(
  '/risk-trend',
  authenticate,
  requirePermission('dashboard', 'view'),
  asyncHandler(async (req, res) => {
    const { organizationId, months = 6 } = req.query;

    if (!organizationId) {
      throw new AppError('Organization ID is required', 400);
    }

    const numMonths = Number(months);
    const monthlyData: { month: string; avgRiskScore: number; riskCount: number }[] = [];

    // Generate data for last N months
    for (let i = numMonths - 1; i >= 0; i--) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
      const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59);
      
      const monthName = monthStart.toLocaleDateString('en-US', { month: 'short' });
      
      // Get risks that existed during this month
      const risks = await prisma.risk.findMany({
        where: {
          organizationId: organizationId as string,
          createdAt: { lte: monthEnd },
        },
        select: { inherentRisk: true },
      });

      const riskScores = risks.map(r => r.inherentRisk || 0);
      const avgScore = riskScores.length > 0
        ? Math.round(riskScores.reduce((a, b) => a + b, 0) / riskScores.length)
        : 0;

      monthlyData.push({
        month: monthName,
        avgRiskScore: avgScore,
        riskCount: risks.length,
      });
    }

    res.json({
      success: true,
      data: monthlyData,
    });
  })
);

// Get recent activity
router.get(
  '/recent-activity',
  authenticate,
  requirePermission('dashboard', 'view'),
  asyncHandler(async (req, res) => {
    const { organizationId, limit = 10 } = req.query;

    if (!organizationId) {
      throw new AppError('Organization ID is required', 400);
    }

    const recentActivity = await prisma.auditLog.findMany({
      where: { organizationId: organizationId as string },
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: Number(limit),
    });

    res.json({
      success: true,
      data: recentActivity.map(log => ({
        id: log.id,
        action: log.action,
        entityType: log.entityType,
        entityId: log.entityId,
        user: log.user,
        timestamp: log.createdAt,
      })),
    });
  })
);

// Get risk distribution data
router.get(
  '/risk-distribution',
  authenticate,
  requirePermission('dashboard', 'view'),
  asyncHandler(async (req, res) => {
    const { organizationId } = req.query;

    if (!organizationId) {
      throw new AppError('Organization ID is required', 400);
    }

    // Get risk distribution by treatment status
    const byTreatment = await prisma.risk.groupBy({
      by: ['treatment'],
      where: { organizationId: organizationId as string },
      _count: true,
      _avg: { inherentRisk: true },
    });

    // Get risk distribution by category
    const byCategory = await prisma.risk.groupBy({
      by: ['category'],
      where: { organizationId: organizationId as string },
      _count: true,
      _avg: { inherentRisk: true },
    });

    // Get risk trend (inherent vs residual)
    const riskTrend = await prisma.risk.aggregate({
      where: { organizationId: organizationId as string },
      _avg: {
        inherentRisk: true,
        residualRisk: true,
      },
      _count: true,
    });

    res.json({
      success: true,
      data: {
        byTreatment: byTreatment.map(t => ({
          treatment: t.treatment,
          count: t._count,
          avgRisk: Math.round(t._avg.inherentRisk || 0),
        })),
        byCategory: byCategory.map(c => ({
          category: c.category || 'Uncategorized',
          count: c._count,
          avgRisk: Math.round(c._avg.inherentRisk || 0),
        })),
        averages: {
          inherentRisk: Math.round(riskTrend._avg.inherentRisk || 0),
          residualRisk: Math.round(riskTrend._avg.residualRisk || 0),
          totalRisks: riskTrend._count,
        },
      },
    });
  })
);

export default router;
