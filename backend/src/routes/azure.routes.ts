import { Router } from 'express';
import { prisma } from '../index.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { azureMonitorService } from '../services/azureMonitor.service.js';
import { createAzureClient } from '../services/azure.service.js';
import { createAuditLog } from '../services/audit.service.js';
import { logger } from '../utils/logger.js';

const router = Router();

// ============================================
// CONFIG ENDPOINTS
// ============================================

router.get(
  '/config',
  authenticate,
  requirePermission('infrastructure', 'view'),
  asyncHandler(async (req, res) => {
    const { organizationId } = req.query;
    if (!organizationId) throw new AppError('organizationId is required', 400);

    const config = await prisma.azureConfig.findUnique({
      where: { organizationId: organizationId as string },
    });

    res.json({
      success: true,
      data: config ? {
        id: config.id,
        organizationId: config.organizationId,
        tenantId: config.tenantId,
        clientId: config.clientId,
        hasClientSecret: !!config.clientSecret,
        subscriptionId: config.subscriptionId,
        scanSchedule: config.scanSchedule,
        isEnabled: config.isEnabled,
        createdAt: config.createdAt,
        updatedAt: config.updatedAt,
      } : null,
    });
  })
);

router.post(
  '/config',
  authenticate,
  requirePermission('infrastructure', 'edit'),
  asyncHandler(async (req, res) => {
    const { organizationId, tenantId, clientId, clientSecret, subscriptionId, scanSchedule, isEnabled } = req.body;
    if (!organizationId) throw new AppError('organizationId is required', 400);
    if (!tenantId) throw new AppError('tenantId is required', 400);
    if (!clientId) throw new AppError('clientId is required', 400);
    if (!subscriptionId) throw new AppError('subscriptionId is required', 400);

    // Resolve client secret: use provided one, or fall back to existing
    let resolvedSecret = clientSecret;
    if (!resolvedSecret) {
      const existing = await prisma.azureConfig.findUnique({ where: { organizationId } });
      if (!existing?.clientSecret) {
        throw new AppError('clientSecret is required', 400);
      }
      resolvedSecret = existing.clientSecret;
    }

    // Verify the credentials work
    const client = createAzureClient({ tenantId, clientId, clientSecret: resolvedSecret, subscriptionId });
    const valid = await client.verifyCredentials();
    if (!valid) {
      throw new AppError('Invalid Azure credentials. Ensure the Service Principal has the required API permissions and admin consent has been granted.', 400);
    }

    const config = await prisma.azureConfig.upsert({
      where: { organizationId },
      update: {
        tenantId,
        clientId,
        clientSecret: resolvedSecret,
        subscriptionId,
        scanSchedule: scanSchedule || '0 2 * * *',
        isEnabled: isEnabled !== false,
      },
      create: {
        organizationId,
        tenantId,
        clientId,
        clientSecret: resolvedSecret,
        subscriptionId,
        scanSchedule: scanSchedule || '0 2 * * *',
        isEnabled: isEnabled !== false,
      },
    });

    const userId = (req as any).user?.id;
    await createAuditLog({
      userId,
      action: 'UPDATE',
      entityType: 'AzureConfig',
      entityId: config.id,
      newValues: { organizationId, tenantId, clientId, subscriptionId, hasClientSecret: true },
    });

    res.json({
      success: true,
      data: {
        id: config.id,
        organizationId: config.organizationId,
        tenantId: config.tenantId,
        clientId: config.clientId,
        hasClientSecret: true,
        subscriptionId: config.subscriptionId,
        scanSchedule: config.scanSchedule,
        isEnabled: config.isEnabled,
      },
    });
  })
);

// ============================================
// STATS
// ============================================

router.get(
  '/stats',
  authenticate,
  requirePermission('infrastructure', 'view'),
  asyncHandler(async (req, res) => {
    const { organizationId } = req.query;
    if (!organizationId) throw new AppError('organizationId is required', 400);
    const orgId = organizationId as string;

    const [
      totalUsers,
      activeUsers,
      guestUsers,
      mfaRegistered,
      totalGroups,
      securityGroups,
      totalApps,
      expiredCredApps,
      totalPolicies,
      enabledPolicies,
      totalResources,
      totalAlerts,
      highAlerts,
      totalAssessments,
      healthyAssessments,
      lastScan,
      latestCisChecks,
    ] = await Promise.all([
      prisma.azureUser.count({ where: { organizationId: orgId } }),
      prisma.azureUser.count({ where: { organizationId: orgId, accountEnabled: true } }),
      prisma.azureUser.count({ where: { organizationId: orgId, userType: 'Guest' } }),
      prisma.azureUser.count({ where: { organizationId: orgId, accountEnabled: true, mfaRegistered: true } }),
      prisma.azureGroup.count({ where: { organizationId: orgId } }),
      prisma.azureGroup.count({ where: { organizationId: orgId, securityEnabled: true } }),
      prisma.azureAppRegistration.count({ where: { organizationId: orgId } }),
      prisma.azureAppRegistration.count({ where: { organizationId: orgId, hasExpiredCredentials: true } }),
      prisma.azureConditionalAccessPolicy.count({ where: { organizationId: orgId } }),
      prisma.azureConditionalAccessPolicy.count({ where: { organizationId: orgId, state: 'enabled' } }),
      prisma.azureResource.count({ where: { organizationId: orgId } }),
      prisma.azureSecurityAlert.count({ where: { organizationId: orgId } }),
      prisma.azureSecurityAlert.count({ where: { organizationId: orgId, severity: 'high', status: { in: ['new', 'inProgress'] } } }),
      prisma.azureDefenderAssessment.count({ where: { organizationId: orgId } }),
      prisma.azureDefenderAssessment.count({ where: { organizationId: orgId, status: 'Healthy' } }),
      prisma.azureScanLog.findFirst({
        where: { organizationId: orgId, status: 'completed' },
        orderBy: { completedAt: 'desc' },
      }),
      prisma.azureCisCheck.findMany({
        where: {
          organizationId: orgId,
          scanLog: { status: 'completed' },
        },
        orderBy: { createdAt: 'desc' },
        take: 15,
      }),
    ]);

    const mfaPct = activeUsers > 0 ? Math.round((mfaRegistered / activeUsers) * 100) : 0;
    const cisPassCount = latestCisChecks.filter(c => c.status === 'PASS').length;
    const cisTotalCount = latestCisChecks.length;

    res.json({
      success: true,
      data: {
        totalUsers,
        activeUsers,
        guestUsers,
        mfaRegistered,
        mfaPct,
        totalGroups,
        securityGroups,
        totalApps,
        expiredCredApps,
        totalPolicies,
        enabledPolicies,
        totalResources,
        totalAlerts,
        highAlerts,
        totalAssessments,
        healthyAssessments,
        cisPassCount,
        cisTotalCount,
        lastScan: lastScan ? {
          id: lastScan.id,
          completedAt: lastScan.completedAt,
          triggeredBy: lastScan.triggeredBy,
        } : null,
      },
    });
  })
);

// ============================================
// USERS
// ============================================

router.get(
  '/users',
  authenticate,
  requirePermission('infrastructure', 'view'),
  asyncHandler(async (req, res) => {
    const { organizationId, search, enabled, mfa, userType, page = '1', limit = '25' } = req.query;
    if (!organizationId) throw new AppError('organizationId is required', 400);

    const where: any = { organizationId };
    if (search) {
      where.OR = [
        { displayName: { contains: search as string, mode: 'insensitive' } },
        { userPrincipalName: { contains: search as string, mode: 'insensitive' } },
        { mail: { contains: search as string, mode: 'insensitive' } },
      ];
    }
    if (enabled === 'true') where.accountEnabled = true;
    if (enabled === 'false') where.accountEnabled = false;
    if (mfa === 'true') where.mfaRegistered = true;
    if (mfa === 'false') where.mfaRegistered = false;
    if (userType) where.userType = userType;

    const pageNum = parseInt(page as string) || 1;
    const limitNum = Math.min(parseInt(limit as string) || 25, 100);

    const [data, total] = await Promise.all([
      prisma.azureUser.findMany({
        where,
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
        orderBy: { displayName: 'asc' },
      }),
      prisma.azureUser.count({ where }),
    ]);

    res.json({ success: true, data, pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) } });
  })
);

// ============================================
// GROUPS
// ============================================

router.get(
  '/groups',
  authenticate,
  requirePermission('infrastructure', 'view'),
  asyncHandler(async (req, res) => {
    const { organizationId, search, type, visibility, page = '1', limit = '25' } = req.query;
    if (!organizationId) throw new AppError('organizationId is required', 400);

    const where: any = { organizationId };
    if (search) {
      where.OR = [
        { displayName: { contains: search as string, mode: 'insensitive' } },
        { mail: { contains: search as string, mode: 'insensitive' } },
      ];
    }
    if (type === 'security') where.securityEnabled = true;
    if (type === 'mail') where.mailEnabled = true;
    if (visibility) where.visibility = visibility;

    const pageNum = parseInt(page as string) || 1;
    const limitNum = Math.min(parseInt(limit as string) || 25, 100);

    const [data, total] = await Promise.all([
      prisma.azureGroup.findMany({
        where,
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
        orderBy: { displayName: 'asc' },
      }),
      prisma.azureGroup.count({ where }),
    ]);

    res.json({ success: true, data, pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) } });
  })
);

// ============================================
// APP REGISTRATIONS
// ============================================

router.get(
  '/apps',
  authenticate,
  requirePermission('infrastructure', 'view'),
  asyncHandler(async (req, res) => {
    const { organizationId, search, audience, expired, page = '1', limit = '25' } = req.query;
    if (!organizationId) throw new AppError('organizationId is required', 400);

    const where: any = { organizationId };
    if (search) {
      where.OR = [
        { displayName: { contains: search as string, mode: 'insensitive' } },
        { appId: { contains: search as string, mode: 'insensitive' } },
      ];
    }
    if (audience) where.signInAudience = audience;
    if (expired === 'true') where.hasExpiredCredentials = true;
    if (expired === 'false') where.hasExpiredCredentials = false;

    const pageNum = parseInt(page as string) || 1;
    const limitNum = Math.min(parseInt(limit as string) || 25, 100);

    const [data, total] = await Promise.all([
      prisma.azureAppRegistration.findMany({
        where,
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
        orderBy: { displayName: 'asc' },
      }),
      prisma.azureAppRegistration.count({ where }),
    ]);

    res.json({ success: true, data, pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) } });
  })
);

// ============================================
// CONDITIONAL ACCESS POLICIES
// ============================================

router.get(
  '/conditional-access',
  authenticate,
  requirePermission('infrastructure', 'view'),
  asyncHandler(async (req, res) => {
    const { organizationId, state, page = '1', limit = '25' } = req.query;
    if (!organizationId) throw new AppError('organizationId is required', 400);

    const where: any = { organizationId };
    if (state) where.state = state;

    const pageNum = parseInt(page as string) || 1;
    const limitNum = Math.min(parseInt(limit as string) || 25, 100);

    const [data, total] = await Promise.all([
      prisma.azureConditionalAccessPolicy.findMany({
        where,
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
        orderBy: { displayName: 'asc' },
      }),
      prisma.azureConditionalAccessPolicy.count({ where }),
    ]);

    res.json({ success: true, data, pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) } });
  })
);

// ============================================
// RESOURCES
// ============================================

router.get(
  '/resources',
  authenticate,
  requirePermission('infrastructure', 'view'),
  asyncHandler(async (req, res) => {
    const { organizationId, search, type, resourceGroup, location, page = '1', limit = '25' } = req.query;
    if (!organizationId) throw new AppError('organizationId is required', 400);

    const where: any = { organizationId };
    if (search) {
      where.OR = [
        { name: { contains: search as string, mode: 'insensitive' } },
        { type: { contains: search as string, mode: 'insensitive' } },
      ];
    }
    if (type) where.type = type;
    if (resourceGroup) where.resourceGroup = { contains: resourceGroup as string, mode: 'insensitive' };
    if (location) where.location = location;

    const pageNum = parseInt(page as string) || 1;
    const limitNum = Math.min(parseInt(limit as string) || 25, 100);

    const [data, total] = await Promise.all([
      prisma.azureResource.findMany({
        where,
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
        orderBy: { name: 'asc' },
      }),
      prisma.azureResource.count({ where }),
    ]);

    res.json({ success: true, data, pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) } });
  })
);

// ============================================
// SECURITY ALERTS
// ============================================

router.get(
  '/security-alerts',
  authenticate,
  requirePermission('infrastructure', 'view'),
  asyncHandler(async (req, res) => {
    const { organizationId, severity, status, page = '1', limit = '25' } = req.query;
    if (!organizationId) throw new AppError('organizationId is required', 400);

    const where: any = { organizationId };
    if (severity) where.severity = severity;
    if (status) where.status = status;

    const pageNum = parseInt(page as string) || 1;
    const limitNum = Math.min(parseInt(limit as string) || 25, 100);

    const [data, total] = await Promise.all([
      prisma.azureSecurityAlert.findMany({
        where,
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
        orderBy: { createdDateTime: 'desc' },
      }),
      prisma.azureSecurityAlert.count({ where }),
    ]);

    res.json({ success: true, data, pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) } });
  })
);

// ============================================
// DEFENDER ASSESSMENTS
// ============================================

router.get(
  '/defender',
  authenticate,
  requirePermission('infrastructure', 'view'),
  asyncHandler(async (req, res) => {
    const { organizationId, severity, status, page = '1', limit = '25' } = req.query;
    if (!organizationId) throw new AppError('organizationId is required', 400);

    const where: any = { organizationId };
    if (severity) where.severity = severity;
    if (status) where.status = status;

    const pageNum = parseInt(page as string) || 1;
    const limitNum = Math.min(parseInt(limit as string) || 25, 100);

    const [data, total] = await Promise.all([
      prisma.azureDefenderAssessment.findMany({
        where,
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
        orderBy: { displayName: 'asc' },
      }),
      prisma.azureDefenderAssessment.count({ where }),
    ]);

    res.json({ success: true, data, pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) } });
  })
);

// ============================================
// CIS CHECKS
// ============================================

router.get(
  '/cis-checks',
  authenticate,
  requirePermission('infrastructure', 'view'),
  asyncHandler(async (req, res) => {
    const { organizationId } = req.query;
    if (!organizationId) throw new AppError('organizationId is required', 400);

    const latestScan = await prisma.azureScanLog.findFirst({
      where: { organizationId: organizationId as string, status: 'completed' },
      orderBy: { completedAt: 'desc' },
    });

    if (!latestScan) {
      return res.json({ success: true, data: [] });
    }

    const checks = await prisma.azureCisCheck.findMany({
      where: { scanLogId: latestScan.id },
      orderBy: [{ category: 'asc' }, { checkId: 'asc' }],
    });

    res.json({ success: true, data: checks });
  })
);

// ============================================
// SCAN ENDPOINTS
// ============================================

router.post(
  '/scan',
  authenticate,
  requirePermission('infrastructure', 'edit'),
  asyncHandler(async (req, res) => {
    const { organizationId } = req.body;
    if (!organizationId) throw new AppError('organizationId is required', 400);

    // Check if a scan is already running
    const running = await prisma.azureScanLog.findFirst({
      where: { organizationId, status: 'running' },
    });
    if (running) {
      throw new AppError('A scan is already in progress', 409);
    }

    const config = await prisma.azureConfig.findUnique({ where: { organizationId } });
    if (!config) {
      throw new AppError('Azure is not configured for this organization', 400);
    }

    const userId = (req as any).user?.id;
    // Start scan in background
    azureMonitorService.runFullScan(organizationId, userId || 'manual').catch(err => {
      logger.error('Azure background scan failed:', err.message);
    });

    res.json({ success: true, message: 'Azure scan started' });
  })
);

router.get(
  '/scan-status',
  authenticate,
  requirePermission('infrastructure', 'view'),
  asyncHandler(async (req, res) => {
    const { organizationId } = req.query;
    if (!organizationId) throw new AppError('organizationId is required', 400);

    const scanLog = await prisma.azureScanLog.findFirst({
      where: { organizationId: organizationId as string },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ success: true, data: scanLog });
  })
);

router.get(
  '/scan-history',
  authenticate,
  requirePermission('infrastructure', 'view'),
  asyncHandler(async (req, res) => {
    const { organizationId, limit = '10' } = req.query;
    if (!organizationId) throw new AppError('organizationId is required', 400);

    const logs = await prisma.azureScanLog.findMany({
      where: { organizationId: organizationId as string },
      orderBy: { createdAt: 'desc' },
      take: Math.min(parseInt(limit as string) || 10, 50),
    });

    res.json({ success: true, data: logs });
  })
);

// ============================================
// EXPORT
// ============================================

router.get(
  '/export',
  authenticate,
  requirePermission('infrastructure', 'view'),
  asyncHandler(async (req, res) => {
    const { organizationId, type = 'overview' } = req.query;
    if (!organizationId) throw new AppError('organizationId is required', 400);
    const orgId = organizationId as string;

    let csvContent = '';

    switch (type) {
      case 'users': {
        const users = await prisma.azureUser.findMany({ where: { organizationId: orgId }, orderBy: { displayName: 'asc' } });
        csvContent = 'Display Name,UPN,Mail,Enabled,User Type,MFA Registered,MFA Methods,Last Sign-In,Created\n';
        csvContent += users.map(u =>
          `"${u.displayName}","${u.userPrincipalName}","${u.mail || ''}",${u.accountEnabled},"${u.userType || ''}",${u.mfaRegistered},"${u.mfaMethods.join('; ')}","${u.lastSignInDateTime?.toISOString() || ''}","${u.createdDateTime?.toISOString() || ''}"`
        ).join('\n');
        break;
      }
      case 'groups': {
        const groups = await prisma.azureGroup.findMany({ where: { organizationId: orgId }, orderBy: { displayName: 'asc' } });
        csvContent = 'Display Name,Mail,Security Enabled,Mail Enabled,Members,Visibility,Group Types\n';
        csvContent += groups.map(g =>
          `"${g.displayName}","${g.mail || ''}",${g.securityEnabled},${g.mailEnabled},${g.memberCount},"${g.visibility || ''}","${g.groupTypes.join('; ')}"`
        ).join('\n');
        break;
      }
      case 'apps': {
        const apps = await prisma.azureAppRegistration.findMany({ where: { organizationId: orgId }, orderBy: { displayName: 'asc' } });
        csvContent = 'Display Name,App ID,Sign-In Audience,Password Creds,Key Creds,Expired,Created\n';
        csvContent += apps.map(a =>
          `"${a.displayName}","${a.appId}","${a.signInAudience || ''}",${a.passwordCredentialCount},${a.keyCredentialCount},${a.hasExpiredCredentials},"${a.createdDateTime?.toISOString() || ''}"`
        ).join('\n');
        break;
      }
      case 'cis': {
        const latestScan = await prisma.azureScanLog.findFirst({
          where: { organizationId: orgId, status: 'completed' },
          orderBy: { completedAt: 'desc' },
        });
        if (latestScan) {
          const checks = await prisma.azureCisCheck.findMany({
            where: { scanLogId: latestScan.id },
            orderBy: [{ category: 'asc' }, { checkId: 'asc' }],
          });
          csvContent = 'Check ID,Category,Title,Status,Details\n';
          csvContent += checks.map(c =>
            `"${c.checkId}","${c.category}","${c.title}","${c.status}","${(c.details || '').replace(/"/g, '""')}"`
          ).join('\n');
        }
        break;
      }
      default: {
        // Overview export
        const [users, groups, apps, alerts] = await Promise.all([
          prisma.azureUser.count({ where: { organizationId: orgId } }),
          prisma.azureGroup.count({ where: { organizationId: orgId } }),
          prisma.azureAppRegistration.count({ where: { organizationId: orgId } }),
          prisma.azureSecurityAlert.count({ where: { organizationId: orgId } }),
        ]);
        csvContent = 'Metric,Value\nTotal Users,' + users + '\nTotal Groups,' + groups + '\nApp Registrations,' + apps + '\nSecurity Alerts,' + alerts;
      }
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=azure-${type}-report.csv`);
    res.send(csvContent);
  })
);

export default router;
