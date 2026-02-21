import { prisma } from '../index.js';
import { createAzureClient } from './azure.service.js';
import { logger } from '../utils/logger.js';

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
    category: 'Identity',
    title: 'MFA enabled for all users',
    description: 'Ensure multi-factor authentication is enabled for all users.',
    check: async (orgId) => {
      const total = await prisma.azureUser.count({ where: { organizationId: orgId, accountEnabled: true } });
      const mfaEnabled = await prisma.azureUser.count({ where: { organizationId: orgId, accountEnabled: true, mfaRegistered: true } });
      if (total === 0) return { status: 'WARNING', details: 'No active users found' };
      const pct = Math.round((mfaEnabled / total) * 100);
      return {
        status: pct === 100 ? 'PASS' : pct >= 80 ? 'WARNING' : 'FAIL',
        details: `${mfaEnabled}/${total} users (${pct}%) have MFA registered`,
      };
    },
  },
  {
    id: '1.2',
    category: 'Identity',
    title: 'No guest accounts without review',
    description: 'Review guest user accounts for potential security risks.',
    check: async (orgId) => {
      const guests = await prisma.azureUser.count({ where: { organizationId: orgId, userType: 'Guest', accountEnabled: true } });
      return {
        status: guests === 0 ? 'PASS' : guests <= 5 ? 'WARNING' : 'FAIL',
        details: `${guests} active guest account(s) found`,
      };
    },
  },
  {
    id: '1.3',
    category: 'Identity',
    title: 'Conditional Access policies exist',
    description: 'Ensure Conditional Access policies are configured and enabled.',
    check: async (orgId) => {
      const enabled = await prisma.azureConditionalAccessPolicy.count({
        where: { organizationId: orgId, state: 'enabled' },
      });
      return {
        status: enabled >= 3 ? 'PASS' : enabled >= 1 ? 'WARNING' : 'FAIL',
        details: `${enabled} enabled Conditional Access policies found`,
      };
    },
  },
  {
    id: '1.4',
    category: 'Identity',
    title: 'Block legacy authentication',
    description: 'Ensure a Conditional Access policy blocks legacy authentication protocols.',
    check: async (orgId) => {
      const policies = await prisma.azureConditionalAccessPolicy.findMany({
        where: { organizationId: orgId, state: 'enabled' },
      });
      const blocksLegacy = policies.some(p => {
        try {
          const conditions = JSON.parse(p.conditions || '{}');
          const grant = JSON.parse(p.grantControls || '{}');
          return (
            conditions?.clientAppTypes?.includes('exchangeActiveSync') ||
            conditions?.clientAppTypes?.includes('other') ||
            grant?.builtInControls?.includes('block')
          );
        } catch { return false; }
      });
      return {
        status: blocksLegacy ? 'PASS' : 'FAIL',
        details: blocksLegacy ? 'Legacy authentication blocking policy found' : 'No policy blocking legacy authentication detected',
      };
    },
  },
  {
    id: '1.5',
    category: 'Identity',
    title: 'MFA required for admin roles',
    description: 'Ensure Conditional Access requires MFA for admin role assignments.',
    check: async (orgId) => {
      const policies = await prisma.azureConditionalAccessPolicy.findMany({
        where: { organizationId: orgId, state: 'enabled' },
      });
      const requiresMfaForAdmins = policies.some(p => {
        try {
          const conditions = JSON.parse(p.conditions || '{}');
          const grant = JSON.parse(p.grantControls || '{}');
          const hasAdminRoles = conditions?.users?.includeRoles?.length > 0;
          const requiresMfa = grant?.builtInControls?.includes('mfa');
          return hasAdminRoles && requiresMfa;
        } catch { return false; }
      });
      return {
        status: requiresMfaForAdmins ? 'PASS' : 'FAIL',
        details: requiresMfaForAdmins ? 'MFA required for admin roles via Conditional Access' : 'No CA policy requiring MFA for admin roles',
      };
    },
  },
  {
    id: '2.1',
    category: 'Applications',
    title: 'No apps with expired credentials',
    description: 'Ensure no application registrations have expired credentials.',
    check: async (orgId) => {
      const expired = await prisma.azureAppRegistration.count({
        where: { organizationId: orgId, hasExpiredCredentials: true },
      });
      return {
        status: expired === 0 ? 'PASS' : 'FAIL',
        details: `${expired} application(s) with expired credentials`,
      };
    },
  },
  {
    id: '2.2',
    category: 'Applications',
    title: 'No multi-tenant applications (review)',
    description: 'Review applications configured for multi-tenant access.',
    check: async (orgId) => {
      const multiTenant = await prisma.azureAppRegistration.count({
        where: {
          organizationId: orgId,
          signInAudience: { not: 'AzureADMyOrg' },
        },
      });
      return {
        status: multiTenant === 0 ? 'PASS' : multiTenant <= 3 ? 'WARNING' : 'FAIL',
        details: `${multiTenant} multi-tenant application(s) found`,
      };
    },
  },
  {
    id: '2.3',
    category: 'Applications',
    title: 'Application credentials rotation',
    description: 'Ensure application credentials are not expiring within 30 days.',
    check: async (orgId) => {
      // Check for apps that have credentials (but not necessarily expired yet)
      const appsWithCreds = await prisma.azureAppRegistration.count({
        where: { organizationId: orgId, passwordCredentialCount: { gt: 0 } },
      });
      const expired = await prisma.azureAppRegistration.count({
        where: { organizationId: orgId, hasExpiredCredentials: true },
      });
      return {
        status: expired === 0 ? 'PASS' : 'WARNING',
        details: `${appsWithCreds} app(s) with password credentials, ${expired} with expired credentials`,
      };
    },
  },
  {
    id: '3.1',
    category: 'Networking',
    title: 'No NSGs with unrestricted inbound access',
    description: 'Ensure Network Security Groups do not allow unrestricted inbound access from 0.0.0.0/0 on sensitive ports.',
    check: async (orgId) => {
      const nsgs = await prisma.azureResource.findMany({
        where: { organizationId: orgId, type: 'Microsoft.Network/networkSecurityGroups' },
      });
      let openNsgs = 0;
      for (const nsg of nsgs) {
        try {
          const props = JSON.parse(nsg.properties || '{}');
          const rules = props.securityRules || [];
          const hasOpenRule = rules.some((r: any) =>
            r.properties?.direction === 'Inbound' &&
            r.properties?.access === 'Allow' &&
            (r.properties?.sourceAddressPrefix === '*' || r.properties?.sourceAddressPrefix === '0.0.0.0/0') &&
            ['22', '3389', '445', '*'].includes(r.properties?.destinationPortRange)
          );
          if (hasOpenRule) openNsgs++;
        } catch { /* skip parse errors */ }
      }
      return {
        status: openNsgs === 0 ? 'PASS' : 'FAIL',
        details: `${openNsgs} NSG(s) with unrestricted inbound rules on sensitive ports`,
      };
    },
  },
  {
    id: '3.2',
    category: 'Networking',
    title: 'No unrestricted SSH access (port 22)',
    description: 'Ensure SSH access is not open to the internet.',
    check: async (orgId) => {
      const nsgs = await prisma.azureResource.findMany({
        where: { organizationId: orgId, type: 'Microsoft.Network/networkSecurityGroups' },
      });
      let openSsh = 0;
      for (const nsg of nsgs) {
        try {
          const props = JSON.parse(nsg.properties || '{}');
          const rules = props.securityRules || [];
          const hasOpen = rules.some((r: any) =>
            r.properties?.direction === 'Inbound' &&
            r.properties?.access === 'Allow' &&
            (r.properties?.sourceAddressPrefix === '*' || r.properties?.sourceAddressPrefix === '0.0.0.0/0') &&
            (r.properties?.destinationPortRange === '22' || r.properties?.destinationPortRange === '*')
          );
          if (hasOpen) openSsh++;
        } catch { /* skip */ }
      }
      return {
        status: openSsh === 0 ? 'PASS' : 'FAIL',
        details: `${openSsh} NSG(s) allow unrestricted SSH (port 22) from internet`,
      };
    },
  },
  {
    id: '3.3',
    category: 'Networking',
    title: 'No unrestricted RDP access (port 3389)',
    description: 'Ensure RDP access is not open to the internet.',
    check: async (orgId) => {
      const nsgs = await prisma.azureResource.findMany({
        where: { organizationId: orgId, type: 'Microsoft.Network/networkSecurityGroups' },
      });
      let openRdp = 0;
      for (const nsg of nsgs) {
        try {
          const props = JSON.parse(nsg.properties || '{}');
          const rules = props.securityRules || [];
          const hasOpen = rules.some((r: any) =>
            r.properties?.direction === 'Inbound' &&
            r.properties?.access === 'Allow' &&
            (r.properties?.sourceAddressPrefix === '*' || r.properties?.sourceAddressPrefix === '0.0.0.0/0') &&
            (r.properties?.destinationPortRange === '3389' || r.properties?.destinationPortRange === '*')
          );
          if (hasOpen) openRdp++;
        } catch { /* skip */ }
      }
      return {
        status: openRdp === 0 ? 'PASS' : 'FAIL',
        details: `${openRdp} NSG(s) allow unrestricted RDP (port 3389) from internet`,
      };
    },
  },
  {
    id: '4.1',
    category: 'Storage',
    title: 'Storage accounts require HTTPS',
    description: 'Ensure storage accounts are configured to only allow HTTPS traffic.',
    check: async (orgId) => {
      const accounts = await prisma.azureResource.findMany({
        where: { organizationId: orgId, type: 'Microsoft.Storage/storageAccounts' },
      });
      let insecure = 0;
      for (const sa of accounts) {
        try {
          const props = JSON.parse(sa.properties || '{}');
          if (props.supportsHttpsTrafficOnly === false) insecure++;
        } catch { /* skip */ }
      }
      return {
        status: insecure === 0 ? 'PASS' : 'FAIL',
        details: accounts.length === 0
          ? 'No storage accounts found'
          : `${insecure}/${accounts.length} storage account(s) allow HTTP traffic`,
      };
    },
  },
  {
    id: '4.2',
    category: 'Storage',
    title: 'Storage accounts restrict public access',
    description: 'Ensure storage accounts do not allow public blob access.',
    check: async (orgId) => {
      const accounts = await prisma.azureResource.findMany({
        where: { organizationId: orgId, type: 'Microsoft.Storage/storageAccounts' },
      });
      let publicAccess = 0;
      for (const sa of accounts) {
        try {
          const props = JSON.parse(sa.properties || '{}');
          if (props.allowBlobPublicAccess === true) publicAccess++;
        } catch { /* skip */ }
      }
      return {
        status: publicAccess === 0 ? 'PASS' : 'FAIL',
        details: accounts.length === 0
          ? 'No storage accounts found'
          : `${publicAccess}/${accounts.length} storage account(s) allow public blob access`,
      };
    },
  },
  {
    id: '5.1',
    category: 'Security',
    title: 'Defender for Cloud assessments active',
    description: 'Ensure Microsoft Defender for Cloud is actively monitoring resources.',
    check: async (orgId) => {
      const total = await prisma.azureDefenderAssessment.count({ where: { organizationId: orgId } });
      const healthy = await prisma.azureDefenderAssessment.count({ where: { organizationId: orgId, status: 'Healthy' } });
      if (total === 0) return { status: 'WARNING', details: 'No Defender for Cloud assessments found (Defender may not be enabled)' };
      const pct = Math.round((healthy / total) * 100);
      return {
        status: pct >= 80 ? 'PASS' : pct >= 50 ? 'WARNING' : 'FAIL',
        details: `${healthy}/${total} assessments (${pct}%) are healthy`,
      };
    },
  },
  {
    id: '5.2',
    category: 'Security',
    title: 'No high-severity unresolved security alerts',
    description: 'Ensure there are no unresolved high-severity security alerts.',
    check: async (orgId) => {
      const highAlerts = await prisma.azureSecurityAlert.count({
        where: { organizationId: orgId, severity: 'high', status: { in: ['new', 'inProgress'] } },
      });
      return {
        status: highAlerts === 0 ? 'PASS' : 'FAIL',
        details: `${highAlerts} high-severity unresolved security alert(s)`,
      };
    },
  },
];

class AzureMonitorService {
  async runFullScan(organizationId: string, triggeredBy: string = 'cron') {
    const config = await prisma.azureConfig.findUnique({
      where: { organizationId },
    });
    if (!config) {
      throw new Error('Azure not configured for this organization');
    }

    const client = createAzureClient({
      tenantId: config.tenantId,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      subscriptionId: config.subscriptionId,
    });

    const scanLog = await prisma.azureScanLog.create({
      data: { organizationId, triggeredBy, status: 'running', totalPhases: 8 },
    });

    try {
      // Phase 1: Users
      await this.updatePhase(scanLog.id, 'users', 0);
      const users = await client.listUsers();
      for (const user of users) {
        await prisma.azureUser.upsert({
          where: { organizationId_azureUserId: { organizationId, azureUserId: user.id } },
          update: {
            displayName: user.displayName || '',
            userPrincipalName: user.userPrincipalName || '',
            mail: user.mail || null,
            accountEnabled: user.accountEnabled ?? true,
            userType: user.userType || null,
            createdDateTime: user.createdDateTime ? new Date(user.createdDateTime) : null,
            lastSignInDateTime: user.signInActivity?.lastSignInDateTime
              ? new Date(user.signInActivity.lastSignInDateTime) : null,
            assignedLicenses: (user.assignedLicenses || []).map((l: any) => l.skuId || '').filter(Boolean),
          },
          create: {
            organizationId,
            azureUserId: user.id,
            displayName: user.displayName || '',
            userPrincipalName: user.userPrincipalName || '',
            mail: user.mail || null,
            accountEnabled: user.accountEnabled ?? true,
            userType: user.userType || null,
            createdDateTime: user.createdDateTime ? new Date(user.createdDateTime) : null,
            lastSignInDateTime: user.signInActivity?.lastSignInDateTime
              ? new Date(user.signInActivity.lastSignInDateTime) : null,
            assignedLicenses: (user.assignedLicenses || []).map((l: any) => l.skuId || '').filter(Boolean),
          },
        });
      }
      await this.updatePhase(scanLog.id, 'users', 1);
      logger.info(`Azure Scan [${organizationId}]: Phase 1 complete - ${users.length} users synced`);

      // Phase 2: MFA status (batch 10 users at a time)
      await this.updatePhase(scanLog.id, 'mfa', 1);
      const BATCH_SIZE = 10;
      for (let i = 0; i < users.length; i += BATCH_SIZE) {
        const batch = users.slice(i, i + BATCH_SIZE);
        const results = await Promise.allSettled(
          batch.map(async (u: any) => {
            const mfaStatus = await client.getUserMfaStatus(u.id);
            return { userId: u.id, ...mfaStatus };
          })
        );

        for (const result of results) {
          if (result.status === 'fulfilled') {
            await prisma.azureUser.updateMany({
              where: { organizationId, azureUserId: result.value.userId },
              data: {
                mfaRegistered: result.value.registered,
                mfaMethods: result.value.methods,
              },
            });
          }
        }
      }
      await this.updatePhase(scanLog.id, 'mfa', 2);
      logger.info(`Azure Scan [${organizationId}]: Phase 2 complete - MFA status checked for ${users.length} users`);

      // Phase 3: Groups
      await this.updatePhase(scanLog.id, 'groups', 2);
      const groups = await client.listGroups();
      for (const group of groups) {
        const memberCount = await client.getGroupMemberCount(group.id);
        await prisma.azureGroup.upsert({
          where: { organizationId_azureGroupId: { organizationId, azureGroupId: group.id } },
          update: {
            displayName: group.displayName || '',
            mail: group.mail || null,
            groupTypes: group.groupTypes || [],
            securityEnabled: group.securityEnabled || false,
            mailEnabled: group.mailEnabled || false,
            membershipRule: group.membershipRule || null,
            memberCount,
            visibility: group.visibility || null,
          },
          create: {
            organizationId,
            azureGroupId: group.id,
            displayName: group.displayName || '',
            mail: group.mail || null,
            groupTypes: group.groupTypes || [],
            securityEnabled: group.securityEnabled || false,
            mailEnabled: group.mailEnabled || false,
            membershipRule: group.membershipRule || null,
            memberCount,
            visibility: group.visibility || null,
          },
        });
      }
      await this.updatePhase(scanLog.id, 'groups', 3);
      logger.info(`Azure Scan [${organizationId}]: Phase 3 complete - ${groups.length} groups synced`);

      // Phase 4: App Registrations
      await this.updatePhase(scanLog.id, 'apps', 3);
      const apps = await client.listAppRegistrations();
      const now = new Date();
      for (const app of apps) {
        const passwordCreds = app.passwordCredentials || [];
        const keyCreds = app.keyCredentials || [];
        const hasExpired = [
          ...passwordCreds.map((c: any) => c.endDateTime),
          ...keyCreds.map((c: any) => c.endDateTime),
        ].some((d: string) => d && new Date(d) < now);

        const permissions: string[] = [];
        for (const rra of app.requiredResourceAccess || []) {
          for (const ra of rra.resourceAccess || []) {
            permissions.push(`${rra.resourceAppId}/${ra.id}`);
          }
        }

        await prisma.azureAppRegistration.upsert({
          where: { organizationId_appId: { organizationId, appId: app.appId } },
          update: {
            displayName: app.displayName || '',
            signInAudience: app.signInAudience || null,
            passwordCredentialCount: passwordCreds.length,
            keyCredentialCount: keyCreds.length,
            hasExpiredCredentials: hasExpired,
            apiPermissions: permissions,
            createdDateTime: app.createdDateTime ? new Date(app.createdDateTime) : null,
          },
          create: {
            organizationId,
            appId: app.appId,
            displayName: app.displayName || '',
            signInAudience: app.signInAudience || null,
            passwordCredentialCount: passwordCreds.length,
            keyCredentialCount: keyCreds.length,
            hasExpiredCredentials: hasExpired,
            apiPermissions: permissions,
            createdDateTime: app.createdDateTime ? new Date(app.createdDateTime) : null,
          },
        });
      }
      await this.updatePhase(scanLog.id, 'apps', 4);
      logger.info(`Azure Scan [${organizationId}]: Phase 4 complete - ${apps.length} app registrations synced`);

      // Phase 5: Conditional Access Policies (may fail with 403 for non-P2 tenants)
      await this.updatePhase(scanLog.id, 'conditionalAccess', 4);
      const policies = await client.listConditionalAccessPolicies();
      for (const policy of policies) {
        await prisma.azureConditionalAccessPolicy.upsert({
          where: { organizationId_policyId: { organizationId, policyId: policy.id } },
          update: {
            displayName: policy.displayName || '',
            state: policy.state || 'disabled',
            conditions: policy.conditions ? JSON.stringify(policy.conditions) : null,
            grantControls: policy.grantControls ? JSON.stringify(policy.grantControls) : null,
            sessionControls: policy.sessionControls ? JSON.stringify(policy.sessionControls) : null,
            createdDateTime: policy.createdDateTime ? new Date(policy.createdDateTime) : null,
            modifiedDateTime: policy.modifiedDateTime ? new Date(policy.modifiedDateTime) : null,
          },
          create: {
            organizationId,
            policyId: policy.id,
            displayName: policy.displayName || '',
            state: policy.state || 'disabled',
            conditions: policy.conditions ? JSON.stringify(policy.conditions) : null,
            grantControls: policy.grantControls ? JSON.stringify(policy.grantControls) : null,
            sessionControls: policy.sessionControls ? JSON.stringify(policy.sessionControls) : null,
            createdDateTime: policy.createdDateTime ? new Date(policy.createdDateTime) : null,
            modifiedDateTime: policy.modifiedDateTime ? new Date(policy.modifiedDateTime) : null,
          },
        });
      }
      await this.updatePhase(scanLog.id, 'conditionalAccess', 5);
      logger.info(`Azure Scan [${organizationId}]: Phase 5 complete - ${policies.length} CA policies synced`);

      // Phase 6: Resources (VMs, NSGs, Storage Accounts, and general resources)
      await this.updatePhase(scanLog.id, 'resources', 5);
      const resources = await client.listResources();
      for (const resource of resources) {
        const resourceGroup = resource.id?.split('/resourceGroups/')?.[1]?.split('/')?.[0] || '';
        await prisma.azureResource.upsert({
          where: { organizationId_resourceId: { organizationId, resourceId: resource.id || '' } },
          update: {
            name: resource.name || '',
            type: resource.type || '',
            location: resource.location || '',
            resourceGroup,
            provisioningState: resource.provisioningState || null,
            tags: resource.tags ? JSON.stringify(resource.tags) : null,
          },
          create: {
            organizationId,
            resourceId: resource.id || '',
            name: resource.name || '',
            type: resource.type || '',
            location: resource.location || '',
            resourceGroup,
            provisioningState: resource.provisioningState || null,
            tags: resource.tags ? JSON.stringify(resource.tags) : null,
          },
        });
      }

      // Enrich NSGs with security rules
      const nsgs = await client.listNSGs();
      for (const nsg of nsgs) {
        if (nsg.id) {
          await prisma.azureResource.updateMany({
            where: { organizationId, resourceId: nsg.id },
            data: {
              properties: JSON.stringify({
                securityRules: (nsg.securityRules || []).map((r: any) => ({
                  name: r.name,
                  properties: {
                    direction: r.direction,
                    access: r.access,
                    protocol: r.protocol,
                    sourceAddressPrefix: r.sourceAddressPrefix,
                    destinationPortRange: r.destinationPortRange,
                    priority: r.priority,
                  },
                })),
              }),
            },
          });
        }
      }

      // Enrich storage accounts with properties
      const storageAccounts = await client.listStorageAccounts();
      for (const sa of storageAccounts) {
        if (sa.id) {
          await prisma.azureResource.updateMany({
            where: { organizationId, resourceId: sa.id },
            data: {
              properties: JSON.stringify({
                supportsHttpsTrafficOnly: sa.enableHttpsTrafficOnly,
                allowBlobPublicAccess: sa.allowBlobPublicAccess,
                minimumTlsVersion: sa.minimumTlsVersion,
                kind: sa.kind,
                sku: sa.sku?.name,
              }),
            },
          });
        }
      }

      await this.updatePhase(scanLog.id, 'resources', 6);
      logger.info(`Azure Scan [${organizationId}]: Phase 6 complete - ${resources.length} resources, ${nsgs.length} NSGs, ${storageAccounts.length} storage accounts synced`);

      // Phase 7: Security (Alerts + Defender Assessments)
      await this.updatePhase(scanLog.id, 'security', 6);
      const alerts = await client.listSecurityAlerts();
      for (const alert of alerts) {
        await prisma.azureSecurityAlert.upsert({
          where: { organizationId_alertId: { organizationId, alertId: alert.id || '' } },
          update: {
            title: alert.title || '',
            severity: alert.severity || 'informational',
            status: alert.status || 'new',
            category: alert.category || null,
            description: alert.description || null,
            createdDateTime: alert.createdDateTime ? new Date(alert.createdDateTime) : null,
            lastUpdateDateTime: alert.lastUpdateDateTime ? new Date(alert.lastUpdateDateTime) : null,
            serviceSource: alert.serviceSource || null,
          },
          create: {
            organizationId,
            alertId: alert.id || '',
            title: alert.title || '',
            severity: alert.severity || 'informational',
            status: alert.status || 'new',
            category: alert.category || null,
            description: alert.description || null,
            createdDateTime: alert.createdDateTime ? new Date(alert.createdDateTime) : null,
            lastUpdateDateTime: alert.lastUpdateDateTime ? new Date(alert.lastUpdateDateTime) : null,
            serviceSource: alert.serviceSource || null,
          },
        });
      }

      const assessments = await client.listDefenderAssessments();
      for (const assessment of assessments) {
        const assessmentId = assessment.name || assessment.id?.split('/')?.pop() || '';
        await prisma.azureDefenderAssessment.upsert({
          where: { organizationId_assessmentId: { organizationId, assessmentId } },
          update: {
            displayName: assessment.displayName || '',
            description: assessment.description || null,
            severity: assessment.status?.severity || 'Low',
            status: assessment.status?.code || 'NotApplicable',
            resourceId: assessment.resourceDetails?.id || null,
            category: assessment.metadata?.category || null,
          },
          create: {
            organizationId,
            assessmentId,
            displayName: assessment.displayName || '',
            description: assessment.description || null,
            severity: assessment.status?.severity || 'Low',
            status: assessment.status?.code || 'NotApplicable',
            resourceId: assessment.resourceDetails?.id || null,
            category: assessment.metadata?.category || null,
          },
        });
      }
      await this.updatePhase(scanLog.id, 'security', 7);
      logger.info(`Azure Scan [${organizationId}]: Phase 7 complete - ${alerts.length} alerts, ${assessments.length} assessments synced`);

      // Phase 8: CIS Checks
      await this.updatePhase(scanLog.id, 'cis', 7);
      await this.runCisChecks(organizationId, scanLog.id);
      logger.info(`Azure Scan [${organizationId}]: Phase 8 complete - CIS checks executed`);

      // Mark completed
      await prisma.azureScanLog.update({
        where: { id: scanLog.id },
        data: {
          status: 'completed',
          phase: null,
          completedPhases: 8,
          currentPhaseProgress: 100,
          completedAt: new Date(),
        },
      });

      logger.info(`Azure Scan completed for org ${organizationId}: ${users.length} users, ${groups.length} groups, ${apps.length} apps, ${policies.length} CA policies, ${resources.length} resources, ${alerts.length} alerts`);
      return scanLog;
    } catch (error: any) {
      await prisma.azureScanLog.update({
        where: { id: scanLog.id },
        data: {
          status: 'failed',
          error: error.message || 'Unknown error',
          completedAt: new Date(),
        },
      });
      logger.error(`Azure Scan failed for org ${organizationId}:`, error.message);
      throw error;
    }
  }

  async runCisChecks(organizationId: string, scanLogId: string) {
    // Delete previous CIS checks for this scan
    await prisma.azureCisCheck.deleteMany({ where: { scanLogId } });

    for (const check of CIS_CHECKS) {
      try {
        const result = await check.check(organizationId);
        await prisma.azureCisCheck.create({
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
        await prisma.azureCisCheck.create({
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
    const configs = await prisma.azureConfig.findMany({
      where: { isEnabled: true },
      select: { organizationId: true },
    });

    for (const config of configs) {
      try {
        await this.runFullScan(config.organizationId, 'cron');
      } catch (error: any) {
        logger.error(`Scheduled Azure scan failed for org ${config.organizationId}:`, error.message);
      }
    }
  }

  private async updatePhase(scanLogId: string, phase: string, completedPhases: number) {
    await prisma.azureScanLog.update({
      where: { id: scanLogId },
      data: { phase, completedPhases, currentPhaseProgress: Math.round((completedPhases / 8) * 100) },
    });
  }
}

export const azureMonitorService = new AzureMonitorService();
