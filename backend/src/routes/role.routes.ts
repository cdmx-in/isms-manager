import { Router } from 'express';
import { prisma } from '../index.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { authenticate, requirePermission, AuthenticatedRequest } from '../middleware/auth.js';
import { createAuditLog } from '../services/audit.service.js';
import {
  ALL_PERMISSIONS,
  MODULE_ACTIONS,
  MODULE_LABELS,
  MODULES,
  SYSTEM_ROLES,
  LEGACY_ROLE_TO_SYSTEM_NAME,
} from '../constants/permissions.js';

const router = Router();

// ============================================
// PERMISSION METADATA (public to authenticated users)
// ============================================

// Get available modules and their actions (for UI permission matrix)
router.get(
  '/permissions/modules',
  authenticate,
  (_req, res) => {
    const modules = MODULES.map(mod => ({
      key: mod,
      label: MODULE_LABELS[mod],
      actions: [...MODULE_ACTIONS[mod]],
    }));

    res.json({ success: true, data: modules });
  }
);

// ============================================
// ROLE CRUD (scoped to organization)
// ============================================

// List roles for an organization
router.get(
  '/organizations/:organizationId/roles',
  authenticate,
  requirePermission('users', 'view'),
  asyncHandler(async (req, res) => {
    const { organizationId } = req.params;

    const roles = await prisma.orgRole.findMany({
      where: { organizationId },
      include: {
        _count: { select: { members: true } },
      },
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    });

    res.json({ success: true, data: roles });
  })
);

// Create a custom role
router.post(
  '/organizations/:organizationId/roles',
  authenticate,
  requirePermission('users', 'edit'),
  asyncHandler(async (req, res) => {
    const { organizationId } = req.params;
    const authReq = req as AuthenticatedRequest;
    const { name, description, permissions } = req.body;

    if (!name || !permissions || !Array.isArray(permissions)) {
      throw new AppError('name and permissions (array) are required', 400);
    }

    // Validate permissions
    const invalid = permissions.filter((p: string) => !ALL_PERMISSIONS.includes(p as any));
    if (invalid.length > 0) {
      throw new AppError(`Invalid permissions: ${invalid.join(', ')}`, 400);
    }

    // Check for duplicate name
    const existing = await prisma.orgRole.findUnique({
      where: { organizationId_name: { organizationId, name } },
    });
    if (existing) {
      throw new AppError(`A role named "${name}" already exists in this organization`, 409);
    }

    const role = await prisma.orgRole.create({
      data: {
        organizationId,
        name,
        description: description || null,
        permissions,
        isSystem: false,
      },
    });

    await createAuditLog({
      userId: authReq.user.id,
      organizationId,
      action: 'CREATE',
      entityType: 'OrgRole',
      entityId: role.id,
      newValues: { name, permissions },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.status(201).json({ success: true, data: role });
  })
);

// Update a role
router.patch(
  '/organizations/:organizationId/roles/:roleId',
  authenticate,
  requirePermission('users', 'edit'),
  asyncHandler(async (req, res) => {
    const { organizationId, roleId } = req.params;
    const authReq = req as AuthenticatedRequest;
    const { name, description, permissions } = req.body;

    const role = await prisma.orgRole.findFirst({
      where: { id: roleId, organizationId },
    });

    if (!role) {
      throw new AppError('Role not found', 404);
    }

    // Cannot edit the Super Admin system role's permissions
    if (role.isSystem && role.name === 'Super Admin') {
      throw new AppError('The Super Admin role cannot be modified', 400);
    }

    const updateData: any = {};
    if (name !== undefined) {
      // Check for duplicate name (if changing)
      if (name !== role.name) {
        const existing = await prisma.orgRole.findUnique({
          where: { organizationId_name: { organizationId, name } },
        });
        if (existing) {
          throw new AppError(`A role named "${name}" already exists`, 409);
        }
      }
      updateData.name = name;
    }
    if (description !== undefined) updateData.description = description;
    if (permissions !== undefined) {
      if (!Array.isArray(permissions)) {
        throw new AppError('permissions must be an array', 400);
      }
      const invalid = permissions.filter((p: string) => !ALL_PERMISSIONS.includes(p as any));
      if (invalid.length > 0) {
        throw new AppError(`Invalid permissions: ${invalid.join(', ')}`, 400);
      }
      updateData.permissions = permissions;
    }

    const updated = await prisma.orgRole.update({
      where: { id: roleId },
      data: updateData,
    });

    await createAuditLog({
      userId: authReq.user.id,
      organizationId,
      action: 'UPDATE',
      entityType: 'OrgRole',
      entityId: roleId,
      oldValues: { name: role.name, permissions: role.permissions },
      newValues: updateData,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({ success: true, data: updated });
  })
);

// Delete a custom role
router.delete(
  '/organizations/:organizationId/roles/:roleId',
  authenticate,
  requirePermission('users', 'edit'),
  asyncHandler(async (req, res) => {
    const { organizationId, roleId } = req.params;
    const authReq = req as AuthenticatedRequest;

    const role = await prisma.orgRole.findFirst({
      where: { id: roleId, organizationId },
      include: { _count: { select: { members: true } } },
    });

    if (!role) {
      throw new AppError('Role not found', 404);
    }

    if (role.isSystem) {
      throw new AppError('System roles cannot be deleted', 400);
    }

    if (role._count.members > 0) {
      throw new AppError(
        `This role is assigned to ${role._count.members} member(s). Reassign them first.`,
        400
      );
    }

    await prisma.orgRole.delete({ where: { id: roleId } });

    await createAuditLog({
      userId: authReq.user.id,
      organizationId,
      action: 'DELETE',
      entityType: 'OrgRole',
      entityId: roleId,
      oldValues: { name: role.name },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({ success: true, message: 'Role deleted' });
  })
);

// ============================================
// SEED SYSTEM ROLES (admin utility)
// ============================================

// Seed system roles for an organization (idempotent)
router.post(
  '/organizations/:organizationId/roles/seed',
  authenticate,
  requirePermission('users', 'edit'),
  asyncHandler(async (req, res) => {
    const { organizationId } = req.params;

    let created = 0;
    for (const roleDef of SYSTEM_ROLES) {
      const existing = await prisma.orgRole.findUnique({
        where: { organizationId_name: { organizationId, name: roleDef.name } },
      });
      if (!existing) {
        await prisma.orgRole.create({
          data: {
            organizationId,
            name: roleDef.name,
            description: roleDef.description,
            permissions: [...roleDef.permissions],
            isSystem: true,
          },
        });
        created++;
      }
    }

    // Link existing members who don't have an orgRole yet
    if (req.body.linkMembers) {
      const members = await prisma.organizationMember.findMany({
        where: { organizationId, orgRoleId: null },
      });

      for (const member of members) {
        const systemRoleName = LEGACY_ROLE_TO_SYSTEM_NAME[member.role];
        if (systemRoleName) {
          const orgRole = await prisma.orgRole.findUnique({
            where: { organizationId_name: { organizationId, name: systemRoleName } },
          });
          if (orgRole) {
            await prisma.organizationMember.update({
              where: { id: member.id },
              data: { orgRoleId: orgRole.id },
            });
          }
        }
      }
    }

    res.json({
      success: true,
      message: `Seeded ${created} system roles`,
    });
  })
);

export default router;
