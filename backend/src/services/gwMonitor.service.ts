import { prisma } from '../index.js';
import { createGoogleWorkspaceClient } from './googleWorkspace.service.js';
import { logger } from '../utils/logger.js';

const HIGH_RISK_PATTERNS = ['gmail', 'mail.google', 'drive', 'calendar', 'admin', 'spreadsheets'];
const MEDIUM_RISK_PATTERNS = ['readonly', 'contacts', 'userinfo', 'profile', 'openid'];

function computeOAuthRiskLevel(scopes: string[]): string {
  const scopeStr = scopes.join(' ').toLowerCase();
  if (HIGH_RISK_PATTERNS.some(p => scopeStr.includes(p))) return 'HIGH';
  if (MEDIUM_RISK_PATTERNS.some(p => scopeStr.includes(p))) return 'MEDIUM';
  return 'LOW';
}

interface CisCheckDef {
  id: string;
  category: string;
  title: string;
  description: string;
  check: (orgId: string) => Promise<{ status: string; details: string }>;
}

const CIS_CHECKS: CisCheckDef[] = [
  {
    id: '1.1',
    category: 'Authentication',
    title: 'All admin accounts have 2FA enrolled',
    description: 'Ensure all super admin and delegated admin accounts have two-step verification enrolled.',
    check: async (orgId) => {
      const admins = await prisma.gWorkspaceUser.findMany({
        where: { organizationId: orgId, isAdmin: true, suspended: false },
      });
      const failing = admins.filter(u => !u.isEnrolledIn2Sv);
      if (admins.length === 0) return { status: 'WARNING', details: 'No admin accounts found' };
      return {
        status: failing.length === 0 ? 'PASS' : 'FAIL',
        details: `${admins.length - failing.length}/${admins.length} admin accounts have 2FA enrolled${failing.length > 0 ? '. Missing: ' + failing.map(u => u.primaryEmail).join(', ') : ''}`,
      };
    },
  },
  {
    id: '1.2',
    category: 'Authentication',
    title: 'All users have 2FA enrolled',
    description: 'Ensure all user accounts have two-step verification enrolled.',
    check: async (orgId) => {
      const total = await prisma.gWorkspaceUser.count({ where: { organizationId: orgId, suspended: false, archived: false } });
      const enrolled = await prisma.gWorkspaceUser.count({ where: { organizationId: orgId, suspended: false, archived: false, isEnrolledIn2Sv: true } });
      if (total === 0) return { status: 'WARNING', details: 'No active users found' };
      const pct = Math.round((enrolled / total) * 100);
      return {
        status: pct === 100 ? 'PASS' : pct >= 80 ? 'WARNING' : 'FAIL',
        details: `${enrolled}/${total} users (${pct}%) have 2FA enrolled`,
      };
    },
  },
  {
    id: '1.3',
    category: 'Authentication',
    title: '2FA enforcement enabled for all users',
    description: 'Ensure two-step verification is enforced (not just enrolled) for all user accounts.',
    check: async (orgId) => {
      const total = await prisma.gWorkspaceUser.count({ where: { organizationId: orgId, suspended: false, archived: false } });
      const enforced = await prisma.gWorkspaceUser.count({ where: { organizationId: orgId, suspended: false, archived: false, isEnforcedIn2Sv: true } });
      if (total === 0) return { status: 'WARNING', details: 'No active users found' };
      const pct = Math.round((enforced / total) * 100);
      return {
        status: pct === 100 ? 'PASS' : pct >= 80 ? 'WARNING' : 'FAIL',
        details: `${enforced}/${total} users (${pct}%) have 2FA enforced`,
      };
    },
  },
  {
    id: '2.1',
    category: 'Applications',
    title: 'No high-risk third-party OAuth apps',
    description: 'Review third-party applications with access to sensitive scopes (Gmail, Drive, Admin).',
    check: async (orgId) => {
      const highRisk = await prisma.gWorkspaceOAuthApp.count({ where: { organizationId: orgId, riskLevel: 'HIGH' } });
      const total = await prisma.gWorkspaceOAuthApp.count({ where: { organizationId: orgId } });
      return {
        status: highRisk === 0 ? 'PASS' : 'FAIL',
        details: `${highRisk} high-risk apps out of ${total} total OAuth apps`,
      };
    },
  },
  {
    id: '2.2',
    category: 'Applications',
    title: 'No unverified (anonymous) OAuth apps',
    description: 'Ensure no unverified third-party applications have been granted access.',
    check: async (orgId) => {
      const unverified = await prisma.gWorkspaceOAuthApp.count({ where: { organizationId: orgId, anonymous: true } });
      return {
        status: unverified === 0 ? 'PASS' : 'WARNING',
        details: `${unverified} unverified OAuth app(s) detected`,
      };
    },
  },
  {
    id: '6.1',
    category: 'Groups',
    title: 'No groups allow external members',
    description: 'Ensure no Google Groups allow external (outside domain) members.',
    check: async (orgId) => {
      const externalGroups = await prisma.gWorkspaceGroup.findMany({
        where: { organizationId: orgId, allowExternalMembers: true },
      });
      return {
        status: externalGroups.length === 0 ? 'PASS' : 'FAIL',
        details: externalGroups.length === 0
          ? 'No groups allow external members'
          : `${externalGroups.length} group(s) allow external members: ${externalGroups.slice(0, 5).map(g => g.email).join(', ')}${externalGroups.length > 5 ? '...' : ''}`,
      };
    },
  },
  {
    id: '6.2',
    category: 'Groups',
    title: 'Groups not publicly joinable',
    description: 'Ensure no Google Groups are set to allow anyone to join without approval.',
    check: async (orgId) => {
      const publicGroups = await prisma.gWorkspaceGroup.findMany({
        where: { organizationId: orgId, whoCanJoin: 'ANYONE_CAN_JOIN' },
      });
      return {
        status: publicGroups.length === 0 ? 'PASS' : 'FAIL',
        details: publicGroups.length === 0
          ? 'No groups are publicly joinable'
          : `${publicGroups.length} group(s) are publicly joinable: ${publicGroups.slice(0, 5).map(g => g.email).join(', ')}${publicGroups.length > 5 ? '...' : ''}`,
      };
    },
  },
  {
    id: '7.1',
    category: 'Devices',
    title: 'No compromised mobile devices',
    description: 'Ensure no enrolled mobile devices have a compromised or rooted status.',
    check: async (orgId) => {
      const compromised = await prisma.gWorkspaceMobileDevice.count({
        where: {
          organizationId: orgId,
          compromisedStatus: { not: null, notIn: ['No compromise detected', 'NO_COMPROMISE_DETECTED', 'Undetected', ''] },
        },
      });
      const total = await prisma.gWorkspaceMobileDevice.count({ where: { organizationId: orgId } });
      if (total === 0) return { status: 'PASS', details: 'No mobile devices enrolled' };
      return {
        status: compromised === 0 ? 'PASS' : 'FAIL',
        details: `${compromised} compromised device(s) out of ${total} total`,
      };
    },
  },
  {
    id: '7.2',
    category: 'Devices',
    title: 'All mobile devices encrypted',
    description: 'Ensure all enrolled mobile devices have encryption enabled.',
    check: async (orgId) => {
      const total = await prisma.gWorkspaceMobileDevice.count({ where: { organizationId: orgId } });
      const unencrypted = await prisma.gWorkspaceMobileDevice.count({
        where: { organizationId: orgId, encryptionStatus: { not: null, notIn: ['Encrypted', 'ENCRYPTED', ''] } },
      });
      if (total === 0) return { status: 'PASS', details: 'No mobile devices enrolled' };
      return {
        status: unencrypted === 0 ? 'PASS' : 'WARNING',
        details: `${unencrypted} unencrypted device(s) out of ${total} total`,
      };
    },
  },
  {
    id: 'U.1',
    category: 'Users',
    title: 'No stale suspended accounts',
    description: 'Identify suspended accounts that had recent login activity before suspension.',
    check: async (orgId) => {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const stale = await prisma.gWorkspaceUser.count({
        where: { organizationId: orgId, suspended: true, lastLoginTime: { gte: thirtyDaysAgo } },
      });
      return {
        status: stale === 0 ? 'PASS' : 'WARNING',
        details: `${stale} suspended account(s) had login activity in the last 30 days`,
      };
    },
  },
  {
    id: 'U.2',
    category: 'Users',
    title: 'No users with forced password change pending',
    description: 'Ensure no accounts have the "change password at next login" flag set.',
    check: async (orgId) => {
      const pending = await prisma.gWorkspaceUser.count({
        where: { organizationId: orgId, suspended: false, changePasswordAtNextLogin: true },
      });
      return {
        status: pending === 0 ? 'PASS' : 'WARNING',
        details: `${pending} user(s) have a pending forced password change`,
      };
    },
  },
  {
    id: '3.1',
    category: 'Admin Roles',
    title: 'Minimal super admin accounts',
    description: 'Ensure no more than 3 users have super admin privileges.',
    check: async (orgId) => {
      const superAdminRoles = await prisma.gWorkspaceAdminRole.findMany({
        where: { organizationId: orgId, isSuperAdminRole: true },
      });
      const superAdminRoleIds = superAdminRoles.map(r => r.id);
      if (superAdminRoleIds.length === 0) return { status: 'PASS', details: 'No super admin roles found (roles not yet synced)' };
      const superAdminCount = await prisma.gWorkspaceRoleAssignment.count({
        where: { organizationId: orgId, roleId: { in: superAdminRoleIds } },
      });
      return {
        status: superAdminCount <= 3 ? 'PASS' : superAdminCount <= 5 ? 'WARNING' : 'FAIL',
        details: `${superAdminCount} user(s) have super admin role(s)`,
      };
    },
  },
  {
    id: '3.2',
    category: 'Admin Roles',
    title: 'Admin accounts have 2FA enrolled',
    description: 'All users with any admin role should have 2FA enrolled.',
    check: async (orgId) => {
      const adminAssignments = await prisma.gWorkspaceRoleAssignment.findMany({
        where: { organizationId: orgId },
        select: { assignedTo: true },
        distinct: ['assignedTo'],
      });
      const adminUserIds = adminAssignments.map(a => a.assignedTo);
      if (adminUserIds.length === 0) return { status: 'PASS', details: 'No admin role assignments found' };
      const without2fa = await prisma.gWorkspaceUser.count({
        where: { organizationId: orgId, googleUserId: { in: adminUserIds }, isEnrolledIn2Sv: false, suspended: false },
      });
      return {
        status: without2fa === 0 ? 'PASS' : 'FAIL',
        details: `${without2fa} admin user(s) without 2FA out of ${adminUserIds.length} total admin users`,
      };
    },
  },
  {
    id: '4.1',
    category: 'Org Units',
    title: 'Review org units with risk tags',
    description: 'Org units with special permissions (external sharing, email exemptions) should be periodically reviewed.',
    check: async (orgId) => {
      const riskyOus = await prisma.gWorkspaceOrgUnit.findMany({
        where: { organizationId: orgId, riskTags: { isEmpty: false } },
      });
      const totalOus = await prisma.gWorkspaceOrgUnit.count({ where: { organizationId: orgId } });
      if (riskyOus.length === 0) return { status: 'PASS', details: `${totalOus} org unit(s), none flagged with risk tags` };
      const userCount = riskyOus.reduce((sum, ou) => sum + ou.userCount, 0);
      return {
        status: 'WARNING',
        details: `${riskyOus.length} OU(s) with risk tags affecting ${userCount} user(s): ${riskyOus.map(ou => ou.name).join(', ')}`,
      };
    },
  },
];

class GWorkspaceMonitorService {
  async runFullScan(organizationId: string, triggeredBy: string = 'cron') {
    const config = await prisma.gWorkspaceConfig.findUnique({
      where: { organizationId },
    });
    if (!config || !config.serviceAccountKey) {
      throw new Error('Google Workspace not configured for this organization');
    }

    const client = createGoogleWorkspaceClient({
      serviceAccountKey: config.serviceAccountKey,
      adminEmail: config.adminEmail,
      domain: config.domain || undefined,
    });

    const scanLog = await prisma.gWorkspaceScanLog.create({
      data: { organizationId, triggeredBy, status: 'running', totalPhases: 8 },
    });

    try {
      // Phase 1: Users
      await this.updatePhase(scanLog.id, 'users', 0);
      const users = await client.listAllUsers();
      for (const user of users) {
        await prisma.gWorkspaceUser.upsert({
          where: { organizationId_googleUserId: { organizationId, googleUserId: user.id } },
          update: {
            primaryEmail: user.primaryEmail || '',
            fullName: user.name?.fullName || `${user.name?.givenName || ''} ${user.name?.familyName || ''}`.trim() || '',
            isAdmin: user.isAdmin || false,
            isDelegatedAdmin: user.isDelegatedAdmin || false,
            suspended: user.suspended || false,
            archived: user.archived || false,
            isEnrolledIn2Sv: user.isEnrolledIn2Sv || false,
            isEnforcedIn2Sv: user.isEnforcedIn2Sv || false,
            lastLoginTime: user.lastLoginTime ? new Date(user.lastLoginTime) : null,
            creationTime: user.creationTime ? new Date(user.creationTime) : null,
            orgUnitPath: user.orgUnitPath || null,
            changePasswordAtNextLogin: user.changePasswordAtNextLogin || false,
          },
          create: {
            organizationId,
            googleUserId: user.id,
            primaryEmail: user.primaryEmail || '',
            fullName: user.name?.fullName || `${user.name?.givenName || ''} ${user.name?.familyName || ''}`.trim() || '',
            isAdmin: user.isAdmin || false,
            isDelegatedAdmin: user.isDelegatedAdmin || false,
            suspended: user.suspended || false,
            archived: user.archived || false,
            isEnrolledIn2Sv: user.isEnrolledIn2Sv || false,
            isEnforcedIn2Sv: user.isEnforcedIn2Sv || false,
            lastLoginTime: user.lastLoginTime ? new Date(user.lastLoginTime) : null,
            creationTime: user.creationTime ? new Date(user.creationTime) : null,
            orgUnitPath: user.orgUnitPath || null,
            changePasswordAtNextLogin: user.changePasswordAtNextLogin || false,
          },
        });
      }
      await this.updatePhase(scanLog.id, 'users', 1);
      logger.info(`GW Scan [${organizationId}]: Phase 1 complete - ${users.length} users synced`);

      // Phase 2: Groups
      await this.updatePhase(scanLog.id, 'groups', 1);
      const groups = await client.listAllGroups();
      for (const group of groups) {
        const members = await client.getGroupMembers(group.id);
        const settings = await client.getGroupSettings(group.email);

        await prisma.gWorkspaceGroup.upsert({
          where: { organizationId_googleGroupId: { organizationId, googleGroupId: group.id } },
          update: {
            email: group.email || '',
            name: group.name || '',
            memberCount: members.length,
            allowExternalMembers: settings?.allowExternalMembers === 'true',
            whoCanJoin: settings?.whoCanJoin || null,
            whoCanPostMessage: settings?.whoCanPostMessage || null,
          },
          create: {
            organizationId,
            googleGroupId: group.id,
            email: group.email || '',
            name: group.name || '',
            memberCount: members.length,
            allowExternalMembers: settings?.allowExternalMembers === 'true',
            whoCanJoin: settings?.whoCanJoin || null,
            whoCanPostMessage: settings?.whoCanPostMessage || null,
          },
        });
      }
      await this.updatePhase(scanLog.id, 'groups', 2);
      logger.info(`GW Scan [${organizationId}]: Phase 2 complete - ${groups.length} groups synced`);

      // Phase 3: OAuth Apps (batch 10 users at a time)
      await this.updatePhase(scanLog.id, 'oauth', 2);
      const appAggregation: Record<string, { displayText: string; anonymous: boolean; scopes: Set<string>; userCount: number }> = {};
      const BATCH_SIZE = 10;

      for (let i = 0; i < users.length; i += BATCH_SIZE) {
        const batch = users.slice(i, i + BATCH_SIZE);
        const results = await Promise.allSettled(
          batch.map(u => client.listUserTokens(u.primaryEmail))
        );

        for (const result of results) {
          if (result.status === 'fulfilled') {
            for (const token of result.value) {
              const key = token.clientId || 'unknown';
              if (!appAggregation[key]) {
                appAggregation[key] = {
                  displayText: token.displayText || 'Unknown App',
                  anonymous: token.anonymous || false,
                  scopes: new Set(),
                  userCount: 0,
                };
              }
              appAggregation[key].userCount++;
              if (token.scopes) {
                token.scopes.forEach((s: string) => appAggregation[key].scopes.add(s));
              }
            }
          }
        }
      }

      // Upsert aggregated OAuth apps
      for (const [clientId, app] of Object.entries(appAggregation)) {
        const scopesArr = Array.from(app.scopes);
        await prisma.gWorkspaceOAuthApp.upsert({
          where: { organizationId_clientId: { organizationId, clientId } },
          update: {
            displayText: app.displayText,
            anonymous: app.anonymous,
            scopes: scopesArr,
            userCount: app.userCount,
            riskLevel: computeOAuthRiskLevel(scopesArr),
          },
          create: {
            organizationId,
            clientId,
            displayText: app.displayText,
            anonymous: app.anonymous,
            scopes: scopesArr,
            userCount: app.userCount,
            riskLevel: computeOAuthRiskLevel(scopesArr),
          },
        });
      }
      await this.updatePhase(scanLog.id, 'oauth', 3);
      logger.info(`GW Scan [${organizationId}]: Phase 3 complete - ${Object.keys(appAggregation).length} OAuth apps aggregated`);

      // Phase 4: Mobile Devices
      await this.updatePhase(scanLog.id, 'devices', 3);
      const devices = await client.listMobileDevices();
      for (const device of devices) {
        await prisma.gWorkspaceMobileDevice.upsert({
          where: { organizationId_googleDeviceId: { organizationId, googleDeviceId: device.resourceId || device.deviceId } },
          update: {
            deviceType: device.type || 'UNKNOWN',
            model: device.model || null,
            os: device.os || null,
            status: device.status || null,
            compromisedStatus: device.deviceCompromisedStatus || null,
            encryptionStatus: device.encryptionStatus || null,
            lastSync: device.lastSync ? new Date(device.lastSync) : null,
            ownerEmail: device.email?.[0] || null,
          },
          create: {
            organizationId,
            googleDeviceId: device.resourceId || device.deviceId,
            deviceType: device.type || 'UNKNOWN',
            model: device.model || null,
            os: device.os || null,
            status: device.status || null,
            compromisedStatus: device.deviceCompromisedStatus || null,
            encryptionStatus: device.encryptionStatus || null,
            lastSync: device.lastSync ? new Date(device.lastSync) : null,
            ownerEmail: device.email?.[0] || null,
          },
        });
      }
      await this.updatePhase(scanLog.id, 'devices', 4);
      logger.info(`GW Scan [${organizationId}]: Phase 4 complete - ${devices.length} devices synced`);

      // Phase 5: Alerts
      await this.updatePhase(scanLog.id, 'alerts', 4);
      const alerts = await client.listAlerts();
      for (const alert of alerts) {
        await prisma.gWorkspaceAlert.upsert({
          where: { organizationId_googleAlertId: { organizationId, googleAlertId: alert.alertId } },
          update: {
            type: alert.type || 'UNKNOWN',
            source: alert.source || null,
            severity: alert.metadata?.severity || 'MEDIUM',
            status: alert.metadata?.status || 'ACTIVE',
            startTime: alert.startTime ? new Date(alert.startTime) : null,
            endTime: alert.endTime ? new Date(alert.endTime) : null,
            description: alert.data ? JSON.stringify(alert.data) : null,
          },
          create: {
            organizationId,
            googleAlertId: alert.alertId,
            type: alert.type || 'UNKNOWN',
            source: alert.source || null,
            severity: alert.metadata?.severity || 'MEDIUM',
            status: alert.metadata?.status || 'ACTIVE',
            startTime: alert.startTime ? new Date(alert.startTime) : null,
            endTime: alert.endTime ? new Date(alert.endTime) : null,
            description: alert.data ? JSON.stringify(alert.data) : null,
          },
        });
      }
      await this.updatePhase(scanLog.id, 'alerts', 5);
      logger.info(`GW Scan [${organizationId}]: Phase 5 complete - ${alerts.length} alerts synced`);

      // Phase 6: CIS Checks (run before org units/roles so checks can use the data from later phases on subsequent scans)
      await this.updatePhase(scanLog.id, 'cis', 5);
      await this.runCisChecks(organizationId, scanLog.id);
      logger.info(`GW Scan [${organizationId}]: Phase 6 complete - CIS checks executed`);

      // Phase 7: Org Units
      await this.updatePhase(scanLog.id, 'orgUnits', 6);
      const orgUnits = await client.listOrgUnits();

      // Build user count per OU from already-synced users
      const userCountByOu: Record<string, number> = {};
      const allGwUsers = await prisma.gWorkspaceUser.findMany({
        where: { organizationId },
        select: { orgUnitPath: true },
      });
      for (const u of allGwUsers) {
        const path = u.orgUnitPath || '/';
        userCountByOu[path] = (userCountByOu[path] || 0) + 1;
      }

      for (const ou of orgUnits) {
        await prisma.gWorkspaceOrgUnit.upsert({
          where: {
            organizationId_orgUnitId: { organizationId, orgUnitId: ou.orgUnitId },
          },
          update: {
            name: ou.name || '',
            description: ou.description || null,
            orgUnitPath: ou.orgUnitPath || '/',
            parentOrgUnitId: ou.parentOrgUnitId || null,
            parentOrgUnitPath: ou.parentOrgUnitPath || null,
            blockInheritance: ou.blockInheritance || false,
            userCount: userCountByOu[ou.orgUnitPath] || 0,
            // riskTags and riskNotes intentionally NOT overwritten
          },
          create: {
            organizationId,
            orgUnitId: ou.orgUnitId,
            name: ou.name || '',
            description: ou.description || null,
            orgUnitPath: ou.orgUnitPath || '/',
            parentOrgUnitId: ou.parentOrgUnitId || null,
            parentOrgUnitPath: ou.parentOrgUnitPath || null,
            blockInheritance: ou.blockInheritance || false,
            userCount: userCountByOu[ou.orgUnitPath] || 0,
          },
        });
      }
      // Synthesize root OU "/" (Google API does not return it)
      await prisma.gWorkspaceOrgUnit.upsert({
        where: {
          organizationId_orgUnitId: { organizationId, orgUnitId: 'root_org_unit' },
        },
        update: {
          name: 'Root (Company)',
          orgUnitPath: '/',
          userCount: userCountByOu['/'] || 0,
        },
        create: {
          organizationId,
          orgUnitId: 'root_org_unit',
          name: 'Root (Company)',
          orgUnitPath: '/',
          userCount: userCountByOu['/'] || 0,
        },
      });
      logger.info(`GW Scan [${organizationId}]: Phase 7 complete - ${orgUnits.length} org units synced`);

      // Phase 8: Admin Roles & Assignments
      await this.updatePhase(scanLog.id, 'adminRoles', 7);
      const roles = await client.listAdminRoles();
      const roleIdMap: Record<string, string> = {};

      for (const role of roles) {
        const dbRole = await prisma.gWorkspaceAdminRole.upsert({
          where: {
            organizationId_googleRoleId: { organizationId, googleRoleId: String(role.roleId) },
          },
          update: {
            roleName: role.roleName || '',
            roleDescription: role.roleDescription || null,
            isSuperAdminRole: role.isSuperAdminRole || false,
            isSystemRole: role.isSystemRole || false,
            privilegeNames: (role.rolePrivileges || []).map((p: any) => p.privilegeName),
          },
          create: {
            organizationId,
            googleRoleId: String(role.roleId),
            roleName: role.roleName || '',
            roleDescription: role.roleDescription || null,
            isSuperAdminRole: role.isSuperAdminRole || false,
            isSystemRole: role.isSystemRole || false,
            privilegeNames: (role.rolePrivileges || []).map((p: any) => p.privilegeName),
          },
        });
        roleIdMap[String(role.roleId)] = dbRole.id;
      }

      const assignments = await client.listRoleAssignments();
      const userEmailMap: Record<string, string> = {};
      const gwUsersForRoles = await prisma.gWorkspaceUser.findMany({
        where: { organizationId },
        select: { googleUserId: true, primaryEmail: true },
      });
      for (const u of gwUsersForRoles) {
        userEmailMap[u.googleUserId] = u.primaryEmail;
      }

      // Delete stale assignments then re-create
      await prisma.gWorkspaceRoleAssignment.deleteMany({ where: { organizationId } });
      for (const assignment of assignments) {
        const dbRoleId = roleIdMap[String(assignment.roleId)];
        if (!dbRoleId) continue;
        await prisma.gWorkspaceRoleAssignment.create({
          data: {
            organizationId,
            assignmentId: String(assignment.roleAssignmentId),
            roleId: dbRoleId,
            assignedTo: assignment.assignedTo || '',
            assignedToEmail: userEmailMap[assignment.assignedTo] || null,
            scopeType: assignment.scopeType || 'CUSTOMER',
            orgUnitId: assignment.orgUnitId || null,
          },
        });
      }
      logger.info(`GW Scan [${organizationId}]: Phase 8 complete - ${roles.length} admin roles, ${assignments.length} assignments synced`);

      // Mark completed
      await prisma.gWorkspaceScanLog.update({
        where: { id: scanLog.id },
        data: {
          status: 'completed',
          phase: null,
          completedPhases: 8,
          currentPhaseProgress: 100,
          completedAt: new Date(),
        },
      });

      logger.info(`GW Scan completed for org ${organizationId}: ${users.length} users, ${groups.length} groups, ${Object.keys(appAggregation).length} apps, ${devices.length} devices, ${alerts.length} alerts, ${orgUnits.length} OUs, ${roles.length} admin roles`);
      return scanLog;
    } catch (error: any) {
      await prisma.gWorkspaceScanLog.update({
        where: { id: scanLog.id },
        data: {
          status: 'failed',
          error: error.message,
          completedAt: new Date(),
        },
      });
      logger.error(`GW Scan failed for org ${organizationId}:`, error);
      throw error;
    }
  }

  private async updatePhase(scanLogId: string, phase: string, completedPhases: number) {
    await prisma.gWorkspaceScanLog.update({
      where: { id: scanLogId },
      data: { phase, completedPhases },
    });
  }

  async runCisChecks(organizationId: string, scanLogId: string) {
    // Delete previous CIS checks for this scan
    await prisma.gWorkspaceCisCheck.deleteMany({ where: { scanLogId } });

    for (const check of CIS_CHECKS) {
      try {
        const result = await check.check(organizationId);
        await prisma.gWorkspaceCisCheck.create({
          data: {
            organizationId,
            scanLogId,
            checkId: check.id,
            category: check.category,
            title: check.title,
            description: check.description,
            status: result.status,
            details: result.details,
          },
        });
      } catch (error: any) {
        await prisma.gWorkspaceCisCheck.create({
          data: {
            organizationId,
            scanLogId,
            checkId: check.id,
            category: check.category,
            title: check.title,
            description: check.description,
            status: 'ERROR',
            details: `Check failed: ${error.message}`,
          },
        });
      }
    }
  }

  async runScheduledScans() {
    const configs = await prisma.gWorkspaceConfig.findMany({
      where: { isEnabled: true },
    });

    for (const config of configs) {
      try {
        const running = await prisma.gWorkspaceScanLog.findFirst({
          where: { organizationId: config.organizationId, status: 'running' },
        });
        if (running) {
          logger.info(`Skipping GW scheduled scan for org ${config.organizationId} - scan already running`);
          continue;
        }
        await this.runFullScan(config.organizationId, 'cron');
      } catch (error) {
        logger.error(`GW Scheduled scan failed for org ${config.organizationId}:`, error);
      }
    }
  }
}

export const gwMonitorService = new GWorkspaceMonitorService();
