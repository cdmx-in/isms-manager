import { ClientSecretCredential } from '@azure/identity';
import { Client } from '@microsoft/microsoft-graph-client';
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials/index.js';
import { ResourceManagementClient } from '@azure/arm-resources';
import { ComputeManagementClient } from '@azure/arm-compute';
import { NetworkManagementClient } from '@azure/arm-network';
import { StorageManagementClient } from '@azure/arm-storage';
import { SecurityCenter } from '@azure/arm-security';
import { logger } from '../utils/logger.js';

interface AzureCredentials {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  subscriptionId: string;
}

export function createAzureClient(credentials: AzureCredentials) {
  const credential = new ClientSecretCredential(
    credentials.tenantId,
    credentials.clientId,
    credentials.clientSecret
  );

  // Graph API client
  const authProvider = new TokenCredentialAuthenticationProvider(credential, {
    scopes: ['https://graph.microsoft.com/.default'],
  });

  const graphClient = Client.initWithMiddleware({ authProvider });

  // ARM SDK clients
  const resourceClient = new ResourceManagementClient(credential, credentials.subscriptionId);
  const computeClient = new ComputeManagementClient(credential, credentials.subscriptionId);
  const networkClient = new NetworkManagementClient(credential, credentials.subscriptionId);
  const storageClient = new StorageManagementClient(credential, credentials.subscriptionId);
  const securityClient = new SecurityCenter(credential, credentials.subscriptionId);

  return {
    async verifyCredentials(): Promise<boolean> {
      try {
        await graphClient.api('/users').top(1).select('id').get();
        return true;
      } catch (error: any) {
        logger.error('Azure credential verification failed:', error.message);
        return false;
      }
    },

    async listUsers(): Promise<any[]> {
      const users: any[] = [];
      try {
        let response = await graphClient
          .api('/users')
          .select('id,displayName,userPrincipalName,mail,accountEnabled,userType,createdDateTime,signInActivity,assignedLicenses')
          .top(999)
          .get();

        if (response.value) users.push(...response.value);

        while (response['@odata.nextLink']) {
          response = await graphClient.api(response['@odata.nextLink']).get();
          if (response.value) users.push(...response.value);
        }
      } catch (error: any) {
        logger.error('Failed to list Azure users:', error.message);
      }
      return users;
    },

    async listGroups(): Promise<any[]> {
      const groups: any[] = [];
      try {
        let response = await graphClient
          .api('/groups')
          .select('id,displayName,mail,groupTypes,securityEnabled,mailEnabled,membershipRule,visibility')
          .top(999)
          .get();

        if (response.value) groups.push(...response.value);

        while (response['@odata.nextLink']) {
          response = await graphClient.api(response['@odata.nextLink']).get();
          if (response.value) groups.push(...response.value);
        }
      } catch (error: any) {
        logger.error('Failed to list Azure groups:', error.message);
      }
      return groups;
    },

    async getGroupMemberCount(groupId: string): Promise<number> {
      try {
        const response = await graphClient
          .api(`/groups/${groupId}/members/$count`)
          .header('ConsistencyLevel', 'eventual')
          .get();
        return typeof response === 'number' ? response : 0;
      } catch {
        return 0;
      }
    },

    async listAppRegistrations(): Promise<any[]> {
      const apps: any[] = [];
      try {
        let response = await graphClient
          .api('/applications')
          .select('id,appId,displayName,signInAudience,passwordCredentials,keyCredentials,requiredResourceAccess,createdDateTime')
          .top(999)
          .get();

        if (response.value) apps.push(...response.value);

        while (response['@odata.nextLink']) {
          response = await graphClient.api(response['@odata.nextLink']).get();
          if (response.value) apps.push(...response.value);
        }
      } catch (error: any) {
        logger.error('Failed to list Azure app registrations:', error.message);
      }
      return apps;
    },

    async listConditionalAccessPolicies(): Promise<any[]> {
      const policies: any[] = [];
      try {
        let response = await graphClient
          .api('/identity/conditionalAccess/policies')
          .get();

        if (response.value) policies.push(...response.value);

        while (response['@odata.nextLink']) {
          response = await graphClient.api(response['@odata.nextLink']).get();
          if (response.value) policies.push(...response.value);
        }
      } catch (error: any) {
        // 403 expected if tenant lacks P2 license
        if (error.statusCode === 403) {
          logger.warn('Conditional Access API requires Azure AD P2 license - skipping');
        } else {
          logger.error('Failed to list conditional access policies:', error.message);
        }
      }
      return policies;
    },

    async listSecurityAlerts(): Promise<any[]> {
      const alerts: any[] = [];
      try {
        let response = await graphClient
          .api('/security/alerts_v2')
          .top(999)
          .get();

        if (response.value) alerts.push(...response.value);

        while (response['@odata.nextLink']) {
          response = await graphClient.api(response['@odata.nextLink']).get();
          if (response.value) alerts.push(...response.value);
        }
      } catch (error: any) {
        if (error.statusCode === 403) {
          logger.warn('Security alerts API not available - check permissions');
        } else {
          logger.error('Failed to list security alerts:', error.message);
        }
      }
      return alerts;
    },

    async getUserMfaStatus(userId: string): Promise<{ registered: boolean; methods: string[] }> {
      try {
        const response = await graphClient
          .api(`/users/${userId}/authentication/methods`)
          .get();

        const methods = (response.value || [])
          .map((m: any) => m['@odata.type']?.replace('#microsoft.graph.', '') || '')
          .filter((m: string) => m && m !== 'passwordAuthenticationMethod');

        return { registered: methods.length > 0, methods };
      } catch (error: any) {
        // 403/404 common for some user types
        if (error.statusCode === 403 || error.statusCode === 404) return { registered: false, methods: [] };
        logger.warn(`Failed to get MFA status for user ${userId}:`, error.message);
        return { registered: false, methods: [] };
      }
    },

    async listResources(): Promise<any[]> {
      const resources: any[] = [];
      try {
        for await (const resource of resourceClient.resources.list()) {
          resources.push(resource);
        }
      } catch (error: any) {
        logger.error('Failed to list Azure resources:', error.message);
      }
      return resources;
    },

    async listVMs(): Promise<any[]> {
      const vms: any[] = [];
      try {
        for await (const vm of computeClient.virtualMachines.listAll()) {
          vms.push(vm);
        }
      } catch (error: any) {
        logger.error('Failed to list Azure VMs:', error.message);
      }
      return vms;
    },

    async listNSGs(): Promise<any[]> {
      const nsgs: any[] = [];
      try {
        for await (const nsg of networkClient.networkSecurityGroups.listAll()) {
          nsgs.push(nsg);
        }
      } catch (error: any) {
        logger.error('Failed to list Azure NSGs:', error.message);
      }
      return nsgs;
    },

    async listStorageAccounts(): Promise<any[]> {
      const accounts: any[] = [];
      try {
        for await (const account of storageClient.storageAccounts.list()) {
          accounts.push(account);
        }
      } catch (error: any) {
        logger.error('Failed to list Azure storage accounts:', error.message);
      }
      return accounts;
    },

    async listDefenderAssessments(): Promise<any[]> {
      const assessments: any[] = [];
      try {
        const scope = `/subscriptions/${credentials.subscriptionId}`;
        for await (const assessment of securityClient.assessments.list(scope)) {
          assessments.push(assessment);
        }
      } catch (error: any) {
        if (error.statusCode === 403) {
          logger.warn('Defender for Cloud not enabled or insufficient permissions - skipping assessments');
        } else {
          logger.error('Failed to list Defender assessments:', error.message);
        }
      }
      return assessments;
    },
  };
}
