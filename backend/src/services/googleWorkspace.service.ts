import { google } from 'googleapis';
import { logger } from '../utils/logger.js';

interface GWorkspaceCredentials {
  serviceAccountKey: string;
  adminEmail: string;
  domain?: string;
}

export function createGoogleWorkspaceClient(credentials: GWorkspaceCredentials) {
  const keyData = JSON.parse(credentials.serviceAccountKey);

  // Core scopes (must be authorized in domain-wide delegation)
  const auth = new google.auth.JWT({
    email: keyData.client_email,
    key: keyData.private_key,
    scopes: [
      'https://www.googleapis.com/auth/admin.directory.user.readonly',
      'https://www.googleapis.com/auth/admin.directory.group.readonly',
      'https://www.googleapis.com/auth/admin.directory.device.mobile.readonly',
      'https://www.googleapis.com/auth/admin.directory.user.security',
      'https://www.googleapis.com/auth/admin.reports.audit.readonly',
      'https://www.googleapis.com/auth/admin.reports.usage.readonly',
      'https://www.googleapis.com/auth/apps.alerts',
      'https://www.googleapis.com/auth/apps.groups.settings',
    ],
    subject: credentials.adminEmail,
  });

  // Extended scopes for org units + admin roles (separate auth so missing delegation doesn't break core scan)
  const extAuth = new google.auth.JWT({
    email: keyData.client_email,
    key: keyData.private_key,
    scopes: [
      'https://www.googleapis.com/auth/admin.directory.user.readonly',
      'https://www.googleapis.com/auth/admin.directory.orgunit.readonly',
      'https://www.googleapis.com/auth/admin.directory.rolemanagement.readonly',
    ],
    subject: credentials.adminEmail,
  });

  const adminDir = google.admin({ version: 'directory_v1', auth });
  const extAdminDir = google.admin({ version: 'directory_v1', auth: extAuth });
  const alertCenter = google.alertcenter({ version: 'v1beta1', auth });
  const groupSettings = google.groupssettings({ version: 'v1', auth });

  const domain = credentials.domain || credentials.adminEmail.split('@')[1];

  let cachedCustomerId: string | null = null;

  return {
    async verifyCredentials(): Promise<boolean> {
      try {
        await adminDir.users.list({ domain, maxResults: 1 });
        return true;
      } catch (error: any) {
        logger.error('Google Workspace credential verification failed:', error.message);
        return false;
      }
    },

    async getCustomerId(): Promise<string> {
      if (cachedCustomerId) return cachedCustomerId;
      const res = await adminDir.users.list({ domain, maxResults: 1 });
      cachedCustomerId = res.data.users?.[0]?.customerId || 'my_customer';
      return cachedCustomerId;
    },

    async listAllUsers(): Promise<any[]> {
      const users: any[] = [];
      let pageToken: string | undefined;

      do {
        const res: any = await adminDir.users.list({
          domain,
          maxResults: 500,
          pageToken,
          projection: 'full',
        });
        if (res.data.users) {
          users.push(...res.data.users);
        }
        pageToken = res.data.nextPageToken;
      } while (pageToken);

      return users;
    },

    async listAllGroups(): Promise<any[]> {
      const groups: any[] = [];
      let pageToken: string | undefined;

      do {
        const res: any = await adminDir.groups.list({
          domain,
          maxResults: 200,
          pageToken,
        });
        if (res.data.groups) {
          groups.push(...res.data.groups);
        }
        pageToken = res.data.nextPageToken;
      } while (pageToken);

      return groups;
    },

    async getGroupSettings(groupEmail: string): Promise<any> {
      try {
        const res = await groupSettings.groups.get({ groupUniqueId: groupEmail });
        return res.data;
      } catch (error: any) {
        logger.warn(`Failed to get settings for group ${groupEmail}:`, error.message);
        return null;
      }
    },

    async getGroupMembers(groupKey: string): Promise<any[]> {
      const members: any[] = [];
      let pageToken: string | undefined;

      try {
        do {
          const res: any = await adminDir.members.list({
            groupKey,
            maxResults: 200,
            pageToken,
          });
          if (res.data.members) {
            members.push(...res.data.members);
          }
          pageToken = res.data.nextPageToken;
        } while (pageToken);
      } catch (error: any) {
        logger.warn(`Failed to list members for group ${groupKey}:`, error.message);
      }

      return members;
    },

    async listUserTokens(userKey: string): Promise<any[]> {
      try {
        const res = await adminDir.tokens.list({ userKey });
        return res.data.items || [];
      } catch (error: any) {
        // 403/404 is expected for some users (admins, service accounts)
        if (error.code === 403 || error.code === 404) return [];
        logger.warn(`Failed to list tokens for user ${userKey}:`, error.message);
        return [];
      }
    },

    async listMobileDevices(): Promise<any[]> {
      const devices: any[] = [];
      let pageToken: string | undefined;
      const customerId = await this.getCustomerId();

      try {
        do {
          const res: any = await adminDir.mobiledevices.list({
            customerId,
            maxResults: 100,
            pageToken,
          });
          if (res.data.mobiledevices) {
            devices.push(...res.data.mobiledevices);
          }
          pageToken = res.data.nextPageToken;
        } while (pageToken);
      } catch (error: any) {
        logger.warn('Failed to list mobile devices:', error.message);
      }

      return devices;
    },

    async listAlerts(): Promise<any[]> {
      const alerts: any[] = [];
      let pageToken: string | undefined;

      try {
        do {
          const res: any = await alertCenter.alerts.list({
            pageSize: 100,
            pageToken,
          });
          if (res.data.alerts) {
            alerts.push(...res.data.alerts);
          }
          pageToken = res.data.nextPageToken;
        } while (pageToken);
      } catch (error: any) {
        logger.warn('Failed to list alerts (Alert Center API may not be enabled):', error.message);
      }

      return alerts;
    },

    async listOrgUnits(): Promise<any[]> {
      try {
        const customerId = await this.getCustomerId();
        const res = await extAdminDir.orgunits.list({
          customerId,
          type: 'all',
        });
        return (res.data.organizationUnits as any[]) || [];
      } catch (error: any) {
        logger.warn('Failed to list org units (ensure orgunit.readonly scope is delegated):', error.message);
        return [];
      }
    },

    async listAdminRoles(): Promise<any[]> {
      try {
        const customerId = await this.getCustomerId();
        const res: any = await extAdminDir.roles.list({ customer: customerId });
        return res.data.items || [];
      } catch (error: any) {
        logger.warn('Failed to list admin roles (ensure rolemanagement.readonly scope is delegated):', error.message);
        return [];
      }
    },

    async listRoleAssignments(): Promise<any[]> {
      const assignments: any[] = [];
      let pageToken: string | undefined;
      try {
        const customerId = await this.getCustomerId();
        do {
          const res: any = await extAdminDir.roleAssignments.list({
            customer: customerId,
            maxResults: 200,
            pageToken,
          });
          if (res.data.items) {
            assignments.push(...res.data.items);
          }
          pageToken = res.data.nextPageToken;
        } while (pageToken);
      } catch (error: any) {
        logger.warn('Failed to list role assignments (ensure rolemanagement.readonly scope is delegated):', error.message);
      }
      return assignments;
    },
  };
}
