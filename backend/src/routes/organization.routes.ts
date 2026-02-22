import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import { prisma } from '../index.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { authenticate, requirePermission, AuthenticatedRequest } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { createOrganizationValidator, uuidParam, paginationQuery } from '../middleware/validators.js';
import { createAuditLog } from '../services/audit.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOGOS_DIR = path.join(__dirname, '..', '..', 'uploads', 'logos');

const logoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'].includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only PNG, JPEG, WebP, and SVG images are allowed'));
    }
  },
});

const router = Router();

// Create organization
router.post(
  '/',
  authenticate,
  createOrganizationValidator,
  validate,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const { name, slug, description } = req.body;

    // Generate slug from name if not provided
    const orgSlug = slug || name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');

    // Check if slug is unique
    const existingOrg = await prisma.organization.findUnique({
      where: { slug: orgSlug },
    });

    if (existingOrg) {
      throw new AppError('Organization with this slug already exists', 409);
    }

    // Create organization with current user as admin
    const organization = await prisma.organization.create({
      data: {
        name,
        slug: orgSlug,
        description,
        members: {
          create: {
            userId: authReq.user.id,
            role: 'ADMIN',
            isDefault: true,
          },
        },
      },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
    });

    await createAuditLog({
      userId: authReq.user.id,
      organizationId: organization.id,
      action: 'CREATE',
      entityType: 'Organization',
      entityId: organization.id,
      newValues: { name, slug: orgSlug },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.status(201).json({
      success: true,
      data: organization,
    });
  })
);

// Get user's organizations
router.get(
  '/',
  authenticate,
  paginationQuery,
  validate,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const { page = 1, limit = 20 } = req.query;

    // Admin sees all organizations
    const where = authReq.user.role === 'ADMIN'
      ? {}
      : {
          members: {
            some: {
              userId: authReq.user.id,
            },
          },
        };

    const [organizations, total] = await Promise.all([
      prisma.organization.findMany({
        where,
        include: {
          _count: {
            select: {
              members: true,
              assets: true,
              risks: true,
              controls: true,
            },
          },
        },
        orderBy: { name: 'asc' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
      prisma.organization.count({ where }),
    ]);

    res.json({
      success: true,
      data: organizations,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit)),
      },
    });
  })
);

// Get organization by ID
router.get(
  '/:organizationId',
  authenticate,
  uuidParam('organizationId'),
  validate,
  requirePermission('settings', 'view'),
  asyncHandler(async (req, res) => {
    const { organizationId } = req.params;

    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                avatar: true,
                designation: true,
              },
            },
          },
        },
        _count: {
          select: {
            assets: true,
            risks: true,
            controls: true,
            incidents: true,
          },
        },
      },
    });

    if (!organization) {
      throw new AppError('Organization not found', 404);
    }

    res.json({
      success: true,
      data: organization,
    });
  })
);

// Update organization
router.patch(
  '/:organizationId',
  authenticate,
  uuidParam('organizationId'),
  validate,
  requirePermission('settings', 'edit'),
  asyncHandler(async (req, res) => {
    const { organizationId } = req.params;
    const authReq = req as AuthenticatedRequest;
    const { name, description, logo, riskAcceptConfidentiality, riskAcceptIntegrity, riskAcceptAvailability, enabledServices } = req.body;

    const existingOrg = await prisma.organization.findUnique({ where: { id: organizationId } });
    if (!existingOrg) {
      throw new AppError('Organization not found', 404);
    }

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (logo !== undefined) updateData.logo = logo;
    if (riskAcceptConfidentiality !== undefined) updateData.riskAcceptConfidentiality = riskAcceptConfidentiality;
    if (riskAcceptIntegrity !== undefined) updateData.riskAcceptIntegrity = riskAcceptIntegrity;
    if (riskAcceptAvailability !== undefined) updateData.riskAcceptAvailability = riskAcceptAvailability;
    if (enabledServices !== undefined) {
      const validServices = ['cloudflare', 'google_workspace', 'azure'];
      const filtered = (enabledServices as string[]).filter(s => validServices.includes(s));
      updateData.enabledServices = filtered;
    }

    const organization = await prisma.organization.update({
      where: { id: organizationId },
      data: updateData,
    });

    await createAuditLog({
      userId: authReq.user.id,
      organizationId,
      action: 'UPDATE',
      entityType: 'Organization',
      entityId: organizationId,
      oldValues: { name: existingOrg.name },
      newValues: updateData,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({
      success: true,
      data: organization,
    });
  })
);

// Upload organization logo (saved to disk under uploads/logos/)
router.post(
  '/:organizationId/logo',
  authenticate,
  uuidParam('organizationId'),
  validate,
  requirePermission('settings', 'edit'),
  logoUpload.single('logo'),
  asyncHandler(async (req, res) => {
    const { organizationId } = req.params;
    const authReq = req as AuthenticatedRequest;

    if (!req.file) throw new AppError('Logo file is required', 400);

    const existingOrg = await prisma.organization.findUnique({ where: { id: organizationId } });
    if (!existingOrg) throw new AppError('Organization not found', 404);

    // Ensure logos directory exists
    await fs.mkdir(LOGOS_DIR, { recursive: true });

    // Delete old logo file if exists
    if (existingOrg.logo) {
      const oldPath = path.join(__dirname, '..', '..', existingOrg.logo.replace(/^\/uploads\//, 'uploads/'));
      try { await fs.unlink(oldPath); } catch { /* ignore if missing */ }
    }

    // Save new logo to disk
    const ext = path.extname(req.file.originalname) || '.png';
    const filename = `${organizationId}${ext}`;
    const filePath = path.join(LOGOS_DIR, filename);
    await fs.writeFile(filePath, req.file.buffer);

    const logoUrl = `/uploads/logos/${filename}`;

    await prisma.organization.update({
      where: { id: organizationId },
      data: { logo: logoUrl },
    });

    await createAuditLog({
      userId: authReq.user.id,
      organizationId,
      action: 'UPDATE',
      entityType: 'Organization',
      entityId: organizationId,
      oldValues: { logo: existingOrg.logo },
      newValues: { logo: logoUrl },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({ success: true, data: { logo: logoUrl } });
  })
);

// Add member to organization
router.post(
  '/:organizationId/members',
  authenticate,
  uuidParam('organizationId'),
  validate,
  requirePermission('users', 'edit'),
  asyncHandler(async (req, res) => {
    const { organizationId } = req.params;
    const authReq = req as AuthenticatedRequest;
    const { email, role = 'USER' } = req.body;

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!user) {
      throw new AppError('User not found with this email', 404);
    }

    // Check if already a member
    const existingMembership = await prisma.organizationMember.findUnique({
      where: {
        userId_organizationId: {
          userId: user.id,
          organizationId,
        },
      },
    });

    if (existingMembership) {
      throw new AppError('User is already a member of this organization', 409);
    }

    const membership = await prisma.organizationMember.create({
      data: {
        userId: user.id,
        organizationId,
        role,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            avatar: true,
          },
        },
      },
    });

    await createAuditLog({
      userId: authReq.user.id,
      organizationId,
      action: 'CREATE',
      entityType: 'OrganizationMember',
      entityId: membership.id,
      newValues: { userId: user.id, role },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.status(201).json({
      success: true,
      data: membership,
    });
  })
);

// Update member role
router.patch(
  '/:organizationId/members/:memberId',
  authenticate,
  uuidParam('organizationId'),
  uuidParam('memberId'),
  validate,
  requirePermission('users', 'edit'),
  asyncHandler(async (req, res) => {
    const { organizationId, memberId } = req.params;
    const authReq = req as AuthenticatedRequest;
    const { role, orgRoleId } = req.body;

    const membership = await prisma.organizationMember.findFirst({
      where: {
        id: memberId,
        organizationId,
      },
    });

    if (!membership) {
      throw new AppError('Member not found', 404);
    }

    // Prevent removing last admin
    if (role && membership.role === 'ADMIN' && role !== 'ADMIN') {
      const adminCount = await prisma.organizationMember.count({
        where: {
          organizationId,
          role: 'ADMIN',
        },
      });

      if (adminCount <= 1) {
        throw new AppError('Cannot remove the last admin from organization', 400);
      }
    }

    // Validate orgRoleId belongs to this organization
    if (orgRoleId) {
      const orgRole = await prisma.orgRole.findFirst({
        where: { id: orgRoleId, organizationId },
      });
      if (!orgRole) {
        throw new AppError('Role not found in this organization', 404);
      }
    }

    const updateData: any = {};
    if (role !== undefined) updateData.role = role;
    if (orgRoleId !== undefined) updateData.orgRoleId = orgRoleId || null;

    const updatedMembership = await prisma.organizationMember.update({
      where: { id: memberId },
      data: updateData,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    await createAuditLog({
      userId: authReq.user.id,
      organizationId,
      action: 'UPDATE',
      entityType: 'OrganizationMember',
      entityId: memberId,
      oldValues: { role: membership.role },
      newValues: { role },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({
      success: true,
      data: updatedMembership,
    });
  })
);

// Remove member from organization
router.delete(
  '/:organizationId/members/:memberId',
  authenticate,
  uuidParam('organizationId'),
  uuidParam('memberId'),
  validate,
  requirePermission('users', 'edit'),
  asyncHandler(async (req, res) => {
    const { organizationId, memberId } = req.params;
    const authReq = req as AuthenticatedRequest;

    const membership = await prisma.organizationMember.findFirst({
      where: {
        id: memberId,
        organizationId,
      },
    });

    if (!membership) {
      throw new AppError('Member not found', 404);
    }

    // Prevent removing self
    if (membership.userId === authReq.user.id) {
      throw new AppError('You cannot remove yourself from the organization', 400);
    }

    // Prevent removing last admin
    if (membership.role === 'ADMIN') {
      const adminCount = await prisma.organizationMember.count({
        where: {
          organizationId,
          role: 'ADMIN',
        },
      });

      if (adminCount <= 1) {
        throw new AppError('Cannot remove the last admin from organization', 400);
      }
    }

    await prisma.organizationMember.delete({
      where: { id: memberId },
    });

    await createAuditLog({
      userId: authReq.user.id,
      organizationId,
      action: 'DELETE',
      entityType: 'OrganizationMember',
      entityId: memberId,
      oldValues: { userId: membership.userId, role: membership.role },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({
      success: true,
      message: 'Member removed successfully',
    });
  })
);

export default router;
