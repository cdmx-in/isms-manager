import { Router } from 'express';
import { prisma } from '../index.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { gwMonitorService } from '../services/gwMonitor.service.js';
import { createGoogleWorkspaceClient } from '../services/googleWorkspace.service.js';
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

    const config = await prisma.gWorkspaceConfig.findUnique({
      where: { organizationId: organizationId as string },
    });

    res.json({
      success: true,
      data: config ? {
        id: config.id,
        organizationId: config.organizationId,
        hasServiceAccountKey: !!config.serviceAccountKey,
        adminEmail: config.adminEmail,
        domain: config.domain,
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
    const { organizationId, serviceAccountKey, adminEmail, domain, scanSchedule, isEnabled } = req.body;
    if (!organizationId) throw new AppError('organizationId is required', 400);
    if (!adminEmail) throw new AppError('adminEmail is required', 400);

    // Resolve the service account key: use provided one, or fall back to existing
    let resolvedKey = serviceAccountKey;
    if (!resolvedKey) {
      const existing = await prisma.gWorkspaceConfig.findUnique({ where: { organizationId } });
      if (!existing?.serviceAccountKey) {
        throw new AppError('serviceAccountKey is required', 400);
      }
      resolvedKey = existing.serviceAccountKey;
    }

    // Clean up pasted JSON: strip BOM, smart quotes, invisible chars
    resolvedKey = resolvedKey
      .replace(/^\uFEFF/, '')                // strip BOM
      .replace(/[\u201C\u201D\u201E\u201F]/g, '"')  // smart double quotes → "
      .replace(/[\u2018\u2019\u201A\u201B]/g, "'")  // smart single quotes → '
      .replace(/[\u00A0]/g, ' ')             // non-breaking space → space
      .replace(/[\u200B-\u200D\uFEFF]/g, '') // zero-width chars
      .trim();

    // Validate JSON format
    let parsed: any;
    try {
      parsed = JSON.parse(resolvedKey);
    } catch (err: any) {
      // Log for debugging
      const first200 = resolvedKey.substring(0, 200);
      const charCodes = Array.from(resolvedKey.substring(0, 20)).map((c, i) => `${i}:U+${c.charCodeAt(0).toString(16).padStart(4, '0')}(${c})`).join(' ');
      logger.error(`Failed to parse service account JSON (length=${resolvedKey.length}). First 200 chars: [${first200}]`);
      logger.error(`Char codes at positions 0-20: ${charCodes}`);
      throw new AppError(`Invalid JSON in service account key: ${err.message}`, 400);
    }

    if (!parsed.client_email || !parsed.private_key) {
      throw new AppError('Invalid service account JSON: missing client_email or private_key fields. Ensure you paste the complete JSON file.', 400);
    }

    // Store the cleaned, validated JSON
    resolvedKey = JSON.stringify(parsed);

    // Verify the credentials work
    const client = createGoogleWorkspaceClient({ serviceAccountKey: resolvedKey, adminEmail, domain });
    const valid = await client.verifyCredentials();
    if (!valid) {
      throw new AppError('Invalid Google Workspace credentials. Ensure the service account has domain-wide delegation and the admin email is a super admin.', 400);
    }

    const config = await prisma.gWorkspaceConfig.upsert({
      where: { organizationId },
      update: {
        serviceAccountKey: resolvedKey,
        adminEmail,
        domain: domain || null,
        scanSchedule: scanSchedule || '0 0 * * *',
        isEnabled: isEnabled !== false,
      },
      create: {
        organizationId,
        serviceAccountKey: resolvedKey,
        adminEmail,
        domain: domain || null,
        scanSchedule: scanSchedule || '0 0 * * *',
        isEnabled: isEnabled !== false,
      },
    });

    const userId = (req as any).user?.id;
    await createAuditLog({
      userId,
      action: 'UPDATE',
      entityType: 'GWorkspaceConfig',
      entityId: config.id,
      newValues: { organizationId, hasServiceAccountKey: true, adminEmail },
    });

    res.json({
      success: true,
      data: {
        id: config.id,
        organizationId: config.organizationId,
        hasServiceAccountKey: true,
        adminEmail: config.adminEmail,
        domain: config.domain,
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

    const config = await prisma.gWorkspaceConfig.findUnique({ where: { organizationId: orgId } });

    const [
      totalUsers,
      activeUsers,
      suspendedUsers,
      archivedUsers,
      adminUsers,
      enrolledIn2Sv,
      enforcedIn2Sv,
      totalGroups,
      externalGroups,
      totalDevices,
      totalAlerts,
      activeAlerts,
      totalOAuthApps,
      highRiskApps,
      lastScan,
      latestCisChecks,
      totalOrgUnits,
      riskTaggedOrgUnits,
      totalAdminRoles,
      totalRoleAssignments,
    ] = await Promise.all([
      prisma.gWorkspaceUser.count({ where: { organizationId: orgId } }),
      prisma.gWorkspaceUser.count({ where: { organizationId: orgId, suspended: false, archived: false } }),
      prisma.gWorkspaceUser.count({ where: { organizationId: orgId, suspended: true } }),
      prisma.gWorkspaceUser.count({ where: { organizationId: orgId, archived: true } }),
      prisma.gWorkspaceUser.count({ where: { organizationId: orgId, isAdmin: true } }),
      prisma.gWorkspaceUser.count({ where: { organizationId: orgId, isEnrolledIn2Sv: true, suspended: false, archived: false } }),
      prisma.gWorkspaceUser.count({ where: { organizationId: orgId, isEnforcedIn2Sv: true, suspended: false, archived: false } }),
      prisma.gWorkspaceGroup.count({ where: { organizationId: orgId } }),
      prisma.gWorkspaceGroup.count({ where: { organizationId: orgId, allowExternalMembers: true } }),
      prisma.gWorkspaceMobileDevice.count({ where: { organizationId: orgId } }),
      prisma.gWorkspaceAlert.count({ where: { organizationId: orgId } }),
      prisma.gWorkspaceAlert.count({ where: { organizationId: orgId, status: 'ACTIVE' } }),
      prisma.gWorkspaceOAuthApp.count({ where: { organizationId: orgId } }),
      prisma.gWorkspaceOAuthApp.count({ where: { organizationId: orgId, riskLevel: 'HIGH' } }),
      prisma.gWorkspaceScanLog.findFirst({
        where: { organizationId: orgId, status: 'completed' },
        orderBy: { completedAt: 'desc' },
      }),
      prisma.gWorkspaceCisCheck.findMany({
        where: {
          organizationId: orgId,
          scanLog: { status: 'completed' },
        },
        orderBy: { createdAt: 'desc' },
        take: 15,
      }),
      prisma.gWorkspaceOrgUnit.count({ where: { organizationId: orgId } }),
      prisma.gWorkspaceOrgUnit.count({ where: { organizationId: orgId, riskTags: { isEmpty: false } } }),
      prisma.gWorkspaceAdminRole.count({ where: { organizationId: orgId } }),
      prisma.gWorkspaceRoleAssignment.count({ where: { organizationId: orgId } }),
    ]);

    const twoFaPct = activeUsers > 0 ? Math.round((enrolledIn2Sv / activeUsers) * 100) : 0;
    const cisPassCount = latestCisChecks.filter(c => c.status === 'PASS').length;
    const cisTotalCount = latestCisChecks.length;

    res.json({
      success: true,
      data: {
        totalUsers,
        activeUsers,
        suspendedUsers,
        archivedUsers,
        adminUsers,
        enrolledIn2Sv,
        enforcedIn2Sv,
        twoFaPct,
        totalGroups,
        externalGroups,
        totalDevices,
        totalAlerts,
        activeAlerts,
        totalOAuthApps,
        highRiskApps,
        cisPassCount,
        cisTotalCount,
        lastScan: lastScan ? {
          id: lastScan.id,
          triggeredBy: lastScan.triggeredBy,
          completedAt: lastScan.completedAt,
        } : null,
        totalOrgUnits,
        riskTaggedOrgUnits,
        totalAdminRoles,
        totalRoleAssignments,
        isConfigured: !!config?.serviceAccountKey,
        scanSchedule: config?.scanSchedule || '0 0 * * *',
        isEnabled: config?.isEnabled ?? false,
      },
    });
  })
);

// ============================================
// DATA ENDPOINTS
// ============================================

router.get(
  '/users',
  authenticate,
  requirePermission('infrastructure', 'view'),
  asyncHandler(async (req, res) => {
    const { organizationId, search, admin, suspended, twoFa, orgUnitPath, page = '1', limit = '50' } = req.query;
    if (!organizationId) throw new AppError('organizationId is required', 400);

    const where: any = { organizationId };
    if (search) {
      where.OR = [
        { primaryEmail: { contains: search as string, mode: 'insensitive' } },
        { fullName: { contains: search as string, mode: 'insensitive' } },
      ];
    }
    if (admin === 'true') where.isAdmin = true;
    if (suspended === 'true') where.suspended = true;
    if (suspended === 'false') where.suspended = false;
    if (twoFa === 'enrolled') where.isEnrolledIn2Sv = true;
    if (twoFa === 'not_enrolled') where.isEnrolledIn2Sv = false;
    if (orgUnitPath) where.orgUnitPath = orgUnitPath as string;

    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);

    const [users, total] = await Promise.all([
      prisma.gWorkspaceUser.findMany({ where, orderBy: [{ isAdmin: 'desc' }, { primaryEmail: 'asc' }], skip, take }),
      prisma.gWorkspaceUser.count({ where }),
    ]);

    res.json({
      success: true,
      data: users,
      pagination: { page: Number(page), limit: Number(limit), total, totalPages: Math.ceil(total / take) },
    });
  })
);

router.get(
  '/groups',
  authenticate,
  requirePermission('infrastructure', 'view'),
  asyncHandler(async (req, res) => {
    const { organizationId, search, externalMembers, page = '1', limit = '50' } = req.query;
    if (!organizationId) throw new AppError('organizationId is required', 400);

    const where: any = { organizationId };
    if (search) {
      where.OR = [
        { email: { contains: search as string, mode: 'insensitive' } },
        { name: { contains: search as string, mode: 'insensitive' } },
      ];
    }
    if (externalMembers === 'true') where.allowExternalMembers = true;
    if (externalMembers === 'false') where.allowExternalMembers = false;

    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);

    const [groups, total] = await Promise.all([
      prisma.gWorkspaceGroup.findMany({ where, orderBy: { name: 'asc' }, skip, take }),
      prisma.gWorkspaceGroup.count({ where }),
    ]);

    res.json({
      success: true,
      data: groups,
      pagination: { page: Number(page), limit: Number(limit), total, totalPages: Math.ceil(total / take) },
    });
  })
);

router.get(
  '/oauth-apps',
  authenticate,
  requirePermission('infrastructure', 'view'),
  asyncHandler(async (req, res) => {
    const { organizationId, riskLevel, verified, page = '1', limit = '50' } = req.query;
    if (!organizationId) throw new AppError('organizationId is required', 400);

    const where: any = { organizationId };
    if (riskLevel && riskLevel !== 'all') where.riskLevel = riskLevel as string;
    if (verified === 'true') where.anonymous = false;
    if (verified === 'false') where.anonymous = true;

    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);

    const [apps, total] = await Promise.all([
      prisma.gWorkspaceOAuthApp.findMany({ where, orderBy: [{ riskLevel: 'asc' }, { userCount: 'desc' }], skip, take }),
      prisma.gWorkspaceOAuthApp.count({ where }),
    ]);

    res.json({
      success: true,
      data: apps,
      pagination: { page: Number(page), limit: Number(limit), total, totalPages: Math.ceil(total / take) },
    });
  })
);

router.get(
  '/devices',
  authenticate,
  requirePermission('infrastructure', 'view'),
  asyncHandler(async (req, res) => {
    const { organizationId, type, status, compromised, page = '1', limit = '50' } = req.query;
    if (!organizationId) throw new AppError('organizationId is required', 400);

    const where: any = { organizationId: organizationId as string };
    if (type && type !== 'all') where.deviceType = type as string;
    if (status && status !== 'all') where.status = status as string;
    if (compromised === 'true') where.compromisedStatus = { not: null, notIn: ['No compromise detected', 'NO_COMPROMISE_DETECTED', 'Undetected', ''] };

    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);

    const [devices, total] = await Promise.all([
      prisma.gWorkspaceMobileDevice.findMany({ where, orderBy: { lastSync: 'desc' }, skip, take }),
      prisma.gWorkspaceMobileDevice.count({ where }),
    ]);

    res.json({
      success: true,
      data: devices,
      pagination: { page: Number(page), limit: Number(limit), total, totalPages: Math.ceil(total / take) },
    });
  })
);

router.get(
  '/alerts',
  authenticate,
  requirePermission('infrastructure', 'view'),
  asyncHandler(async (req, res) => {
    const { organizationId, severity, status, type, page = '1', limit = '50' } = req.query;
    if (!organizationId) throw new AppError('organizationId is required', 400);

    const where: any = { organizationId: organizationId as string };
    if (severity && severity !== 'all') where.severity = severity as string;
    if (status && status !== 'all') where.status = status as string;
    if (type && type !== 'all') where.type = type as string;

    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);

    const [alerts, total] = await Promise.all([
      prisma.gWorkspaceAlert.findMany({ where, orderBy: { startTime: 'desc' }, skip, take }),
      prisma.gWorkspaceAlert.count({ where }),
    ]);

    res.json({
      success: true,
      data: alerts,
      pagination: { page: Number(page), limit: Number(limit), total, totalPages: Math.ceil(total / take) },
    });
  })
);

router.get(
  '/cis-checks',
  authenticate,
  requirePermission('infrastructure', 'view'),
  asyncHandler(async (req, res) => {
    const { organizationId } = req.query;
    if (!organizationId) throw new AppError('organizationId is required', 400);

    // Get latest completed scan
    const lastScan = await prisma.gWorkspaceScanLog.findFirst({
      where: { organizationId: organizationId as string, status: 'completed' },
      orderBy: { completedAt: 'desc' },
    });

    if (!lastScan) {
      return res.json({ success: true, data: [] });
    }

    const checks = await prisma.gWorkspaceCisCheck.findMany({
      where: { scanLogId: lastScan.id },
      orderBy: [{ category: 'asc' }, { checkId: 'asc' }],
    });

    res.json({ success: true, data: checks });
  })
);

// ============================================
// ORG UNITS & ADMIN ROLES
// ============================================

router.get(
  '/org-units',
  authenticate,
  requirePermission('infrastructure', 'view'),
  asyncHandler(async (req, res) => {
    const { organizationId, search, hasRiskTags, page = '1', limit = '100' } = req.query;
    if (!organizationId) throw new AppError('organizationId is required', 400);

    const where: any = { organizationId };
    if (search) {
      where.OR = [
        { name: { contains: search as string, mode: 'insensitive' } },
        { orgUnitPath: { contains: search as string, mode: 'insensitive' } },
      ];
    }
    if (hasRiskTags === 'true') where.riskTags = { isEmpty: false };

    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);

    const [orgUnits, total] = await Promise.all([
      prisma.gWorkspaceOrgUnit.findMany({ where, orderBy: { orgUnitPath: 'asc' }, skip, take }),
      prisma.gWorkspaceOrgUnit.count({ where }),
    ]);

    res.json({
      success: true,
      data: orgUnits,
      pagination: { page: Number(page), limit: Number(limit), total, totalPages: Math.ceil(total / take) },
    });
  })
);

router.patch(
  '/org-units/:id/risk-tags',
  authenticate,
  requirePermission('infrastructure', 'edit'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { riskTags, riskNotes } = req.body;

    const orgUnit = await prisma.gWorkspaceOrgUnit.findUnique({ where: { id } });
    if (!orgUnit) throw new AppError('Org unit not found', 404);

    const data: any = {};
    if (riskTags !== undefined) data.riskTags = riskTags;
    if (riskNotes !== undefined) data.riskNotes = riskNotes;

    const updated = await prisma.gWorkspaceOrgUnit.update({ where: { id }, data });

    const userId = (req as any).user?.id;
    await createAuditLog({
      userId,
      action: 'UPDATE',
      entityType: 'GWorkspaceOrgUnit',
      entityId: id,
      newValues: { riskTags, riskNotes },
    });

    res.json({ success: true, data: updated });
  })
);

router.get(
  '/admin-roles',
  authenticate,
  requirePermission('infrastructure', 'view'),
  asyncHandler(async (req, res) => {
    const { organizationId } = req.query;
    if (!organizationId) throw new AppError('organizationId is required', 400);

    const roles = await prisma.gWorkspaceAdminRole.findMany({
      where: { organizationId: organizationId as string },
      include: {
        assignments: {
          select: {
            id: true,
            assignedTo: true,
            assignedToEmail: true,
            scopeType: true,
            orgUnitId: true,
          },
        },
      },
      orderBy: [{ isSuperAdminRole: 'desc' }, { roleName: 'asc' }],
    });

    res.json({ success: true, data: roles });
  })
);

router.get(
  '/role-assignments',
  authenticate,
  requirePermission('infrastructure', 'view'),
  asyncHandler(async (req, res) => {
    const { organizationId, userId: googleUserId } = req.query;
    if (!organizationId) throw new AppError('organizationId is required', 400);

    const where: any = { organizationId };
    if (googleUserId) where.assignedTo = googleUserId as string;

    const assignments = await prisma.gWorkspaceRoleAssignment.findMany({
      where,
      include: {
        adminRole: {
          select: {
            id: true,
            roleName: true,
            isSuperAdminRole: true,
            isSystemRole: true,
          },
        },
      },
      orderBy: { assignedToEmail: 'asc' },
    });

    res.json({ success: true, data: assignments });
  })
);

// ============================================
// SCAN OPERATIONS
// ============================================

router.post(
  '/scan',
  authenticate,
  requirePermission('infrastructure', 'edit'),
  asyncHandler(async (req, res) => {
    const { organizationId } = req.body;
    if (!organizationId) throw new AppError('organizationId is required', 400);

    const config = await prisma.gWorkspaceConfig.findUnique({ where: { organizationId } });
    if (!config || !config.serviceAccountKey) {
      throw new AppError('Google Workspace is not configured. Go to Settings to configure it.', 400);
    }

    const runningScan = await prisma.gWorkspaceScanLog.findFirst({
      where: { organizationId, status: 'running' },
    });
    if (runningScan) {
      throw new AppError('A scan is already in progress', 409);
    }

    const userId = (req as any).user?.id;

    gwMonitorService.runFullScan(organizationId, userId || 'manual').catch(err => {
      logger.error('Background GW scan failed:', err);
    });

    await createAuditLog({
      userId,
      action: 'CREATE',
      entityType: 'GWorkspaceScan',
      newValues: { organizationId, triggeredBy: userId || 'manual' },
    });

    res.json({ success: true, data: { message: 'Google Workspace scan started.' } });
  })
);

router.get(
  '/scan-status',
  authenticate,
  requirePermission('infrastructure', 'view'),
  asyncHandler(async (req, res) => {
    const { organizationId } = req.query;
    if (!organizationId) throw new AppError('organizationId is required', 400);

    const latestScan = await prisma.gWorkspaceScanLog.findFirst({
      where: { organizationId: organizationId as string },
      orderBy: { startedAt: 'desc' },
    });
    res.json({ success: true, data: latestScan });
  })
);

router.get(
  '/scan-history',
  authenticate,
  requirePermission('infrastructure', 'view'),
  asyncHandler(async (req, res) => {
    const { organizationId, limit = '10' } = req.query;
    if (!organizationId) throw new AppError('organizationId is required', 400);

    const scans = await prisma.gWorkspaceScanLog.findMany({
      where: { organizationId: organizationId as string },
      orderBy: { startedAt: 'desc' },
      take: Number(limit),
    });
    res.json({ success: true, data: scans });
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

    const escCsv = (val: string) => {
      if (val.includes(',') || val.includes('"') || val.includes('\n')) {
        return `"${val.replace(/"/g, '""')}"`;
      }
      return val;
    };

    const reportDate = new Date().toISOString().split('T')[0];
    let csv = '';
    let filename = '';

    if (type === 'users') {
      const users = await prisma.gWorkspaceUser.findMany({
        where: { organizationId: orgId },
        orderBy: [{ isAdmin: 'desc' }, { primaryEmail: 'asc' }],
      });
      const headers = ['Email', 'Full Name', 'Admin', 'Suspended', 'Archived', '2FA Enrolled', '2FA Enforced', 'Last Login', 'Org Unit'];
      const rows = users.map(u => [
        escCsv(u.primaryEmail), escCsv(u.fullName), u.isAdmin ? 'Yes' : 'No',
        u.suspended ? 'Yes' : 'No', u.archived ? 'Yes' : 'No',
        u.isEnrolledIn2Sv ? 'Yes' : 'No', u.isEnforcedIn2Sv ? 'Yes' : 'No',
        u.lastLoginTime ? new Date(u.lastLoginTime).toISOString() : 'Never',
        escCsv(u.orgUnitPath || '/'),
      ].join(','));
      csv = [headers.join(','), ...rows].join('\n');
      filename = `gworkspace-users-${reportDate}.csv`;
    } else if (type === 'cis') {
      const lastScan = await prisma.gWorkspaceScanLog.findFirst({
        where: { organizationId: orgId, status: 'completed' },
        orderBy: { completedAt: 'desc' },
      });
      const checks = lastScan ? await prisma.gWorkspaceCisCheck.findMany({
        where: { scanLogId: lastScan.id },
        orderBy: [{ category: 'asc' }, { checkId: 'asc' }],
      }) : [];
      const headers = ['Check ID', 'Category', 'Title', 'Status', 'Details'];
      const rows = checks.map(c => [
        c.checkId, escCsv(c.category), escCsv(c.title), c.status, escCsv(c.details || ''),
      ].join(','));
      csv = [headers.join(','), ...rows].join('\n');
      filename = `gworkspace-cis-report-${reportDate}.csv`;
    } else {
      // Overview: combined summary
      const [users, groups, apps, devices, alerts] = await Promise.all([
        prisma.gWorkspaceUser.count({ where: { organizationId: orgId } }),
        prisma.gWorkspaceGroup.count({ where: { organizationId: orgId } }),
        prisma.gWorkspaceOAuthApp.count({ where: { organizationId: orgId } }),
        prisma.gWorkspaceMobileDevice.count({ where: { organizationId: orgId } }),
        prisma.gWorkspaceAlert.count({ where: { organizationId: orgId } }),
      ]);
      const active = await prisma.gWorkspaceUser.count({ where: { organizationId: orgId, suspended: false, archived: false } });
      const enrolled2sv = await prisma.gWorkspaceUser.count({ where: { organizationId: orgId, isEnrolledIn2Sv: true, suspended: false, archived: false } });
      const highRisk = await prisma.gWorkspaceOAuthApp.count({ where: { organizationId: orgId, riskLevel: 'HIGH' } });

      const reportHeader = [
        '# Google Workspace Security Report',
        `# Generated: ${new Date().toISOString()}`,
        `# Total Users: ${users}`,
        `# Active Users: ${active}`,
        `# 2FA Enrollment: ${active > 0 ? Math.round((enrolled2sv / active) * 100) : 0}%`,
        `# Groups: ${groups}`,
        `# OAuth Apps: ${apps} (${highRisk} high-risk)`,
        `# Mobile Devices: ${devices}`,
        `# Alerts: ${alerts}`,
        '',
      ];
      const headers = ['Metric', 'Value'];
      const rows = [
        'Total Users,' + users,
        'Active Users,' + active,
        '2FA Enrolled,' + enrolled2sv,
        '2FA Enrollment %,' + (active > 0 ? Math.round((enrolled2sv / active) * 100) : 0),
        'Groups,' + groups,
        'OAuth Apps,' + apps,
        'High Risk Apps,' + highRisk,
        'Mobile Devices,' + devices,
        'Alerts,' + alerts,
      ];
      csv = [...reportHeader, headers.join(','), ...rows].join('\n');
      filename = `gworkspace-security-report-${reportDate}.csv`;
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  })
);

export default router;
