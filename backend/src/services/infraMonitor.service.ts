import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { HttpProxyAgent } from 'http-proxy-agent';
import { prisma } from '../index.js';
import { createCloudflareClient } from './cloudflare.service.js';
import { logger } from '../utils/logger.js';
import { DomainExposureStatus } from '@prisma/client';

class InfraMonitorService {

  /**
   * Run a full infrastructure scan for a specific organization.
   * Updates progress in real-time so the frontend can poll for updates.
   */
  async runFullScan(organizationId: string, triggeredBy: string = 'cron') {
    // Get org config
    const config = await prisma.infraMonitorConfig.findUnique({
      where: { organizationId },
    });
    if (!config || !config.cloudflareApiToken) {
      throw new Error('Cloudflare API token not configured for this organization');
    }

    const cfClient = createCloudflareClient(config.cloudflareApiToken);
    const proxyUrl = config.httpCheckProxy || '';

    const scanLog = await prisma.infraMonitorScanLog.create({
      data: { organizationId, triggeredBy, status: 'running' },
    });

    try {
      // Step 1: Sync zones from Cloudflare
      const zones = await cfClient.getAllZones();
      let zonesScanned = 0;
      let recordsScanned = 0;

      for (const zone of zones) {
        const dbZone = await prisma.dnsZone.upsert({
          where: { organizationId_cloudflareId: { organizationId, cloudflareId: zone.id } },
          update: {
            name: zone.name,
            status: zone.status,
            nameservers: zone.name_servers || [],
          },
          create: {
            organizationId,
            cloudflareId: zone.id,
            name: zone.name,
            status: zone.status,
            nameservers: zone.name_servers || [],
          },
        });

        // Step 2: Fetch and upsert DNS records for this zone
        const records = await cfClient.getFilteredDnsRecords(zone.id);

        for (const record of records) {
          await prisma.dnsRecord.upsert({
            where: { organizationId_cloudflareRecordId: { organizationId, cloudflareRecordId: record.id } },
            update: {
              name: record.name,
              type: record.type,
              content: record.content,
              proxied: record.proxied,
              ttl: record.ttl,
              zoneId: dbZone.id,
            },
            create: {
              organizationId,
              zoneId: dbZone.id,
              cloudflareRecordId: record.id,
              name: record.name,
              type: record.type,
              content: record.content,
              proxied: record.proxied,
              ttl: record.ttl,
              exposureStatus: 'PENDING',
            },
          });
          recordsScanned++;
        }
        zonesScanned++;
      }

      // Update scan log with zone/record counts
      const allRecords = await prisma.dnsRecord.findMany({
        where: { organizationId },
      });

      await prisma.infraMonitorScanLog.update({
        where: { id: scanLog.id },
        data: {
          zonesScanned,
          recordsScanned,
          totalRecords: allRecords.length,
        },
      });

      // Step 3: HTTP accessibility checks with real-time progress
      let publicCount = 0;
      let privateCount = 0;
      let unreachableCount = 0;
      let errorCount = 0;
      let checkedRecords = 0;

      const BATCH_SIZE = 10;
      for (let i = 0; i < allRecords.length; i += BATCH_SIZE) {
        const batch = allRecords.slice(i, i + BATCH_SIZE);
        const results = await Promise.allSettled(
          batch.map(record => this.checkDomainExposure(record.name, proxyUrl))
        );

        for (let j = 0; j < batch.length; j++) {
          const record = batch[j];
          const result = results[j];

          if (result.status === 'fulfilled') {
            const { status, httpStatusCode, responseTimeMs, error } = result.value;
            await prisma.dnsRecord.update({
              where: { id: record.id },
              data: {
                exposureStatus: status,
                httpStatusCode,
                responseTimeMs,
                lastCheckedAt: new Date(),
                checkError: error || null,
              },
            });
            if (status === 'PUBLIC') publicCount++;
            else if (status === 'PRIVATE') privateCount++;
            else if (status === 'UNREACHABLE') unreachableCount++;
            else errorCount++;
          } else {
            await prisma.dnsRecord.update({
              where: { id: record.id },
              data: {
                exposureStatus: 'ERROR',
                lastCheckedAt: new Date(),
                checkError: (result.reason as Error)?.message || 'Unknown error',
              },
            });
            errorCount++;
          }
          checkedRecords++;
        }

        // Update progress in scan log after each batch
        await prisma.infraMonitorScanLog.update({
          where: { id: scanLog.id },
          data: {
            checkedRecords,
            publicCount,
            privateCount,
            unreachableCount,
            errorCount,
            currentDomain: batch[batch.length - 1]?.name || null,
          },
        });
      }

      // Step 4: Origin protection checks
      const originExposedCount = await this.checkOriginProtection(organizationId, proxyUrl);
      logger.info(`GW Scan [${organizationId}]: Origin protection check complete - ${originExposedCount} exposed`);

      // Mark scan as completed
      await prisma.infraMonitorScanLog.update({
        where: { id: scanLog.id },
        data: {
          status: 'completed',
          checkedRecords,
          publicCount,
          privateCount,
          unreachableCount,
          errorCount,
          originExposedCount,
          currentDomain: null,
          completedAt: new Date(),
        },
      });

      logger.info(`Infrastructure scan completed for org ${organizationId}: ${zonesScanned} zones, ${recordsScanned} records, ${publicCount} public, ${privateCount} private, ${unreachableCount} unreachable, ${originExposedCount} origin exposed`);
      return scanLog;
    } catch (error: any) {
      await prisma.infraMonitorScanLog.update({
        where: { id: scanLog.id },
        data: {
          status: 'failed',
          error: error.message,
          completedAt: new Date(),
        },
      });
      logger.error(`Infrastructure scan failed for org ${organizationId}:`, error);
      throw error;
    }
  }

  /**
   * Check a single domain for HTTP accessibility.
   */
  async checkDomainExposure(domain: string, proxyUrl: string = ''): Promise<{
    status: DomainExposureStatus;
    httpStatusCode: number | null;
    responseTimeMs: number | null;
    error: string | null;
  }> {
    const url = `https://${domain}`;
    const startTime = Date.now();

    try {
      const axiosConfig: any = {
        timeout: 15000,
        maxRedirects: 5,
        validateStatus: () => true,
        headers: {
          'User-Agent': 'ISMS-InfraMonitor/1.0',
        },
      };

      if (proxyUrl) {
        axiosConfig.httpsAgent = new HttpsProxyAgent(proxyUrl);
        axiosConfig.httpAgent = new HttpProxyAgent(proxyUrl);
      }

      const response = await axios.get(url, axiosConfig);
      const responseTimeMs = Date.now() - startTime;
      const httpStatusCode = response.status;

      let status: DomainExposureStatus;
      if (httpStatusCode === 403) {
        status = 'PRIVATE';
      } else if (httpStatusCode >= 200 && httpStatusCode < 600) {
        status = 'PUBLIC';
      } else {
        status = 'UNREACHABLE';
      }

      return { status, httpStatusCode, responseTimeMs, error: null };
    } catch (error: any) {
      const responseTimeMs = Date.now() - startTime;

      if (
        error.code === 'ECONNREFUSED' ||
        error.code === 'ENOTFOUND' ||
        error.code === 'ETIMEDOUT' ||
        error.code === 'ECONNRESET' ||
        error.code === 'ECONNABORTED' ||
        error.code === 'ERR_TLS_CERT_ALTNAME_INVALID' ||
        error.message?.includes('timeout')
      ) {
        return {
          status: 'UNREACHABLE',
          httpStatusCode: null,
          responseTimeMs,
          error: error.code || error.message,
        };
      }

      return {
        status: 'ERROR',
        httpStatusCode: null,
        responseTimeMs,
        error: error.message,
      };
    }
  }

  /**
   * Check origin protection for all A/AAAA records in an organization.
   * Detects: IP leakage (same IP on proxied + non-proxied records) and direct origin access.
   */
  async checkOriginProtection(organizationId: string, proxyUrl: string = ''): Promise<number> {
    const records = await prisma.dnsRecord.findMany({
      where: { organizationId, type: { in: ['A', 'AAAA'] } },
    });

    // Build map: IP -> { proxied records, non-proxied records }
    const ipMap: Record<string, { proxied: typeof records; direct: typeof records }> = {};
    for (const record of records) {
      const ip = record.content;
      if (!ipMap[ip]) ipMap[ip] = { proxied: [], direct: [] };
      if (record.proxied) {
        ipMap[ip].proxied.push(record);
      } else {
        ipMap[ip].direct.push(record);
      }
    }

    let exposedCount = 0;
    const processedIds = new Set<string>();

    for (const [ip, group] of Object.entries(ipMap)) {
      if (group.proxied.length > 0 && group.direct.length > 0) {
        // IP leak detected: same IP used by both proxied and non-proxied records
        const directNames = group.direct.map(r => r.name).join(', ');
        const proxiedNames = group.proxied.map(r => r.name).join(', ');

        // Check if origin accepts direct HTTPS connections
        let directAccessible = false;
        try {
          const result = await this.checkDirectOriginAccess(ip, group.proxied[0].name, proxyUrl);
          directAccessible = result;
        } catch {
          // If check fails, we still flag the IP leak
        }

        const exposureType = directAccessible ? 'BOTH' : 'IP_LEAK';

        // Mark proxied records as exposed
        for (const record of group.proxied) {
          if (!processedIds.has(record.id)) {
            await prisma.dnsRecord.update({
              where: { id: record.id },
              data: {
                originProtected: false,
                originExposureType: exposureType,
                originExposureDetails: `Origin IP ${ip} leaked via non-proxied record(s): ${directNames}${directAccessible ? '. Origin also accepts direct HTTPS connections.' : ''}`,
              },
            });
            processedIds.add(record.id);
            exposedCount++;
          }
        }

        // Mark non-proxied records that leak the IP
        for (const record of group.direct) {
          if (!processedIds.has(record.id)) {
            await prisma.dnsRecord.update({
              where: { id: record.id },
              data: {
                originProtected: false,
                originExposureType: 'IP_LEAK',
                originExposureDetails: `Exposes origin IP ${ip} used by proxied domain(s): ${proxiedNames}`,
              },
            });
            processedIds.add(record.id);
            exposedCount++;
          }
        }
      } else if (group.proxied.length > 0) {
        // Only proxied records for this IP - protected
        for (const record of group.proxied) {
          if (!processedIds.has(record.id)) {
            await prisma.dnsRecord.update({
              where: { id: record.id },
              data: {
                originProtected: true,
                originExposureType: null,
                originExposureDetails: null,
              },
            });
            processedIds.add(record.id);
          }
        }
      } else {
        // Only non-proxied records - not behind Cloudflare proxy, so origin is inherently exposed
        for (const record of group.direct) {
          if (!processedIds.has(record.id)) {
            await prisma.dnsRecord.update({
              where: { id: record.id },
              data: {
                originProtected: null, // N/A - not proxied
                originExposureType: null,
                originExposureDetails: null,
              },
            });
            processedIds.add(record.id);
          }
        }
      }
    }

    // Mark CNAME records as N/A
    await prisma.dnsRecord.updateMany({
      where: { organizationId, type: 'CNAME' },
      data: { originProtected: null, originExposureType: null, originExposureDetails: null },
    });

    return exposedCount;
  }

  /**
   * Check if origin server accepts direct HTTPS connections by IP.
   */
  private async checkDirectOriginAccess(ip: string, hostHeader: string, proxyUrl: string = ''): Promise<boolean> {
    try {
      const axiosConfig: any = {
        timeout: 10000,
        maxRedirects: 3,
        validateStatus: () => true,
        headers: {
          'User-Agent': 'ISMS-InfraMonitor/1.0',
          'Host': hostHeader,
        },
        // Skip TLS verification since we're connecting by IP
        httpsAgent: proxyUrl
          ? new HttpsProxyAgent(proxyUrl, { rejectUnauthorized: false })
          : new (await import('https')).Agent({ rejectUnauthorized: false }),
      };

      if (proxyUrl) {
        axiosConfig.httpAgent = new HttpProxyAgent(proxyUrl);
      }

      const response = await axios.get(`https://${ip}`, axiosConfig);
      // If we get any response that's not a connection error, origin is directly accessible
      return response.status >= 200 && response.status < 600 && response.status !== 403;
    } catch {
      return false;
    }
  }

  /**
   * Check a single record by its database ID (on-demand re-check)
   */
  async checkSingleRecord(recordId: string, organizationId: string) {
    const record = await prisma.dnsRecord.findFirst({
      where: { id: recordId, organizationId },
    });
    if (!record) throw new Error('Record not found');

    const config = await prisma.infraMonitorConfig.findUnique({
      where: { organizationId },
    });
    const proxyUrl = config?.httpCheckProxy || '';

    const result = await this.checkDomainExposure(record.name, proxyUrl);
    return prisma.dnsRecord.update({
      where: { id: recordId },
      data: {
        exposureStatus: result.status,
        httpStatusCode: result.httpStatusCode,
        responseTimeMs: result.responseTimeMs,
        lastCheckedAt: new Date(),
        checkError: result.error || null,
      },
    });
  }

  /**
   * Run scans for all organizations that have infra monitoring enabled
   */
  async runScheduledScans() {
    const configs = await prisma.infraMonitorConfig.findMany({
      where: { isEnabled: true },
    });

    for (const config of configs) {
      try {
        // Check if there's already a running scan for this org
        const running = await prisma.infraMonitorScanLog.findFirst({
          where: { organizationId: config.organizationId, status: 'running' },
        });
        if (running) {
          logger.info(`Skipping scheduled scan for org ${config.organizationId} - scan already running`);
          continue;
        }

        await this.runFullScan(config.organizationId, 'cron');
      } catch (error) {
        logger.error(`Scheduled scan failed for org ${config.organizationId}:`, error);
      }
    }
  }
}

export const infraMonitorService = new InfraMonitorService();
