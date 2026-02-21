import { Router } from 'express';
import { prisma } from '../index.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { infraMonitorService } from '../services/infraMonitor.service.js';
import { createCloudflareClient } from '../services/cloudflare.service.js';
import { createAuditLog } from '../services/audit.service.js';
import { logger } from '../utils/logger.js';

const router = Router();

// ============================================
// CONFIG ENDPOINTS (org-level settings)
// ============================================

// GET /api/infrastructure/config?organizationId=...
router.get(
  '/config',
  authenticate,
  requirePermission('infrastructure', 'view'),
  asyncHandler(async (req, res) => {
    const { organizationId } = req.query;
    if (!organizationId) throw new AppError('organizationId is required', 400);

    const config = await prisma.infraMonitorConfig.findUnique({
      where: { organizationId: organizationId as string },
    });

    res.json({
      success: true,
      data: config ? {
        id: config.id,
        organizationId: config.organizationId,
        hasApiToken: !!config.cloudflareApiToken,
        httpCheckProxy: config.httpCheckProxy || '',
        scanSchedule: config.scanSchedule,
        isEnabled: config.isEnabled,
        createdAt: config.createdAt,
        updatedAt: config.updatedAt,
      } : null,
    });
  })
);

// POST /api/infrastructure/config
router.post(
  '/config',
  authenticate,
  requirePermission('infrastructure', 'edit'),
  asyncHandler(async (req, res) => {
    const { organizationId, cloudflareApiToken, httpCheckProxy, scanSchedule, isEnabled } = req.body;
    if (!organizationId) throw new AppError('organizationId is required', 400);
    if (!cloudflareApiToken) throw new AppError('cloudflareApiToken is required', 400);

    // Verify the token works
    const cfClient = createCloudflareClient(cloudflareApiToken);
    const valid = await cfClient.verifyToken();
    if (!valid) {
      throw new AppError('Invalid Cloudflare API token', 400);
    }

    const config = await prisma.infraMonitorConfig.upsert({
      where: { organizationId },
      update: {
        cloudflareApiToken,
        httpCheckProxy: httpCheckProxy || null,
        scanSchedule: scanSchedule || '0 0 * * *',
        isEnabled: isEnabled !== false,
      },
      create: {
        organizationId,
        cloudflareApiToken,
        httpCheckProxy: httpCheckProxy || null,
        scanSchedule: scanSchedule || '0 0 * * *',
        isEnabled: isEnabled !== false,
      },
    });

    const userId = (req as any).user?.id;
    await createAuditLog({
      userId,
      action: 'UPDATE',
      entityType: 'InfraMonitorConfig',
      entityId: config.id,
      newValues: { organizationId, hasApiToken: true, httpCheckProxy: httpCheckProxy || null, scanSchedule: config.scanSchedule },
    });

    res.json({
      success: true,
      data: {
        id: config.id,
        organizationId: config.organizationId,
        hasApiToken: true,
        httpCheckProxy: config.httpCheckProxy || '',
        scanSchedule: config.scanSchedule,
        isEnabled: config.isEnabled,
      },
    });
  })
);

// ============================================
// STATS & RECORDS
// ============================================

// GET /api/infrastructure/stats?organizationId=...
router.get(
  '/stats',
  authenticate,
  requirePermission('infrastructure', 'view'),
  asyncHandler(async (req, res) => {
    const { organizationId } = req.query;
    if (!organizationId) throw new AppError('organizationId is required', 400);
    const orgId = organizationId as string;

    const config = await prisma.infraMonitorConfig.findUnique({
      where: { organizationId: orgId },
    });

    const [
      totalRecords,
      publicCount,
      privateCount,
      unreachableCount,
      pendingCount,
      errorCount,
      originExposedCount,
      zoneCount,
      byType,
      lastScan,
    ] = await Promise.all([
      prisma.dnsRecord.count({ where: { organizationId: orgId } }),
      prisma.dnsRecord.count({ where: { organizationId: orgId, exposureStatus: 'PUBLIC' } }),
      prisma.dnsRecord.count({ where: { organizationId: orgId, exposureStatus: 'PRIVATE' } }),
      prisma.dnsRecord.count({ where: { organizationId: orgId, exposureStatus: 'UNREACHABLE' } }),
      prisma.dnsRecord.count({ where: { organizationId: orgId, exposureStatus: 'PENDING' } }),
      prisma.dnsRecord.count({ where: { organizationId: orgId, exposureStatus: 'ERROR' } }),
      prisma.dnsRecord.count({ where: { organizationId: orgId, originProtected: false } }),
      prisma.dnsZone.count({ where: { organizationId: orgId } }),
      prisma.dnsRecord.groupBy({ by: ['type'], where: { organizationId: orgId }, _count: true }),
      prisma.infraMonitorScanLog.findFirst({
        where: { organizationId: orgId, status: 'completed' },
        orderBy: { completedAt: 'desc' },
      }),
    ]);

    res.json({
      success: true,
      data: {
        totalRecords,
        publicCount,
        privateCount,
        unreachableCount,
        pendingCount,
        errorCount,
        originExposedCount,
        zoneCount,
        byType: byType.reduce((acc: any, t) => ({ ...acc, [t.type]: t._count }), {}),
        lastScan: lastScan ? {
          id: lastScan.id,
          triggeredBy: lastScan.triggeredBy,
          completedAt: lastScan.completedAt,
          recordsScanned: lastScan.recordsScanned,
        } : null,
        isConfigured: !!config?.cloudflareApiToken,
        scanSchedule: config?.scanSchedule || '0 0 * * *',
        isEnabled: config?.isEnabled ?? false,
      },
    });
  })
);

// GET /api/infrastructure/records?organizationId=...
router.get(
  '/records',
  authenticate,
  requirePermission('infrastructure', 'view'),
  asyncHandler(async (req, res) => {
    const {
      organizationId,
      search,
      type,
      exposureStatus,
      proxied,
      originProtected,
      zoneId,
      page = '1',
      limit = '50',
    } = req.query;

    if (!organizationId) throw new AppError('organizationId is required', 400);

    const where: any = { organizationId };

    if (search) {
      where.name = { contains: search as string, mode: 'insensitive' };
    }
    if (type && type !== 'all') {
      where.type = type as string;
    }
    if (exposureStatus && exposureStatus !== 'all') {
      where.exposureStatus = exposureStatus as string;
    }
    if (proxied !== undefined && proxied !== '' && proxied !== 'all') {
      where.proxied = proxied === 'true';
    }
    if (originProtected === 'true') {
      where.originProtected = true;
    } else if (originProtected === 'false') {
      where.originProtected = false;
    }
    if (zoneId && zoneId !== 'all') {
      where.zoneId = zoneId as string;
    }

    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);

    const [records, total] = await Promise.all([
      prisma.dnsRecord.findMany({
        where,
        include: {
          zone: { select: { id: true, name: true } },
        },
        orderBy: [
          { exposureStatus: 'asc' },
          { name: 'asc' },
        ],
        skip,
        take,
      }),
      prisma.dnsRecord.count({ where }),
    ]);

    res.json({
      success: true,
      data: records,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / take),
      },
    });
  })
);

// GET /api/infrastructure/records/:id?organizationId=...
router.get(
  '/records/:id',
  authenticate,
  requirePermission('infrastructure', 'view'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { organizationId } = req.query;
    if (!organizationId) throw new AppError('organizationId is required', 400);

    const record = await prisma.dnsRecord.findFirst({
      where: { id, organizationId: organizationId as string },
      include: {
        zone: { select: { id: true, name: true, nameservers: true, status: true } },
      },
    });

    if (!record) throw new AppError('Record not found', 404);

    res.json({ success: true, data: record });
  })
);

// GET /api/infrastructure/zones?organizationId=...
router.get(
  '/zones',
  authenticate,
  requirePermission('infrastructure', 'view'),
  asyncHandler(async (req, res) => {
    const { organizationId } = req.query;
    if (!organizationId) throw new AppError('organizationId is required', 400);

    const zones = await prisma.dnsZone.findMany({
      where: { organizationId: organizationId as string },
      include: {
        _count: { select: { records: true } },
      },
      orderBy: { name: 'asc' },
    });

    res.json({ success: true, data: zones });
  })
);

// ============================================
// SCAN OPERATIONS
// ============================================

// POST /api/infrastructure/scan
router.post(
  '/scan',
  authenticate,
  requirePermission('infrastructure', 'edit'),
  asyncHandler(async (req, res) => {
    const { organizationId } = req.body;
    if (!organizationId) throw new AppError('organizationId is required', 400);

    const config = await prisma.infraMonitorConfig.findUnique({
      where: { organizationId },
    });
    if (!config || !config.cloudflareApiToken) {
      throw new AppError('Cloudflare API token is not configured. Go to Settings to configure it.', 400);
    }

    const runningScan = await prisma.infraMonitorScanLog.findFirst({
      where: { organizationId, status: 'running' },
    });
    if (runningScan) {
      throw new AppError('A scan is already in progress', 409);
    }

    const userId = (req as any).user?.id;

    // Start scan in background
    infraMonitorService.runFullScan(organizationId, userId || 'manual').catch(err => {
      logger.error('Background infrastructure scan failed:', err);
    });

    await createAuditLog({
      userId,
      action: 'CREATE',
      entityType: 'InfraMonitorScan',
      newValues: { organizationId, triggeredBy: userId || 'manual' },
    });

    res.json({
      success: true,
      data: { message: 'Infrastructure scan started.' },
    });
  })
);

// POST /api/infrastructure/records/:id/check
router.post(
  '/records/:id/check',
  authenticate,
  requirePermission('infrastructure', 'edit'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { organizationId } = req.body;
    if (!organizationId) throw new AppError('organizationId is required', 400);

    const record = await prisma.dnsRecord.findFirst({
      where: { id, organizationId },
    });
    if (!record) throw new AppError('Record not found', 404);

    const updated = await infraMonitorService.checkSingleRecord(id, organizationId);
    res.json({ success: true, data: updated });
  })
);

// GET /api/infrastructure/scan-status?organizationId=...
router.get(
  '/scan-status',
  authenticate,
  requirePermission('infrastructure', 'view'),
  asyncHandler(async (req, res) => {
    const { organizationId } = req.query;
    if (!organizationId) throw new AppError('organizationId is required', 400);

    const latestScan = await prisma.infraMonitorScanLog.findFirst({
      where: { organizationId: organizationId as string },
      orderBy: { startedAt: 'desc' },
    });
    res.json({ success: true, data: latestScan });
  })
);

// GET /api/infrastructure/scan-history?organizationId=...
router.get(
  '/scan-history',
  authenticate,
  requirePermission('infrastructure', 'view'),
  asyncHandler(async (req, res) => {
    const { organizationId, limit = '10' } = req.query;
    if (!organizationId) throw new AppError('organizationId is required', 400);

    const scans = await prisma.infraMonitorScanLog.findMany({
      where: { organizationId: organizationId as string },
      orderBy: { startedAt: 'desc' },
      take: Number(limit),
    });
    res.json({ success: true, data: scans });
  })
);

// ============================================
// EXPORT REPORT
// ============================================

// GET /api/infrastructure/export?organizationId=...&format=csv
router.get(
  '/export',
  authenticate,
  requirePermission('infrastructure', 'view'),
  asyncHandler(async (req, res) => {
    const { organizationId } = req.query;
    if (!organizationId) throw new AppError('organizationId is required', 400);

    const records = await prisma.dnsRecord.findMany({
      where: { organizationId: organizationId as string },
      include: {
        zone: { select: { name: true } },
      },
      orderBy: [
        { exposureStatus: 'asc' },
        { name: 'asc' },
      ],
    });

    const lastScan = await prisma.infraMonitorScanLog.findFirst({
      where: { organizationId: organizationId as string, status: 'completed' },
      orderBy: { completedAt: 'desc' },
    });

    // Build CSV
    const headers = [
      'Domain',
      'Zone',
      'Record Type',
      'Content',
      'Proxied',
      'Exposure Status',
      'HTTP Status Code',
      'Response Time (ms)',
      'Origin Protected',
      'Origin Exposure Type',
      'Origin Exposure Details',
      'Last Checked',
      'Error',
    ];

    const escCsv = (val: string) => {
      if (val.includes(',') || val.includes('"') || val.includes('\n')) {
        return `"${val.replace(/"/g, '""')}"`;
      }
      return val;
    };

    const rows = records.map(r => [
      escCsv(r.name),
      escCsv(r.zone?.name || ''),
      r.type,
      escCsv(r.content),
      r.proxied ? 'Yes' : 'No',
      r.exposureStatus,
      r.httpStatusCode?.toString() || '',
      r.responseTimeMs?.toString() || '',
      r.originProtected === null ? 'N/A' : r.originProtected ? 'Yes' : 'No',
      r.originExposureType || '',
      escCsv(r.originExposureDetails || ''),
      r.lastCheckedAt ? new Date(r.lastCheckedAt).toISOString() : '',
      escCsv(r.checkError || ''),
    ].join(','));

    // Add report header
    const reportDate = new Date().toISOString().split('T')[0];
    const reportHeader = [
      `# Infrastructure Exposure Report`,
      `# Generated: ${new Date().toISOString()}`,
      `# Last Scan: ${lastScan?.completedAt ? new Date(lastScan.completedAt).toISOString() : 'Never'}`,
      `# Total Records: ${records.length}`,
      `# Public: ${records.filter(r => r.exposureStatus === 'PUBLIC').length}`,
      `# Private: ${records.filter(r => r.exposureStatus === 'PRIVATE').length}`,
      `# Unreachable: ${records.filter(r => r.exposureStatus === 'UNREACHABLE').length}`,
      '',
    ];

    const csv = [...reportHeader, headers.join(','), ...rows].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="infrastructure-exposure-report-${reportDate}.csv"`);
    res.send(csv);
  })
);

export default router;
